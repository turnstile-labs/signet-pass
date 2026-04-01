"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPublicClient, http, type AbiEvent } from "viem";
import { baseSepolia } from "viem/chains";
import { SiteNav } from "@/components/SiteNav";
import { FACTORY_ADDRESS } from "@/lib/wagmi";

// ── RPC client (always public endpoint for log queries) ──────────────────────

const client = createPublicClient({
    chain:     baseSepolia,
    transport: http("https://sepolia.base.org"),
});

const CHUNK = 9_000n;
const DEPLOY_BLOCK = 39_000_000n; // approx factory first deploy on Base Sepolia

// ── Event ABIs ────────────────────────────────────────────────────────────────

const PASS_DEPLOYED_EVENT = {
    type: "event", name: "PassDeployed",
    inputs: [
        { name: "pass",          type: "address", indexed: true  },
        { name: "owner",         type: "address", indexed: true  },
        { name: "cutoff",        type: "uint256", indexed: false },
        { name: "allowedHashes", type: "uint256[]", indexed: false },
        { name: "feePerCheck",   type: "uint256", indexed: false },
    ],
} as const satisfies AbiEvent;

const VERIFIED_EVENT = {
    type: "event", name: "Verified",
    inputs: [{ name: "wallet", type: "address", indexed: true }],
} as const satisfies AbiEvent;

const FEE_COLLECTED_EVENT = {
    type: "event", name: "FeeCollected",
    inputs: [
        { name: "pass",   type: "address", indexed: true  },
        { name: "wallet", type: "address", indexed: true  },
        { name: "amount", type: "uint256", indexed: false },
    ],
} as const satisfies AbiEvent;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function chunkedLogs<E extends AbiEvent>(
    event:     E,
    address:   `0x${string}` | `0x${string}`[] | undefined,
    fromBlock: bigint,
    toBlock:   bigint,
) {
    const tasks: ReturnType<typeof client.getLogs<E>>[] = [];
    for (let from = fromBlock; from <= toBlock; from += CHUNK) {
        const to = from + CHUNK - 1n < toBlock ? from + CHUNK - 1n : toBlock;
        tasks.push(
            client.getLogs<E>({ event, address, fromBlock: from, toBlock: to })
                  .catch(() => [] as Awaited<ReturnType<typeof client.getLogs<E>>>)
        );
    }
    const results = await Promise.all(tasks);
    return results.flat();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
    passCount:         number;
    verificationCount: number;
    feeCollectedWei:   bigint;
    lastUpdated:       Date;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatsClient() {
    const [stats,   setStats]   = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState("");

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError("");
            try {
                const latest = await client.getBlockNumber();
                const from   = latest > 500_000n ? latest - 500_000n : 0n;

                // 1. All passes ever deployed via the factory
                const deployedLogs  = await chunkedLogs(PASS_DEPLOYED_EVENT, FACTORY_ADDRESS, DEPLOY_BLOCK, latest);
                const passAddresses = deployedLogs.map(l => l.args.pass as `0x${string}`);
                const passCount     = passAddresses.length;

                // 2. Verified events across all passes (recent window)
                let verificationCount = 0;
                if (passAddresses.length > 0) {
                    const verifiedLogs = await chunkedLogs(VERIFIED_EVENT, passAddresses, from, latest);
                    verificationCount  = verifiedLogs.length;
                }

                // 3. FeeCollected — total ETH paid to Signet
                let feeCollectedWei = 0n;
                if (passAddresses.length > 0) {
                    const feeLogs   = await chunkedLogs(FEE_COLLECTED_EVENT, passAddresses, DEPLOY_BLOCK, latest);
                    feeCollectedWei = feeLogs.reduce((sum, l) => sum + (l.args.amount ?? 0n), 0n);
                }

                setStats({ passCount, verificationCount, feeCollectedWei, lastUpdated: new Date() });
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load stats");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const feeEth = stats ? (Number(stats.feeCollectedWei) / 1e18).toFixed(4) : "0.0000";

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-8">

                {/* Header */}
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2">
                            Protocol · Base Sepolia testnet
                        </p>
                        <span className="font-mono text-[0.58rem] uppercase tracking-wider
                                         bg-amber/10 text-amber border border-amber/25
                                         px-2 py-0.5 rounded-full">
                            Signet internal
                        </span>
                    </div>
                    <h1 className="text-[1.8rem] sm:text-[2.2rem] font-bold tracking-tight text-white leading-[1.1]">
                        Protocol stats
                    </h1>
                    <p className="text-[0.82rem] text-muted mt-2">
                        Live on-chain data — every number is queryable by anyone.
                        Auth-gated access coming before mainnet.
                    </p>
                </div>

                {/* Stats grid */}
                {loading ? (
                    <div className="grid sm:grid-cols-3 gap-3">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="rounded-xl border border-border bg-surface px-5 py-5 animate-pulse">
                                <div className="h-2 bg-border rounded w-20 mb-4" />
                                <div className="h-8 bg-border rounded w-16" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <p className="text-[0.82rem] text-red">{error}</p>
                ) : stats ? (
                    <div className="grid sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-border bg-surface px-5 py-5">
                            <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2 mb-3">
                                Passes deployed
                            </p>
                            <p className="text-[2.8rem] font-bold text-white leading-none tabular-nums">
                                {stats.passCount.toLocaleString()}
                            </p>
                            <p className="text-[0.72rem] text-muted mt-2">
                                via SignetPassFactory
                            </p>
                        </div>

                        <div className="rounded-xl border border-border bg-surface px-5 py-5">
                            <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2 mb-3">
                                Verifications
                            </p>
                            <p className="text-[2.8rem] font-bold text-white leading-none tabular-nums">
                                {stats.verificationCount.toLocaleString()}
                            </p>
                            <p className="text-[0.72rem] text-muted mt-2">
                                last ~11 days
                            </p>
                        </div>

                        <div className="rounded-xl border border-border bg-surface px-5 py-5">
                            <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2 mb-3">
                                Protocol fees
                            </p>
                            <p className="text-[2.8rem] font-bold text-white leading-none tabular-nums">
                                {feeEth}
                            </p>
                            <p className="text-[0.72rem] text-muted mt-2">
                                ETH collected · fee = 0 on testnet
                            </p>
                        </div>
                    </div>
                ) : null}

                {/* Transparency note */}
                <div className="rounded-xl border border-border bg-surface px-5 py-4 space-y-3">
                    <p className="text-[0.78rem] font-semibold text-text">How fees work</p>
                    <p className="text-[0.75rem] text-muted leading-relaxed">
                        Creating a pass is free. Reading{" "}
                        <code className="font-mono text-[0.7rem] text-text/80">isVerified()</code>{" "}
                        is free. The only fee is a small one-time charge when a user calls{" "}
                        <code className="font-mono text-[0.7rem] text-text/80">verify()</code>{" "}
                        to claim their pass — paid directly to Signet, never to the pass deployer.
                        Verified once, valid on every Signet-gated project forever.
                    </p>
                    <div className="flex items-center gap-4 pt-1 flex-wrap">
                        <a href={`https://sepolia.basescan.org/address/${FACTORY_ADDRESS}`}
                           target="_blank" rel="noopener noreferrer"
                           className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                            Factory ↗
                        </a>
                        <a href={`https://sepolia.basescan.org/address/0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1`}
                           target="_blank" rel="noopener noreferrer"
                           className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                            AttestationCache ↗
                        </a>
                        {stats && (
                            <span className="font-mono text-[0.65rem] text-muted-2 ml-auto">
                                Updated {stats.lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>

                {/* CTAs */}
                <div className="flex items-center gap-6 flex-wrap">
                    <Link href="/create"
                          className="text-[0.82rem] font-medium text-accent hover:text-accent/80 transition-colors">
                        Create a pass →
                    </Link>
                    <Link href="/demo"
                          className="text-[0.82rem] text-muted hover:text-text transition-colors">
                        Try a demo
                    </Link>
                    <Link href="/developers"
                          className="text-[0.82rem] text-muted hover:text-text transition-colors">
                        Integrate
                    </Link>
                </div>

            </main>
        </div>
    );
}
