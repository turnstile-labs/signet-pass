"use client";

import { useEffect, useState, useCallback } from "react";
import { SiteNav } from "@/components/SiteNav";
import { FACTORY_ADDRESS } from "@/lib/wagmi";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
    blockNumber:       string;
    passCount:         number;
    verificationCount: number;
    feeCollectedEth:   string;
    signetFee:         string;
    signetFeeEth:      string;
    treasury:          string;
    treasuryBalEth:    string;
    factoryOwner:      string;
    fetchedAt:         string;
    factoryAddress:    string;
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

function fmt(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function basescan(addr: string) {
    return `https://sepolia.basescan.org/address/${addr}`;
}

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
            const res = await fetch("/api/stats");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = await res.json();
            setStats(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load stats");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const feeLabel = !stats || stats.signetFee === "0"
        ? "Free during testnet"
        : `${stats.signetFeeEth} ETH per verification`;

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
                                {new Date(stats.fetchedAt).toLocaleTimeString()}
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
                                    value={stats.feeCollectedEth === "0.0" || stats.feeCollectedEth === "0"
                                        ? "—"
                                        : `${parseFloat(stats.feeCollectedEth).toFixed(4)} ETH`}
                                    note={stats.feeCollectedEth === "0.0" || stats.feeCollectedEth === "0"
                                        ? "No fees collected yet"
                                        : "All-time · fees only"}
                                    accent={parseFloat(stats.feeCollectedEth) > 0}
                                />
                                <Metric
                                    label="Treasury balance"
                                    value={`${parseFloat(stats.treasuryBalEth).toFixed(4)} ETH`}
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
                                stats.signetFee === "0"
                                    ? "text-muted-2 border-border bg-surface-2"
                                    : "text-green border-green/25 bg-green/5"
                            }`}>
                                {stats.signetFee === "0" ? "0 ETH" : `${stats.signetFeeEth} ETH`}
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
