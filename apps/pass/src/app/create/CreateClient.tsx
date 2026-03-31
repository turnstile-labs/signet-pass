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

// ── localStorage ──────────────────────────────────────────────────────────────

interface SavedPass { contract: string; name: string; owner: string; createdAt: number; }
const STORAGE_KEY = "signet_passes_v1";

function loadSaved(): SavedPass[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function persistPasses(passes: SavedPass[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(passes)); } catch { /* ignore */ }
}

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

// ── Main ──────────────────────────────────────────────────────────────────────

export function CreateClient() {
    const { address, isConnected } = useAccount();
    const { data: walletClient }   = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }     = useSwitchChain();
    const { disconnect }           = useDisconnect();
    const { data: capabilities }   = useCapabilities();
    const { writeContractsAsync }  = useWriteContracts();

    // ── View: "list" | "create" ───────────────────────────────────────────────
    const [view, setView] = useState<"list" | "create">("list");

    useEffect(() => {
        const p = new URLSearchParams(window.location.search).get("tab");
        if (p === "create") setView("create");
    }, []);

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

    // ── Deploy ────────────────────────────────────────────────────────────────
    const [name,        setName]        = useState("");
    const [cutoffDate,  setCutoffDate]  = useState(oneYearAgo);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [advanced,    setAdvanced]    = useState(false);

    const toggleExchange = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

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

    const isDeployed = phase === "deployed";

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

    function resetCreate() {
        setPhase("idle");
        setDeployedAddr("");
        setDeployedTx("");
        setName("");
        setCutoffDate(oneYearAgo());
        setSelectedIds([]);
        setAdvanced(false);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-6">

                {/* ════════════════ LIST VIEW ════════════════ */}
                {view === "list" && (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-mono text-[0.63rem] uppercase tracking-widest text-muted-2 mb-2">
                                    Signet Pass
                                </p>
                                <h1 className="text-[2rem] sm:text-[2.2rem] font-bold tracking-tight text-white leading-[1.1]">
                                    My passes
                                </h1>
                                <p className="text-[0.82rem] text-muted mt-2">
                                    <span className="text-text/80 font-medium">For founders and community managers</span>
                                    {" "}— no code required.
                                </p>
                            </div>
                            <button
                                onClick={() => { resetCreate(); setView("create"); }}
                                className="flex-shrink-0 flex items-center gap-1.5 bg-accent text-[0.78rem]
                                           font-semibold px-3.5 py-2 rounded-xl hover:opacity-90
                                           transition-opacity mt-1"
                                style={{ color: "#fff" }}
                            >
                                <span className="text-base leading-none">+</span>
                                New pass
                            </button>
                        </div>

                        {/* Passes list */}
                        {!isConnected ? (
                            <div className="rounded-2xl border border-dashed border-border p-10
                                            flex flex-col items-center gap-5 text-center">
                                <p className="text-[0.88rem] text-muted">
                                    Connect your wallet to see your passes.
                                </p>
                                <ConnectKitButton.Custom>
                                    {({ show }) => (
                                        <button onClick={show}
                                            className="rounded-xl border border-border-h bg-surface
                                                       font-medium px-5 py-2.5 text-[0.85rem] text-text
                                                       hover:border-accent/50 hover:text-accent
                                                       transition-colors cursor-pointer">
                                            Connect wallet
                                        </button>
                                    )}
                                </ConnectKitButton.Custom>
                            </div>
                        ) : myPassesLoading ? (
                            <div className="flex items-center gap-2.5 py-8 text-[0.82rem] text-muted-2">
                                <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Looking up your passes…
                            </div>
                        ) : myPasses.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border p-10
                                            flex flex-col items-center gap-4 text-center">
                                <p className="text-[0.88rem] text-muted">No passes yet.</p>
                                <button
                                    onClick={() => { resetCreate(); setView("create"); }}
                                    className="text-[0.82rem] font-medium text-accent
                                               hover:text-accent/80 transition-colors cursor-pointer"
                                >
                                    Create your first pass →
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-border bg-surface
                                            divide-y divide-border overflow-hidden">
                                {myPasses.map(p => (
                                    <div key={p.contract}
                                         className="flex items-center justify-between px-4 py-4 gap-4">
                                        <div className="min-w-0">
                                            {p.name && (
                                                <p className="text-[0.88rem] font-medium text-text truncate mb-0.5">
                                                    {p.name}
                                                </p>
                                            )}
                                            <p className="font-mono text-[0.68rem] text-muted-2">
                                                {p.contract.slice(0, 10)}…{p.contract.slice(-8)}
                                            </p>
                                            {p.deployedAt > 0 && (
                                                <p className="font-mono text-[0.63rem] text-muted-2/70 mt-0.5">
                                                    {new Date(p.deployedAt * 1000).toLocaleDateString("en-US", {
                                                        month: "short", day: "numeric", year: "numeric",
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                        <Link
                                            href={`/dashboard?contract=${p.contract}${p.name ? `&name=${encodeURIComponent(p.name)}` : ""}`}
                                            className="flex-shrink-0 text-[0.78rem] font-medium text-accent
                                                       hover:text-accent/80 transition-colors"
                                        >
                                            View allowlist →
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ════════════════ CREATE VIEW ════════════════ */}
                {view === "create" && (
                    <>
                        {/* Back link */}
                        <button
                            onClick={() => { resetCreate(); setView("list"); }}
                            className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted
                                       hover:text-text transition-colors cursor-pointer"
                        >
                            ← My passes
                        </button>

                        {/* Header */}
                        <div>
                            <h1 className="text-[2rem] sm:text-[2.2rem] font-bold tracking-tight
                                           text-white leading-[1.1]">
                                {isDeployed ? "Pass created" : "New pass"}
                            </h1>
                            {!isDeployed && (
                                <p className="text-[0.82rem] text-muted mt-2">
                                    One transaction on Base Sepolia. Share the link — users verify
                                    their exchange history to get in.
                                </p>
                            )}
                        </div>

                        {/* ── Success state ───────────────────────────────── */}
                        {isDeployed ? (
                            <div className="space-y-5">
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-green/15 border border-green/30
                                                     flex items-center justify-center text-green text-[0.7rem]
                                                     flex-shrink-0">✓</span>
                                    <p className="text-[0.9rem] font-semibold text-green">Live on Base Sepolia</p>
                                </div>

                                <div className="rounded-2xl border border-green/20 bg-green/5 overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-green/15
                                                    flex items-center justify-between">
                                        <p className="text-[0.63rem] font-mono uppercase tracking-widest text-green/70">
                                            Share this link
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => navigator.clipboard.writeText(verifyUrl)}
                                                className="text-[0.7rem] font-mono text-green/70 hover:text-green
                                                           transition-colors cursor-pointer"
                                            >
                                                Copy
                                            </button>
                                            <a href={verifyUrl} target="_blank" rel="noopener noreferrer"
                                               className="text-[0.7rem] font-mono text-green/70 hover:text-green transition-colors">
                                                Open ↗
                                            </a>
                                        </div>
                                    </div>
                                    <p className="px-4 py-3 font-mono text-[0.72rem] text-green/80 break-all leading-relaxed">
                                        {verifyUrl}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                    <Link
                                        href={`/dashboard?contract=${deployedAddr}${name.trim() ? `&name=${encodeURIComponent(name.trim())}` : ""}`}
                                        className="text-[0.84rem] font-medium text-accent hover:text-accent/80 transition-colors"
                                    >
                                        View allowlist →
                                    </Link>
                                    <button
                                        onClick={() => { resetCreate(); setView("list"); }}
                                        className="text-[0.78rem] text-muted hover:text-text transition-colors cursor-pointer"
                                    >
                                        ← My passes
                                    </button>
                                    <a href={`https://sepolia.basescan.org/tx/${deployedTx}`}
                                       target="_blank" rel="noopener noreferrer"
                                       className="text-[0.72rem] font-mono text-muted-2 hover:text-muted transition-colors">
                                        Transaction ↗
                                    </a>
                                </div>
                            </div>
                        ) : (
                            /* ── Form ─────────────────────────────────────── */
                            <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">

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
                                        placeholder="e.g. OG Holders, Presale Round 1"
                                        className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5
                                                   text-[0.88rem] text-text placeholder:text-muted-2
                                                   outline-none focus:border-accent/50 transition-colors"
                                    />
                                </div>

                                {/* Connect wallet */}
                                {!isConnected && (
                                    <ConnectKitButton.Custom>
                                        {({ show }) => (
                                            <button onClick={show}
                                                className="w-full rounded-xl border border-border-h bg-surface-2
                                                           font-medium py-3 text-[0.88rem] text-text
                                                           hover:border-accent/50 hover:text-accent
                                                           transition-colors cursor-pointer">
                                                Connect wallet to continue
                                            </button>
                                        )}
                                    </ConnectKitButton.Custom>
                                )}

                                {/* Advanced + deploy */}
                                {isConnected && (
                                    <>
                                        <div>
                                            <button
                                                onClick={() => setAdvanced(v => !v)}
                                                className="flex items-center gap-1.5 text-[0.74rem] text-muted
                                                           hover:text-text transition-colors cursor-pointer"
                                            >
                                                <span className={`transition-transform duration-150 text-[0.6rem] ${advanced ? "rotate-90" : ""}`}>▸</span>
                                                Settings
                                                {!advanced && (
                                                    <span className="font-mono text-[0.65rem] text-muted-2 ml-1 truncate">
                                                        — cutoff: {cutoffDate} ·{" "}
                                                        {selectedIds.length === 0
                                                            ? "any exchange"
                                                            : selectedIds.length === 1
                                                                ? EXCHANGE_OPTIONS.find(e => e.id === selectedIds[0])?.label
                                                                : `${selectedIds.length} exchanges`}
                                                    </span>
                                                )}
                                            </button>

                                            {advanced && (
                                                <div className="mt-3 rounded-xl border border-border bg-bg px-4 py-4 space-y-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                                            Account cutoff
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={cutoffDate}
                                                            onChange={e => setCutoffDate(e.target.value)}
                                                            className="w-full bg-surface border border-border rounded-xl
                                                                       px-3.5 py-2.5 text-[0.82rem] text-text
                                                                       outline-none focus:border-accent/50
                                                                       transition-colors [color-scheme:dark]"
                                                        />
                                                        <p className="text-[0.68rem] text-muted-2">
                                                            Only accounts registered before this date qualify.
                                                        </p>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                                            Exchange filter
                                                            <span className="ml-2 normal-case tracking-normal text-muted-2">
                                                                — leave empty to accept all
                                                            </span>
                                                        </label>
                                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                                            {EXCHANGE_OPTIONS.map(ex => {
                                                                const on = selectedIds.includes(ex.id);
                                                                return (
                                                                    <button
                                                                        key={ex.id}
                                                                        onClick={() => toggleExchange(ex.id)}
                                                                        className={`rounded-xl border px-2 py-2.5 text-left
                                                                                    transition-colors cursor-pointer ${
                                                                            on
                                                                                ? "border-accent/50 bg-accent/10 text-accent"
                                                                                : "border-border bg-surface hover:border-border-h text-muted"
                                                                        }`}
                                                                    >
                                                                        <p className="text-[0.74rem] font-medium leading-tight">{ex.label}</p>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        <p className="text-[0.68rem] text-muted-2">
                                                            {selectedIds.length === 0
                                                                ? "Any supported exchange qualifies."
                                                                : `Only ${EXCHANGE_OPTIONS.filter(e => selectedIds.includes(e.id)).map(e => e.label).join(", ")} accounts qualify.`}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2 pt-1">
                                            <div className="flex items-center justify-between">
                                                <p className="font-mono text-[0.68rem] text-muted-2">
                                                    {address!.slice(0, 8)}…{address!.slice(-6)}
                                                </p>
                                                <button
                                                    onClick={() => disconnect()}
                                                    className="font-mono text-[0.68rem] text-muted-2 hover:text-muted
                                                               transition-colors cursor-pointer"
                                                >
                                                    Disconnect
                                                </button>
                                            </div>
                                            <button
                                                onClick={handleDeploy}
                                                disabled={phase === "deploying" || !FACTORY_ADDRESS}
                                                className="w-full rounded-xl bg-accent font-semibold py-3 text-[0.9rem]
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

                                        {phase === "error" && (
                                            <div className="rounded-xl border border-red/25 bg-red/5 px-4 py-3">
                                                <p className="font-mono text-[0.72rem] text-red">{errorMsg}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}

            </main>
        </div>
    );
}
