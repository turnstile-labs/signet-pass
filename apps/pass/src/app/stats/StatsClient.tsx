"use client";

import { useEffect, useState, useCallback } from "react";
import { createPublicClient, http, type AbiEvent, formatEther } from "viem";
import { baseSepolia } from "viem/chains";
import { SiteNav } from "@/components/SiteNav";
import { FACTORY_ADDRESS, SIGNET_PASS_FACTORY_ABI } from "@/lib/wagmi";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPLOY_BLOCK = 39_000_000n;
const CHUNK        = 9_000n;

const _alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const client = createPublicClient({
    chain:     baseSepolia,
    transport: http(
        _alchemyKey
            ? `https://base-sepolia.g.alchemy.com/v2/${_alchemyKey}`
            : "https://sepolia.base.org"
    ),
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

function fmt(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function basescan(addr: string) {
    return `https://sepolia.basescan.org/address/${addr}`;
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

// ── Skeleton cell ─────────────────────────────────────────────────────────────

function Skeleton() {
    return (
        <div className="rounded-2xl border border-border bg-surface px-5 py-5 animate-pulse space-y-2">
            <div className="h-2 bg-border rounded w-16" />
            <div className="h-8 bg-border rounded w-12" />
            <div className="h-2 bg-border rounded w-24" />
        </div>
    );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function Metric({ label, value, note, accent = false }: {
    label:   string;
    value:   string;
    note?:   string;
    accent?: boolean;
}) {
    return (
        <div className={`rounded-2xl border bg-surface px-5 py-5 space-y-1 ${
            accent ? "border-green/25 bg-green/5" : "border-border"
        }`}>
            <p className="text-[0.68rem] text-muted">{label}</p>
            <p className={`text-[2rem] font-bold tracking-tight leading-none ${
                accent ? "text-green" : "text-text"
            }`}>{value}</p>
            {note && <p className="text-[0.65rem] text-muted-2 pt-0.5">{note}</p>}
        </div>
    );
}

// ── Contract row ──────────────────────────────────────────────────────────────

function ContractRow({ label, addr, note }: { label: string; addr: string; note?: string }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
            <div className="min-w-0">
                <p className="text-[0.78rem] font-medium text-text">{label}</p>
                {note && <p className="text-[0.68rem] text-muted-2 mt-0.5">{note}</p>}
            </div>
            <a
                href={basescan(addr)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[0.72rem] text-muted-2 hover:text-accent transition-colors flex-shrink-0"
            >
                {fmt(addr)} ↗
            </a>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StatsClient() {
    const [stats,   setStats]   = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const latest = await client.getBlockNumber();

            const [signetFee, treasury, factoryOwner] = await Promise.all([
                client.readContract({ address: FACTORY_ADDRESS, abi: SIGNET_PASS_FACTORY_ABI, functionName: "signetFee"      }) as Promise<bigint>,
                client.readContract({ address: FACTORY_ADDRESS, abi: SIGNET_PASS_FACTORY_ABI, functionName: "signetTreasury" }) as Promise<string>,
                client.readContract({ address: FACTORY_ADDRESS, abi: SIGNET_PASS_FACTORY_ABI, functionName: "owner"          }) as Promise<string>,
            ]);

            const treasuryBalWei = await client.getBalance({ address: treasury as `0x${string}` });
            const deployedLogs   = await chunkedLogs(PASS_DEPLOYED_EVENT, FACTORY_ADDRESS, DEPLOY_BLOCK, latest);
            const passAddresses  = deployedLogs.map(l => l.args.pass as `0x${string}`);

            let verificationCount = 0;
            let feeCollectedWei   = 0n;

            if (passAddresses.length > 0) {
                const recentFrom = latest > 500_000n ? latest - 500_000n : 0n;
                const [verifiedLogs, feeLogs] = await Promise.all([
                    chunkedLogs(VERIFIED_EVENT,      passAddresses, recentFrom,   latest),
                    chunkedLogs(FEE_COLLECTED_EVENT, passAddresses, DEPLOY_BLOCK, latest),
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

    const feeLabel = !stats || stats.signetFee === 0n
        ? "Free during testnet"
        : `${formatEther(stats.signetFee)} ETH per verification`;

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-8">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[0.6rem] uppercase tracking-wider
                                             bg-amber/10 text-amber border border-amber/25
                                             px-2 py-0.5 rounded-full">
                                Signet internal
                            </span>
                            <span className="font-mono text-[0.62rem] text-muted-2">Base Sepolia</span>
                        </div>
                        <h1 className="text-[1.6rem] font-bold tracking-tight text-white leading-tight">
                            Protocol stats
                        </h1>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                        {stats && !loading && (
                            <span className="font-mono text-[0.6rem] text-muted-2">
                                {stats.fetchedAt.toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={load}
                            disabled={loading}
                            className="font-mono text-[0.72rem] border border-border px-3 py-1.5 rounded-lg
                                       text-muted hover:text-text hover:border-border-h transition-colors
                                       disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        >
                            {loading ? "Loading…" : "↻ Refresh"}
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="font-mono text-[0.75rem] text-red border border-red/20 bg-red/5 px-4 py-3 rounded-xl">
                        {error}
                    </p>
                )}

                {/* Metrics */}
                <section className="space-y-3">
                    <p className="text-[0.68rem] font-mono uppercase tracking-widest text-muted-2">
                        Usage
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        {loading ? (
                            [0, 1, 2].map(i => <Skeleton key={i} />)
                        ) : stats ? (
                            <>
                                <Metric
                                    label="Passes deployed"
                                    value={stats.passCount.toLocaleString()}
                                    note="All-time"
                                />
                                <Metric
                                    label="Verifications"
                                    value={stats.verificationCount.toLocaleString()}
                                    note="Last ~3 days"
                                />
                                <Metric
                                    label="Revenue"
                                    value={stats.feeCollectedWei === 0n
                                        ? "—"
                                        : `${parseFloat(formatEther(stats.feeCollectedWei)).toFixed(4)} ETH`}
                                    note={stats.feeCollectedWei === 0n ? "No fees collected yet" : "All-time · fees only"}
                                    accent={stats.feeCollectedWei > 0n}
                                />
                                <Metric
                                    label="Treasury balance"
                                    value={`${parseFloat(formatEther(stats.treasuryBalWei)).toFixed(4)} ETH`}
                                    note="Current wallet balance"
                                />
                            </>
                        ) : null}
                    </div>
                </section>

                {/* Fee rate */}
                {!loading && stats && (
                    <section className="rounded-2xl border border-border bg-surface px-5 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[0.78rem] font-medium text-text">Current fee rate</p>
                                <p className="text-[0.68rem] text-muted-2 mt-0.5">{feeLabel}</p>
                            </div>
                            <span className={`font-mono text-[0.72rem] px-2.5 py-1 rounded-full border ${
                                stats.signetFee === 0n
                                    ? "text-muted-2 border-border bg-surface-2"
                                    : "text-green border-green/25 bg-green/5"
                            }`}>
                                {stats.signetFee === 0n ? "0 ETH" : `${formatEther(stats.signetFee)} ETH`}
                            </span>
                        </div>
                    </section>
                )}

                {/* Contracts */}
                {!loading && stats && (
                    <section className="space-y-2">
                        <p className="text-[0.68rem] font-mono uppercase tracking-widest text-muted-2">
                            Contracts
                        </p>
                        <div className="rounded-2xl border border-border bg-surface px-5">
                            <ContractRow
                                label="Factory"
                                addr={FACTORY_ADDRESS}
                                note="Deploys new passes"
                            />
                            <ContractRow
                                label="Treasury"
                                addr={stats.treasury}
                                note="Receives verify() fees"
                            />
                            <ContractRow
                                label="Owner"
                                addr={stats.factoryOwner}
                                note="Can update fee rate"
                            />
                        </div>
                    </section>
                )}

            </main>
        </div>
    );
}
