"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { createPublicClient, http } from "viem";
import { useAccount, useWalletClient, useSwitchChain, useDisconnect } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { waitForCallsStatus } from "viem/experimental";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import { SiteNav } from "@/components/SiteNav";
import {
    getPublicClient,
    FACTORY_ADDRESS,
    SIGNET_PASS_FACTORY_ABI,
    SUPPORTED_EXCHANGES,
    exchangeIdsToHashes,
} from "@/lib/wagmi";

const EXCHANGE_OPTIONS = SUPPORTED_EXCHANGES.filter(e => e.id !== "any");

// ── localStorage helpers ───────────────────────────────────────────────────────

interface SavedPass { contract: string; name: string; owner: string; createdAt: number; }
const STORAGE_KEY = "signet_passes_v1";

function loadSaved(): SavedPass[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function persistPasses(passes: SavedPass[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(passes)); } catch { /* ignore */ }
}

// Public RPC for log queries — no block-range limits.
const logsClient = createPublicClient({
    chain:     baseSepolia,
    transport: http("https://sepolia.base.org"),
});

const PASS_DEPLOYED_EVENT = {
    anonymous: false,
    inputs: [
        { indexed: true,  name: "pass",          type: "address"   },
        { indexed: true,  name: "owner",         type: "address"   },
        { indexed: false, name: "cutoff",        type: "uint256"   },
        { indexed: false, name: "allowedHashes", type: "uint256[]" },
        { indexed: false, name: "feePerCheck",   type: "uint256"   },
    ],
    name: "PassDeployed",
    type: "event",
} as const;

interface MyPass { contract: string; name: string; deployedAt: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function oneYearAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
}

function dateToUnix(s: string): bigint {
    return BigInt(Math.floor(new Date(s + "T00:00:00Z").getTime() / 1000));
}

const _alchemyKey   = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const PAYMASTER_URL = _alchemyKey ? `https://base-sepolia.g.alchemy.com/v2/${_alchemyKey}` : "";
const PASS_URL_ENV  = process.env.NEXT_PUBLIC_PASS_URL ?? "";

function buildVerifyUrl(contract: string, name: string): string {
    const base = PASS_URL_ENV || (typeof window !== "undefined" ? window.location.origin : "");
    const p = new URLSearchParams({ contract });
    if (name.trim()) p.set("name", name.trim());
    return `${base}/verify?${p.toString()}`;
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 font-mono text-[0.68rem] px-2 py-0.5 rounded
                       text-muted-2 hover:text-accent hover:bg-accent/8 transition-colors cursor-pointer"
        >
            {copied ? "✓ copied" : (label ?? "copy")}
        </button>
    );
}

// ── Page component ────────────────────────────────────────────────────────────

export function CreateClient() {
    const { address, isConnected } = useAccount();
    const { data: walletClient }   = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }     = useSwitchChain();
    const { disconnect }           = useDisconnect();
    const { data: capabilities }   = useCapabilities();
    const { writeContractsAsync }  = useWriteContracts();

    // ── Page tab ─────────────────────────────────────────────────────────────

    const [pageTab, setPageTab] = useState<"create" | "my-passes">("my-passes");

    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("tab");
        if (t === "create") setPageTab("create");
    }, []);

    // ── Form state ────────────────────────────────────────────────────────────

    const [name,        setName]        = useState("");
    const [cutoffDate,  setCutoffDate]  = useState(oneYearAgo);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [advanced,    setAdvanced]    = useState(false);

    const toggleExchange = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    // ── Deploy state ──────────────────────────────────────────────────────────

    type Phase = "idle" | "deploying" | "deployed" | "error";
    const [phase,        setPhase]        = useState<Phase>("idle");
    const [deployedAddr, setDeployedAddr] = useState("");
    const [deployedTx,   setDeployedTx]   = useState("");
    const [errorMsg,     setErrorMsg]     = useState("");
    const [verifyUrl,    setVerifyUrl]    = useState("");

    useEffect(() => {
        if (deployedAddr) setVerifyUrl(buildVerifyUrl(deployedAddr, name));
        else setVerifyUrl("");
    }, [deployedAddr, name]);

    // ── My passes ─────────────────────────────────────────────────────────────

    const [myPasses,        setMyPasses]        = useState<MyPass[]>([]);
    const [myPassesLoading, setMyPassesLoading] = useState(false);

    useEffect(() => {
        if (!address) { setMyPasses([]); return; }
        setMyPassesLoading(true);
        (async () => {
            try {
                const CHUNK        = 9_000n;
                const MAX_LOOKBACK = 500_000n;
                const latest       = await logsClient.getBlockNumber();
                const start        = latest > MAX_LOOKBACK ? latest - MAX_LOOKBACK : 0n;

                const chunks: Array<{ from: bigint; to: bigint }> = [];
                let to = latest;
                while (to >= start) {
                    const from = to >= start + CHUNK ? to - CHUNK + 1n : start;
                    chunks.push({ from, to });
                    if (from <= start) break;
                    to = from - 1n;
                }

                const results = await Promise.all(
                    chunks.map(({ from, to: t }) =>
                        logsClient.getLogs({
                            address:   FACTORY_ADDRESS,
                            event:     PASS_DEPLOYED_EVENT,
                            args:      { owner: address },
                            fromBlock: from,
                            toBlock:   t,
                        })
                    )
                );
                const logs = results.flat();

                const uniqueBlocks = [...new Set(logs.map(l => l.blockNumber!))];
                const blockMap     = new Map<bigint, number>();
                await Promise.all(
                    uniqueBlocks.map(async (bn) => {
                        const block = await logsClient.getBlock({ blockNumber: bn, includeTransactions: false });
                        blockMap.set(bn, Number(block.timestamp));
                    })
                );

                const saved = loadSaved();
                const passes: MyPass[] = logs
                    .map(log => {
                        const contract = log.args.pass as string;
                        const s = saved.find(p => p.contract.toLowerCase() === contract.toLowerCase());
                        return { contract, name: s?.name ?? "", deployedAt: blockMap.get(log.blockNumber!) ?? 0 };
                    })
                    .sort((a, b) => b.deployedAt - a.deployedAt);

                setMyPasses(passes);
            } catch (e) {
                console.error("Failed to fetch passes:", e);
            } finally {
                setMyPassesLoading(false);
            }
        })();
    }, [address]);

    // ── Deploy handler ────────────────────────────────────────────────────────

    const handleDeploy = useCallback(async () => {
        if (!walletClient || !address) return;
        setPhase("deploying");
        setErrorMsg("");
        try {
            await switchChainAsync({ chainId: baseSepolia.id });
            const cutoffUnix    = dateToUnix(cutoffDate);
            const allowedHashes = exchangeIdsToHashes(selectedIds);

            const { result: newAddr } = await getPublicClient().simulateContract({
                address:      FACTORY_ADDRESS,
                abi:          SIGNET_PASS_FACTORY_ABI,
                functionName: "deploy",
                args:         [cutoffUnix, allowedHashes, address],
                account:      address,
            });

            const contractCall = {
                address:      FACTORY_ADDRESS,
                abi:          SIGNET_PASS_FACTORY_ABI,
                functionName: "deploy" as const,
                args:         [cutoffUnix, allowedHashes, address] as const,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chainCaps    = (capabilities as any)?.[baseSepolia.id];
            const usePaymaster = !!(chainCaps?.paymasterService?.supported && PAYMASTER_URL);
            let txHash: `0x${string}`;

            if (usePaymaster) {
                const callsResult = await writeContractsAsync({
                    contracts:    [contractCall],
                    capabilities: { paymasterService: { url: PAYMASTER_URL } },
                });
                const callsId = typeof callsResult === "string" ? callsResult : callsResult.id;
                const result  = await waitForCallsStatus(walletClient, {
                    id: callsId, timeout: 120_000, pollingInterval: 2_000, throwOnFailure: true,
                });
                txHash = result?.receipts?.[0]?.transactionHash as `0x${string}`;
                if (!txHash) throw new Error("No receipt hash.");
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                txHash = await (walletClient.writeContract as any)({
                    ...contractCall, account: address,
                }) as `0x${string}`;
                await getPublicClient().waitForTransactionReceipt({ hash: txHash });
            }

            setDeployedAddr(newAddr as string);
            setDeployedTx(txHash);
            setPhase("deployed");

            const saved   = loadSaved();
            const updated = saved.filter(p => p.contract.toLowerCase() !== (newAddr as string).toLowerCase());
            updated.push({ contract: newAddr as string, name, owner: address, createdAt: Date.now() });
            persistPasses(updated);
            setMyPasses(prev => [
                { contract: newAddr as string, name, deployedAt: Math.floor(Date.now() / 1000) },
                ...prev.filter(p => p.contract.toLowerCase() !== (newAddr as string).toLowerCase()),
            ]);
        } catch (e) {
            console.error(e);
            const short = e instanceof Error ? e.message.split("\n")[0] : String(e);
            setErrorMsg(short.length > 120 ? short.slice(0, 120) + "…" : short);
            setPhase("error");
        }
    }, [walletClient, address, cutoffDate, selectedIds, switchChainAsync, capabilities, writeContractsAsync, name]);

    const isDeployed = phase === "deployed";

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 space-y-8">

                {/* ── Header ────────────────────────────────────────────────── */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-3">
                        Signet Pass
                    </p>
                    <h1 className="text-[2rem] sm:text-[2.4rem] font-bold tracking-tight text-white leading-[1.1] mb-3">
                        {pageTab === "create" ? "New pass" : "My passes"}
                    </h1>
                    <p className="text-[0.88rem] text-muted leading-relaxed">
                        <span className="text-text font-medium">For founders and community managers</span>
                        {" "}— deploy a pass, share the link, and see who verified. No code required.
                    </p>
                </div>

                {/* ── Tab bar ───────────────────────────────────────────────── */}
                <div className="flex border-b border-border -mb-4">
                    {([
                        { id: "my-passes" as const, label: "My passes" },
                        { id: "create"    as const, label: "New pass"   },
                    ] as const).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setPageTab(t.id)}
                            className={`relative px-4 pb-3 text-[0.85rem] font-medium transition-colors
                                        cursor-pointer flex items-center gap-2 ${
                                pageTab === t.id
                                    ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent after:rounded-t"
                                    : "text-muted hover:text-text"
                            }`}
                        >
                            {t.label}
                            {t.id === "my-passes" && myPassesLoading && (
                                <svg className="animate-spin w-3 h-3 text-muted-2" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            {t.id === "my-passes" && !myPassesLoading && myPasses.length > 0 && (
                                <span className="font-mono text-[0.62rem] bg-accent/15 text-accent
                                                 border border-accent/20 px-1.5 py-0.5 rounded-full leading-none">
                                    {myPasses.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ── My passes tab ─────────────────────────────────────────── */}
                {pageTab === "my-passes" && (
                    <div className="space-y-3 pt-2">
                        {!isConnected ? (
                            <div className="rounded-xl border border-border bg-surface p-8 flex flex-col items-center gap-4 text-center">
                                <p className="text-[0.9rem] text-muted">Connect your wallet to see your passes.</p>
                                <ConnectKitButton.Custom>
                                    {({ show }) => (
                                        <button onClick={show}
                                            className="rounded-lg border border-border-h bg-surface-2 font-medium
                                                       px-5 py-2.5 text-[0.85rem] text-text hover:border-accent/50
                                                       hover:text-accent transition-colors cursor-pointer">
                                            Connect wallet
                                        </button>
                                    )}
                                </ConnectKitButton.Custom>
                            </div>
                        ) : myPassesLoading ? (
                            <div className="flex items-center gap-2.5 py-6 text-[0.82rem] text-muted-2">
                                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Looking up your passes…
                            </div>
                        ) : myPasses.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-8 flex flex-col items-center gap-4 text-center">
                                <p className="text-[0.9rem] text-muted">No passes yet.</p>
                                <button
                                    onClick={() => setPageTab("create")}
                                    className="font-mono text-[0.78rem] text-accent hover:text-accent/80
                                               transition-colors cursor-pointer"
                                >
                                    New pass →
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border">
                                {myPasses.map(p => (
                                    <div key={p.contract} className="flex items-center justify-between px-4 py-3.5 gap-4">
                                        <div className="min-w-0">
                                            {p.name && (
                                                <p className="text-[0.82rem] font-medium text-text truncate">{p.name}</p>
                                            )}
                                            <p className="font-mono text-[0.68rem] text-muted-2">
                                                {p.contract.slice(0, 10)}…{p.contract.slice(-8)}
                                            </p>
                                            {p.deployedAt > 0 && (
                                                <p className="font-mono text-[0.65rem] text-muted-2/70">
                                                    {new Date(p.deployedAt * 1000).toLocaleDateString("en-US", {
                                                        month: "short", day: "numeric", year: "numeric",
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                        <Link
                                            href={`/dashboard?contract=${p.contract}${p.name ? `&name=${encodeURIComponent(p.name)}` : ""}`}
                                            className="flex-shrink-0 font-mono text-[0.72rem] text-accent hover:text-accent/80 transition-colors"
                                        >
                                            Dashboard →
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Create tab ────────────────────────────────────────────── */}
                {pageTab === "create" && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[0.85rem] font-semibold text-text">
                                {isDeployed ? "Pass created" : "Create your pass"}
                            </p>
                            {isDeployed
                                ? <span className="font-mono text-[0.65rem] text-green bg-green/8 border border-green/20 px-2 py-0.5 rounded-full">✓ Live</span>
                                : <span className="text-[0.72rem] text-muted">One transaction on Base</span>
                            }
                        </div>

                        <div className={`rounded-xl border bg-surface p-5 space-y-4 transition-colors ${
                            isDeployed ? "border-green/25" : "border-border"
                        }`}>

                            {isDeployed ? (
                                <div className="space-y-2.5">
                                    {/* Share link */}
                                    <div className="rounded-lg border border-border overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                                            <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">
                                                Share link
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <CopyBtn text={verifyUrl} label="copy link" />
                                                <a href={verifyUrl} target="_blank" rel="noopener noreferrer"
                                                   className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                                                    ↗
                                                </a>
                                            </div>
                                        </div>
                                        <p className="px-3 py-2 font-mono text-[0.7rem] text-muted break-all">
                                            {verifyUrl}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-4 pt-1 flex-wrap">
                                        <Link
                                            href={`/dashboard?contract=${deployedAddr}${name.trim() ? `&name=${encodeURIComponent(name.trim())}` : ""}`}
                                            className="font-mono text-[0.68rem] text-accent hover:text-accent/80 transition-colors font-medium"
                                        >
                                            View dashboard →
                                        </Link>
                                        <a href={`https://sepolia.basescan.org/tx/${deployedTx}`}
                                           target="_blank" rel="noopener noreferrer"
                                           className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                                            Transaction ↗
                                        </a>
                                        <button
                                            onClick={() => {
                                                setPhase("idle");
                                                setDeployedAddr("");
                                                setDeployedTx("");
                                                setName("");
                                                setCutoffDate(oneYearAgo());
                                                setSelectedIds([]);
                                            }}
                                            className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors cursor-pointer"
                                        >
                                            Create another →
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Pass name */}
                                    <div className="space-y-1.5">
                                        <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                            Pass name{" "}
                                            <span className="normal-case tracking-normal">(optional)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            placeholder="My Project"
                                            className="w-full bg-bg border border-border rounded-lg px-3 py-2
                                                       text-[0.88rem] text-text placeholder:text-muted-2
                                                       outline-none focus:border-accent/50 transition-colors font-mono"
                                        />
                                    </div>

                                    {/* Connect wallet */}
                                    {!isConnected && (
                                        <ConnectKitButton.Custom>
                                            {({ show }) => (
                                                <button onClick={show}
                                                    className="w-full rounded-lg border border-border-h bg-surface-2
                                                               font-medium py-2.5 text-[0.88rem] text-text
                                                               hover:border-accent/50 hover:text-accent
                                                               transition-colors cursor-pointer">
                                                    Connect wallet
                                                </button>
                                            )}
                                        </ConnectKitButton.Custom>
                                    )}

                                    {/* Advanced settings */}
                                    {isConnected && (
                                        <div>
                                            <button
                                                onClick={() => setAdvanced(v => !v)}
                                                className="flex items-center gap-1.5 text-[0.72rem] text-muted
                                                           hover:text-text transition-colors cursor-pointer"
                                            >
                                                <span className={`transition-transform duration-150 ${advanced ? "rotate-90" : ""}`}>▸</span>
                                                Advanced settings
                                                {!advanced && (
                                                    <span className="font-mono text-[0.65rem] text-muted-2 ml-1">
                                                        (cutoff: {cutoffDate} ·{" "}
                                                        {selectedIds.length === 0
                                                            ? "any exchange"
                                                            : selectedIds.length === 1
                                                                ? EXCHANGE_OPTIONS.find(e => e.id === selectedIds[0])?.label
                                                                : `${selectedIds.length} exchanges`
                                                        })
                                                    </span>
                                                )}
                                            </button>
                                            {advanced && (
                                                <div className="mt-3 rounded-xl border border-border bg-bg px-4 py-4 space-y-4">
                                                    {/* Cutoff date */}
                                                    <div className="space-y-1.5">
                                                        <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                                            Account cutoff
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={cutoffDate}
                                                            onChange={e => setCutoffDate(e.target.value)}
                                                            className="w-full bg-surface border border-border rounded-lg px-3 py-2
                                                                       text-[0.82rem] text-text outline-none focus:border-accent/50
                                                                       transition-colors font-mono [color-scheme:dark]"
                                                        />
                                                        <p className="text-[0.68rem] text-muted-2">
                                                            Only accounts with an email older than this date qualify.
                                                        </p>
                                                    </div>
                                                    {/* Exchange filter */}
                                                    <div className="space-y-2">
                                                        <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                                            Exchange filter
                                                            <span className="ml-2 normal-case tracking-normal text-muted-2">
                                                                — leave empty to accept all
                                                            </span>
                                                        </label>
                                                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                                                            {EXCHANGE_OPTIONS.map(ex => {
                                                                const on = selectedIds.includes(ex.id);
                                                                return (
                                                                    <button
                                                                        key={ex.id}
                                                                        onClick={() => toggleExchange(ex.id)}
                                                                        className={`rounded-lg border px-2 py-2 text-left transition-colors cursor-pointer
                                                                            ${on
                                                                                ? "border-accent/50 bg-accent/10 text-accent"
                                                                                : "border-border bg-surface hover:border-border-h text-muted"
                                                                            }`}
                                                                    >
                                                                        <p className="text-[0.72rem] font-medium leading-tight">{ex.label}</p>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        <p className="text-[0.68rem] text-muted-2">
                                                            {selectedIds.length === 0
                                                                ? "No filter — any supported exchange qualifies."
                                                                : `Only ${EXCHANGE_OPTIONS.filter(e => selectedIds.includes(e.id)).map(e => e.label).join(", ")} accounts qualify.`
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Deploy button */}
                                    {isConnected && (
                                        <div className="space-y-2">
                                            {address && (
                                                <div className="flex items-center justify-between">
                                                    <p className="font-mono text-[0.68rem] text-muted-2">
                                                        {address.slice(0, 8)}…{address.slice(-6)}
                                                    </p>
                                                    <button
                                                        onClick={() => disconnect()}
                                                        className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors cursor-pointer"
                                                    >
                                                        Disconnect
                                                    </button>
                                                </div>
                                            )}
                                            <button
                                                onClick={handleDeploy}
                                                disabled={phase === "deploying" || !FACTORY_ADDRESS}
                                                className="w-full rounded-lg bg-accent font-semibold py-2.5 text-[0.88rem]
                                                           hover:opacity-90 transition-opacity disabled:opacity-50
                                                           disabled:cursor-not-allowed cursor-pointer"
                                                style={{ color: "#fff" }}
                                            >
                                                {phase === "deploying" ? (
                                                    <span className="flex items-center justify-center gap-2">
                                                        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                        </svg>
                                                        Creating…
                                                    </span>
                                                ) : "Create pass →"}
                                            </button>
                                        </div>
                                    )}

                                    {phase === "error" && (
                                        <div className="rounded-lg border border-red/25 bg-red/5 px-4 py-3">
                                            <p className="font-mono text-[0.72rem] text-red">{errorMsg}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
