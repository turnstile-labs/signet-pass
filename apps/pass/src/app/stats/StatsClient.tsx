"use client";

import { useEffect, useState, useCallback } from "react";
import { createPublicClient, http, type AbiEvent, formatEther } from "viem";
import { baseSepolia } from "viem/chains";
import { SiteNav } from "@/components/SiteNav";
import { FACTORY_ADDRESS, SIGNET_PASS_FACTORY_ABI } from "@/lib/wagmi";

// ── Constants ─────────────────────────────────────────────────────────────────

const ATTESTATION_CACHE = "0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1" as const;
const DEPLOY_BLOCK      = 39_000_000n;
const CHUNK             = 9_000n;

const client = createPublicClient({
    chain:     baseSepolia,
    transport: http("https://sepolia.base.org"),
});

// ── Event ABIs ────────────────────────────────────────────────────────────────

const PASS_DEPLOYED_EVENT = {
    type: "event", name: "PassDeployed",
    inputs: [
        { name: "pass",          type: "address",   indexed: true  },
        { name: "owner",         type: "address",   indexed: true  },
        { name: "cutoff",        type: "uint256",   indexed: false },
        { name: "allowedHashes", type: "uint256[]", indexed: false },
        { name: "feePerCheck",   type: "uint256",   indexed: false },
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
    return (await Promise.all(tasks)).flat();
}

function shorten(addr: string) {
    return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
    blockNumber:       bigint;
    passCount:         number;
    verificationCount: number;
    feeCollectedWei:   bigint;
    signetFee:         bigint;
    treasury:          string;
    treasuryBalWei:    bigint;
    factoryOwner:      string;
    fetchedAt:         Date;
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function Cell({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
    return (
        <div className="rounded-xl border border-border bg-surface px-5 py-4 space-y-1">
            <p className="font-mono text-[0.58rem] uppercase tracking-widest text-muted-2">{label}</p>
            {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer"
                   className="block font-mono text-[1.05rem] font-bold text-white hover:text-accent transition-colors break-all leading-snug">
                    {value}
                </a>
            ) : (
                <p className="font-mono text-[1.05rem] font-bold text-white break-all leading-snug">{value}</p>
            )}
            {sub && <p className="font-mono text-[0.62rem] text-muted-2">{sub}</p>}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StatsClient() {
    const [stats,    setStats]   = useState<Stats | null>(null);
    const [loading,  setLoading] = useState(true);
    const [error,    setError]   = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const latest = await client.getBlockNumber();
            const from   = latest > 500_000n ? latest - 500_000n : 0n;

            const [signetFee, treasury, factoryOwner] = await Promise.all([
                client.readContract({ address: FACTORY_ADDRESS, abi: SIGNET_PASS_FACTORY_ABI, functionName: "signetFee"      }) as Promise<bigint>,
                client.readContract({ address: FACTORY_ADDRESS, abi: SIGNET_PASS_FACTORY_ABI, functionName: "signetTreasury" }) as Promise<string>,
                client.readContract({ address: FACTORY_ADDRESS, abi: SIGNET_PASS_FACTORY_ABI, functionName: "owner"          }) as Promise<string>,
            ]);

            const treasuryBalWei = await client.getBalance({ address: treasury as `0x${string}` });

            const deployedLogs  = await chunkedLogs(PASS_DEPLOYED_EVENT, FACTORY_ADDRESS, DEPLOY_BLOCK, latest);
            const passAddresses = deployedLogs.map(l => l.args.pass as `0x${string}`);

            let verificationCount = 0;
            let feeCollectedWei   = 0n;

            if (passAddresses.length > 0) {
                const [verifiedLogs, feeLogs] = await Promise.all([
                    chunkedLogs(VERIFIED_EVENT,       passAddresses, from,         latest),
                    chunkedLogs(FEE_COLLECTED_EVENT,  passAddresses, DEPLOY_BLOCK, latest),
                ]);
                verificationCount = verifiedLogs.length;
                feeCollectedWei   = feeLogs.reduce((s, l) => s + (l.args.amount ?? 0n), 0n);
            }

            setStats({
                blockNumber: latest,
                passCount:   passAddresses.length,
                verificationCount,
                feeCollectedWei,
                signetFee,
                treasury,
                treasuryBalWei,
                factoryOwner,
                fetchedAt: new Date(),
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "RPC error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const basescan = (addr: string) => `https://sepolia.basescan.org/address/${addr}`;

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-3xl mx-auto w-full px-5 py-10 space-y-6">

                {/* Header bar */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[0.58rem] uppercase tracking-wider
                                             bg-amber/10 text-amber border border-amber/25
                                             px-2 py-0.5 rounded-full">
                                internal
                            </span>
                            <span className="font-mono text-[0.62rem] text-muted-2">Base Sepolia · testnet</span>
                        </div>
                        <h1 className="text-[1.4rem] font-bold tracking-tight text-white">
                            Protocol dashboard
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {stats && (
                            <span className="font-mono text-[0.62rem] text-muted-2">
                                block {stats.blockNumber.toLocaleString()} · {stats.fetchedAt.toLocaleTimeString()}
                            </span>
                        )}
                        <button onClick={load} disabled={loading}
                            className="font-mono text-[0.68rem] border border-border px-3 py-1.5 rounded-lg
                                       text-muted hover:text-text hover:border-border/60 transition-colors
                                       disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
                            {loading ? "loading…" : "↻ refresh"}
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="font-mono text-[0.75rem] text-red border border-red/20 bg-red/5 px-4 py-3 rounded-xl">
                        {error}
                    </p>
                )}

                {/* ── Activity metrics ─────────────────────────────────── */}
                <section className="space-y-2">
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-2 px-1">Activity</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {loading ? (
                            [0,1,2].map(i => (
                                <div key={i} className="rounded-xl border border-border bg-surface px-5 py-4 animate-pulse space-y-2">
                                    <div className="h-2 bg-border rounded w-16" />
                                    <div className="h-6 bg-border rounded w-12" />
                                </div>
                            ))
                        ) : stats ? (
                            <>
                                <Cell
                                    label="Passes deployed"
                                    value={stats.passCount.toLocaleString()}
                                    sub="all-time · factory events"
                                />
                                <Cell
                                    label="Verifications"
                                    value={stats.verificationCount.toLocaleString()}
                                    sub="last ~11 days · Verified events"
                                />
                                <Cell
                                    label="Fees collected"
                                    value={`${parseFloat(formatEther(stats.feeCollectedWei)).toFixed(6)} ETH`}
                                    sub="all-time · FeeCollected events"
                                />
                            </>
                        ) : null}
                    </div>
                </section>

                {/* ── Protocol config ──────────────────────────────────── */}
                <section className="space-y-2">
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-2 px-1">Protocol config</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {loading ? (
                            [0,1].map(i => (
                                <div key={i} className="rounded-xl border border-border bg-surface px-5 py-4 animate-pulse space-y-2">
                                    <div className="h-2 bg-border rounded w-20" />
                                    <div className="h-4 bg-border rounded w-32" />
                                </div>
                            ))
                        ) : stats ? (
                            <>
                                <Cell
                                    label="signetFee (current)"
                                    value={stats.signetFee === 0n ? "0 ETH (free)" : `${formatEther(stats.signetFee)} ETH`}
                                    sub="charged on verify() · applies to new passes"
                                />
                                <Cell
                                    label="Treasury balance"
                                    value={`${parseFloat(formatEther(stats.treasuryBalWei)).toFixed(6)} ETH`}
                                    sub={shorten(stats.treasury)}
                                    href={basescan(stats.treasury)}
                                />
                            </>
                        ) : null}
                    </div>
                </section>

                {/* ── Contracts ────────────────────────────────────────── */}
                <section className="space-y-2">
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-2 px-1">Contracts</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {loading ? (
                            [0,1,2].map(i => (
                                <div key={i} className="rounded-xl border border-border bg-surface px-5 py-4 animate-pulse space-y-2">
                                    <div className="h-2 bg-border rounded w-24" />
                                    <div className="h-4 bg-border rounded w-40" />
                                </div>
                            ))
                        ) : stats ? (
                            <>
                                <Cell
                                    label="SignetPassFactory"
                                    value={shorten(FACTORY_ADDRESS)}
                                    sub={`owner: ${shorten(stats.factoryOwner)}`}
                                    href={basescan(FACTORY_ADDRESS)}
                                />
                                <Cell
                                    label="AttestationCache"
                                    value={shorten(ATTESTATION_CACHE)}
                                    href={basescan(ATTESTATION_CACHE)}
                                />
                                <Cell
                                    label="Treasury"
                                    value={shorten(stats.treasury)}
                                    sub="receives all verify() fees"
                                    href={basescan(stats.treasury)}
                                />
                                <Cell
                                    label="Factory owner"
                                    value={shorten(stats.factoryOwner)}
                                    sub="can call setFee() + transferOwnership()"
                                    href={basescan(stats.factoryOwner)}
                                />
                            </>
                        ) : null}
                    </div>
                </section>

            </main>
        </div>
    );
}
