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
    if (!s) return 0n; // empty = no cutoff (contract accepts all timestamps when cutoff is 0)
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

    // Disconnect on every page visit so users experience the full connect flow each time
    useEffect(() => { disconnect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    const [cutoffDate,  setCutoffDate]  = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
        setCutoffDate("");
        setSelectedIds([]);
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
                        <div className="space-y-4">
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
                                className="w-full sm:w-auto flex items-center justify-center gap-1.5
                                           bg-accent text-[0.85rem] font-semibold px-5 py-3 rounded-xl
                                           hover:opacity-90 transition-opacity"
                                style={{ color: "#fff" }}
                            >
                                <span className="text-base leading-none">+</span>
                                New pass
                            </button>
                        </div>

                        {/* Wallet status — contextual, only when connected */}
                        {isConnected && address && (
                            <div className="flex items-center justify-between px-0.5">
                                <span className="font-mono text-[0.67rem] text-muted-2">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green mr-1.5 align-middle" />
                                    {address.slice(0, 6)}…{address.slice(-4)}
                                </span>
                                <button
                                    onClick={() => disconnect()}
                                    className="font-mono text-[0.67rem] text-muted-2 hover:text-muted transition-colors"
                                >
                                    Disconnect
                                </button>
                            </div>
                        )}

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
                            <div className="space-y-4">

                                {/* Confirmation badge */}
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-green/15 border border-green/30
                                                     flex items-center justify-center text-green text-[0.7rem]
                                                     flex-shrink-0">✓</span>
                                    <p className="text-[0.88rem] font-semibold text-green">Live on Base Sepolia</p>
                                </div>

                                {/* Share link card */}
                                <div className="rounded-2xl border border-green/20 bg-green/5 overflow-hidden">
                                    <p className="px-4 pt-3 text-[0.63rem] font-mono uppercase tracking-widest text-green/60">
                                        Share this link with your community
                                    </p>
                                    <p className="px-4 pt-1 pb-3 font-mono text-[0.72rem] text-green/80 break-all leading-relaxed">
                                        {verifyUrl}
                                    </p>
                                    <div className="border-t border-green/15 flex">
                                        <button
                                            onClick={() => navigator.clipboard.writeText(verifyUrl)}
                                            className="flex-1 py-2.5 text-[0.8rem] font-medium text-green/70
                                                       hover:bg-green/8 hover:text-green transition-colors
                                                       cursor-pointer border-r border-green/15"
                                        >
                                            Copy link
                                        </button>
                                        <a
                                            href={verifyUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-1 py-2.5 text-[0.8rem] font-medium text-green/70
                                                       hover:bg-green/8 hover:text-green transition-colors text-center"
                                        >
                                            Preview ↗
                                        </a>
                                    </div>
                                </div>

                                {/* Primary action */}
                                <Link
                                    href={`/dashboard?contract=${deployedAddr}${name.trim() ? `&name=${encodeURIComponent(name.trim())}` : ""}`}
                                    className="flex items-center justify-between w-full rounded-2xl
                                               border border-border bg-surface px-4 py-3.5
                                               hover:border-accent/40 hover:bg-surface-2/60 transition-colors group"
                                >
                                    <div>
                                        <p className="text-[0.88rem] font-semibold text-text">View verified wallets</p>
                                        <p className="text-[0.72rem] text-muted mt-0.5">See who claimed a pass, export to CSV</p>
                                    </div>
                                    <span className="text-muted-2 group-hover:text-accent transition-colors">→</span>
                                </Link>

                                {/* Secondary links */}
                                <div className="flex items-center justify-end px-1">
                                    <a
                                        href={`https://sepolia.basescan.org/tx/${deployedTx}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[0.75rem] text-muted-2 hover:text-muted transition-colors"
                                    >
                                        View transaction ↗
                                    </a>
                                </div>
                            </div>
                        ) : (
                            /* ── Form ─────────────────────────────────────── */
                            <>
                            <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">

                                {/* Pass name */}
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Pass name (optional)"
                                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-3
                                               text-[0.95rem] text-text placeholder:text-muted-2
                                               outline-none focus:border-accent/50 transition-colors"
                                />

                                {/* Criteria — always visible */}
                                <div className="rounded-xl border border-border bg-bg px-4 py-4 space-y-4 overflow-x-hidden">

                                    {/* Account cutoff */}
                                    <div className="space-y-1.5">
                                        <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                            Account cutoff
                                        </label>
                                        <input
                                            type="date"
                                            value={cutoffDate}
                                            onChange={e => setCutoffDate(e.target.value)}
                                            style={{ maxWidth: "100%" }}
                                            className="w-full bg-surface border border-border-h rounded-xl
                                                       px-3.5 py-2.5 text-[0.82rem] text-text
                                                       outline-none focus:border-accent/50
                                                       transition-colors [color-scheme:dark]"
                                        />
                                        <p className="text-[0.68rem] text-muted-2">
                                            {cutoffDate ? "Account must have been registered before this date." : "No date restriction."}
                                        </p>
                                    </div>

                                    {/* Exchange filter */}
                                    <div className="space-y-2">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                                Exchange
                                            </label>
                                            <span className="text-[0.67rem] text-muted-2">
                                                {selectedIds.length === 0 ? "Any exchange" : `${selectedIds.length} selected`}
                                            </span>
                                        </div>
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
                                                ? "No restriction — any supported exchange qualifies."
                                                : `Restricted to ${EXCHANGE_OPTIONS.filter(e => selectedIds.includes(e.id)).map(e => e.label).join(", ")} only.`}
                                        </p>
                                    </div>
                                </div>

                                {/* Create pass — opens wallet modal if not connected, deploys if connected */}
                                <ConnectKitButton.Custom>
                                    {({ show }) => (
                                        <button
                                            onClick={isConnected ? handleDeploy : show}
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
                                    )}
                                </ConnectKitButton.Custom>

                                {phase === "error" && (
                                    <div className="rounded-xl border border-red/25 bg-red/5 px-4 py-3">
                                        <p className="font-mono text-[0.72rem] text-red">{errorMsg}</p>
                                    </div>
                                )}
                            </div>

                            {/* Disconnect — outside the form, subtle escape hatch */}
                            {isConnected && address && (
                                <div className="flex items-center justify-between px-1 pt-1">
                                    <span className="font-mono text-[0.67rem] text-muted-2">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green mr-1.5 align-middle" />
                                        {address.slice(0, 8)}…{address.slice(-6)}
                                    </span>
                                    <button
                                        onClick={() => disconnect()}
                                        className="font-mono text-[0.67rem] text-muted-2 hover:text-muted transition-colors cursor-pointer"
                                    >
                                        Wrong wallet? Disconnect
                                    </button>
                                </div>
                            )}
                            </>
                        )}
                    </>
                )}

            </main>
        </div>
    );
}
