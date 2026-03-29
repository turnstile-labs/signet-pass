"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "wagmi/chains";
import { isValidAddress, SIGNET_PASS_ABI } from "@/lib/wagmi";

// Use the public RPC for log queries — Alchemy free tier limits eth_getLogs
// to 10 blocks, which breaks historical fetches. The public node has no such limit.
const logsClient = createPublicClient({
    chain:     baseSepolia,
    transport: http("https://sepolia.base.org"),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerifiedEntry {
    wallet:      string;
    timestamp:   number;
    txHash:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PASS_URL_ENV = process.env.NEXT_PUBLIC_PASS_URL ?? "";

function buildVerifyUrl(contract: string, name: string): string {
    const base = PASS_URL_ENV || (typeof window !== "undefined" ? window.location.origin : "https://pass.signet.xyz");
    const p = new URLSearchParams({ contract });
    if (name.trim()) p.set("name", name.trim());
    return `${base}/verify?${p.toString()}`;
}

function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// Reuse the exact ABI definition already in use elsewhere.
const VERIFIED_EVENT = SIGNET_PASS_ABI.find(
    (e): e is Extract<typeof SIGNET_PASS_ABI[number], { type: "event"; name: "Verified" }> =>
        e.type === "event" && e.name === "Verified"
)!;

// ── Sub-components ────────────────────────────────────────────────────────────

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

function Spinner() {
    return (
        <div className="w-4 h-4 relative flex-shrink-0">
            <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
            <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardClient() {
    const params   = useSearchParams();
    const contract = params.get("contract") ?? "";
    const name     = params.get("name") ?? "";

    const [entries,     setEntries]     = useState<VerifiedEntry[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState("");
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const verifyUrl = isValidAddress(contract) ? buildVerifyUrl(contract, name) : "";

    const fetchEntries = useCallback(async () => {
        if (!isValidAddress(contract)) {
            setError("Invalid contract address.");
            setLoading(false);
            return;
        }
        try {
            // Both Alchemy free and the public Base RPC cap eth_getLogs at ~10k blocks.
            // Paginate in 9,000-block chunks over the last 500k blocks (~11 days on Base Sepolia)
            // and fire all chunks in parallel so the total wait is one round-trip.
            const CHUNK        = 9_000n;
            const MAX_LOOKBACK = 500_000n;

            const latestBlock = await logsClient.getBlockNumber();
            const startBlock  = latestBlock > MAX_LOOKBACK ? latestBlock - MAX_LOOKBACK : 0n;

            const chunks: Array<{ from: bigint; to: bigint }> = [];
            let to = latestBlock;
            while (to >= startBlock) {
                const from = to >= startBlock + CHUNK ? to - CHUNK + 1n : startBlock;
                chunks.push({ from, to });
                if (from <= startBlock) break;
                to = from - 1n;
            }

            const chunkResults = await Promise.all(
                chunks.map(({ from, to: t }) =>
                    logsClient.getLogs({
                        address:   contract as `0x${string}`,
                        event:     VERIFIED_EVENT,
                        fromBlock: from,
                        toBlock:   t,
                    })
                )
            );
            const logs = chunkResults.flat();

            // Batch-fetch unique block timestamps.
            const uniqueBlocks = [...new Set(logs.map(l => l.blockNumber!))];
            const blockMap     = new Map<bigint, number>();
            await Promise.all(
                uniqueBlocks.map(async (bn) => {
                    const block = await logsClient.getBlock({ blockNumber: bn, includeTransactions: false });
                    blockMap.set(bn, Number(block.timestamp));
                })
            );

            const result: VerifiedEntry[] = logs
                .map(log => ({
                    wallet:    log.args.wallet as string,
                    timestamp: blockMap.get(log.blockNumber!) ?? 0,
                    txHash:    log.transactionHash ?? "",
                }))
                .sort((a, b) => b.timestamp - a.timestamp);

            setEntries(result);
            setLastRefresh(new Date());
            setError("");
        } catch (e) {
            console.error(e);
            setError("Failed to load on-chain data. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, [contract]);

    useEffect(() => {
        fetchEntries();
        const id = setInterval(fetchEntries, 30_000);
        return () => clearInterval(id);
    }, [fetchEntries]);

    function exportCsv() {
        const header = "wallet,verified_at,transaction\n";
        const rows   = entries
            .map(e => `${e.wallet},${new Date(e.timestamp * 1000).toISOString()},${e.txHash}`)
            .join("\n");
        const blob = new Blob([header + rows], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `${(name || contract.slice(0, 8)).replace(/\s+/g, "-")}-passes.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Invalid contract ──────────────────────────────────────────────────────

    if (!isValidAddress(contract)) {
        return (
            <div className="min-h-screen flex flex-col">
                <SiteNav />
                <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
                    <p className="text-[0.9rem] text-muted">No pass contract specified.</p>
                    <Link href="/developers" className="text-accent text-[0.82rem] hover:underline">
                        Create a pass →
                    </Link>
                </main>
            </div>
        );
    }

    // ── Dashboard ─────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 space-y-8">

                {/* Header */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-3">
                        Signet Pass · Dashboard
                    </p>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <h1 className="text-[1.8rem] font-bold tracking-tight text-white leading-tight">
                            {name || "Pass Dashboard"}
                        </h1>
                        <button
                            onClick={() => { setLoading(true); fetchEntries(); }}
                            className="font-mono text-[0.68rem] text-muted-2 hover:text-muted
                                       transition-colors cursor-pointer flex-shrink-0 mt-1.5"
                        >
                            ↻ Refresh
                        </button>
                    </div>
                    {lastRefresh && (
                        <p className="text-[0.68rem] text-muted-2 mt-1">
                            Updated {lastRefresh.toLocaleTimeString()} · auto-refreshes every 30s
                        </p>
                    )}
                </div>

                {/* Share link */}
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
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
                    <p className="px-4 py-2.5 font-mono text-[0.7rem] text-muted break-all">
                        {verifyUrl}
                    </p>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="rounded-xl border border-border bg-surface px-6 py-8 flex items-center gap-4">
                        <Spinner />
                        <p className="text-[0.85rem] text-muted">Loading verified passes…</p>
                    </div>
                )}

                {/* Error */}
                {!loading && error && (
                    <div className="rounded-xl border border-red/25 bg-red/5 px-5 py-4 space-y-2">
                        <p className="text-[0.82rem] text-red">{error}</p>
                        <button
                            onClick={() => { setLoading(true); fetchEntries(); }}
                            className="text-[0.75rem] text-accent hover:underline cursor-pointer"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* Counter + Export */}
                {!loading && !error && (
                    <>
                        <div className="rounded-xl border border-border bg-surface px-6 py-8 flex items-end justify-between gap-4 flex-wrap">
                            <div>
                                <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-2">
                                    Verified passes
                                </p>
                                <p className="text-[4rem] font-bold text-white leading-none tabular-nums">
                                    {entries.length}
                                </p>
                            </div>
                            {entries.length > 0 && (
                                <button
                                    onClick={exportCsv}
                                    className="bg-accent font-semibold px-5 py-2.5 rounded-lg text-[0.88rem]
                                               hover:bg-accent/90 transition-colors flex-shrink-0"
                                    style={{ color: "#fff" }}
                                >
                                    Export CSV ↓
                                </button>
                            )}
                        </div>

                        {/* Wallet list */}
                        {entries.length === 0 ? (
                            <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center space-y-1">
                                <p className="text-[0.88rem] text-muted">No passes claimed yet.</p>
                                <p className="text-[0.75rem] text-muted-2">
                                    Share the link above — verified wallets appear here within seconds.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-border bg-surface overflow-hidden">
                                <div className="grid grid-cols-[1fr_auto_auto] border-b border-border px-4 py-2.5 gap-6">
                                    <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">Wallet</span>
                                    <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">Verified</span>
                                    <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">Tx</span>
                                </div>
                                <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
                                    {entries.map((e, i) => (
                                        <div
                                            key={e.txHash || i}
                                            className="grid grid-cols-[1fr_auto_auto] px-4 py-3 gap-6 items-center
                                                       hover:bg-surface-2/40 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono text-[0.75rem] text-text truncate">
                                                    {e.wallet.slice(0, 10)}…{e.wallet.slice(-8)}
                                                </span>
                                                <CopyBtn text={e.wallet} />
                                            </div>
                                            <span className="font-mono text-[0.72rem] text-muted whitespace-nowrap">
                                                {e.timestamp ? formatDate(e.timestamp) : "—"}
                                            </span>
                                            <a
                                                href={`https://sepolia.basescan.org/tx/${e.txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors"
                                            >
                                                ↗
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Contract footer */}
                        <div className="flex items-center gap-3 pt-1 flex-wrap">
                            <span className="font-mono text-[0.65rem] text-muted-2">Contract</span>
                            <span className="font-mono text-[0.65rem] text-muted break-all">{contract}</span>
                            <CopyBtn text={contract} />
                            <a
                                href={`https://sepolia.basescan.org/address/${contract}`}
                                target="_blank" rel="noopener noreferrer"
                                className="font-mono text-[0.65rem] text-muted-2 hover:text-accent transition-colors"
                            >
                                ↗
                            </a>
                        </div>
                    </>
                )}

            </main>
        </div>
    );
}
