"use client";

import { useState, useEffect, useCallback } from "react";
import {
    getPublicClient,
    ATTESTATION_CACHE_ADDRESS,
    ATTESTATION_CACHE_ABI,
} from "@/lib/wagmi";

interface Attestation {
    pubkeyHash:     bigint;
    nullifier:      bigint;
    emailTimestamp: bigint;
    registeredAt:   bigint;
}

const COINBASE_PUBKEY_HASH =
    19806930313339437892543285869542575252100319438226679350463646898451946018980n;

function domainFromPubkeyHash(h: bigint): string {
    if (h === COINBASE_PUBKEY_HASH) return "coinbase.com";
    return "unknown domain";
}

function formatDate(unix: bigint): string {
    return new Date(Number(unix) * 1000).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
    });
}

function shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface Props {
    wallet: string | null;
}

export function AttestationCard({ wallet: initialWallet }: Props) {
    const [wallet,      setWallet]      = useState(initialWallet ?? "");
    const [input,       setInput]       = useState(initialWallet ?? "");
    const [attestation, setAttestation] = useState<Attestation | null>(null);
    const [loading,     setLoading]     = useState(false);
    const [notFound,    setNotFound]    = useState(false);
    const [copied,      setCopied]      = useState(false);

    const lookup = useCallback(async (addr: string) => {
        if (!addr.startsWith("0x") || addr.length !== 42) return;
        setLoading(true);
        setNotFound(false);
        setAttestation(null);
        try {
            const raw = await getPublicClient().readContract({
                address:      ATTESTATION_CACHE_ADDRESS,
                abi:          ATTESTATION_CACHE_ABI,
                functionName: "getAttestation",
                args:         [addr as `0x${string}`],
            }) as Attestation;
            if (raw.registeredAt === 0n) {
                setNotFound(true);
            } else {
                setAttestation(raw);
            }
        } catch (e) {
            console.error(e);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (wallet) lookup(wallet);
    }, [wallet, lookup]);

    const shareUrl = typeof window !== "undefined"
        ? `${window.location.origin}/attestation?wallet=${wallet}`
        : "";

    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-2 mb-5">
                On-chain attestation lookup
            </p>
            <h1 className="text-2xl font-bold text-white mb-8">
                Check a wallet&apos;s eligibility
            </h1>

            {/* ── Wallet input ────────────────────────────────────────────── */}
            <div className="flex gap-2 mb-8">
                <input
                    type="text"
                    placeholder="0x…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    className="flex-1 bg-surface-2 border border-border rounded-lg px-4 py-2.5
                               text-sm text-text placeholder:text-muted-2 outline-none
                               focus:border-accent/50 font-mono"
                />
                <button
                    onClick={() => { setWallet(input); }}
                    disabled={loading}
                    className="bg-accent text-sm font-medium px-4 py-2.5 rounded-lg
                               hover:bg-accent/90 transition-colors disabled:opacity-50 cursor-pointer"
                    style={{ color: "#fff" }}
                >
                    {loading ? "…" : "Look up"}
                </button>
            </div>

            {/* ── Result ──────────────────────────────────────────────────── */}
            {loading && (
                <p className="text-muted text-sm">Querying Base Sepolia…</p>
            )}
            {notFound && !loading && (
                <div className="rounded-xl border border-border px-5 py-4 text-sm text-muted">
                    No attestation found for this wallet.{" "}
                    <a href={`/prove?wallet=${wallet}`} className="text-accent hover:text-accent/80">
                        Verify now to get eligible →
                    </a>
                </div>
            )}

            {attestation && !loading && (
                <div className="rounded-xl border border-border-h bg-surface-2 px-5 py-5 space-y-4">

                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[0.72rem] text-muted-2 mb-1">Wallet</p>
                            <p className="font-mono text-sm text-text">{shortAddr(wallet)}</p>
                        </div>
                        <span className="text-[0.72rem] font-medium bg-green/10 text-green
                                         border border-green/25 px-2 py-0.5 rounded-full">
                            ✓ Verified
                        </span>
                    </div>

                    <div className="border-t border-border" />

                    {/* Fields */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-[0.72rem] text-muted-2 mb-1">Email domain</p>
                            <p className="text-text font-medium">{domainFromPubkeyHash(attestation.pubkeyHash)}</p>
                        </div>
                        <div>
                            <p className="text-[0.72rem] text-muted-2 mb-1">Email date</p>
                            <p className="text-text font-medium">{formatDate(attestation.emailTimestamp)}</p>
                        </div>
                        <div>
                            <p className="text-[0.72rem] text-muted-2 mb-1">Registered on-chain</p>
                            <p className="text-text font-medium">{formatDate(attestation.registeredAt)}</p>
                        </div>
                        <div>
                            <p className="text-[0.72rem] text-muted-2 mb-1">Nullifier</p>
                            <p className="font-mono text-[0.68rem] text-muted truncate">
                                {`0x${attestation.nullifier.toString(16).slice(0, 16)}…`}
                            </p>
                        </div>
                    </div>

                    <div className="border-t border-border" />

                    {/* Share */}
                    <div className="flex items-center gap-3">
                        <p className="text-[0.75rem] text-muted flex-1 truncate">{shareUrl}</p>
                        <button
                            onClick={handleCopy}
                            className="text-[0.75rem] text-accent hover:text-accent/80 transition-colors
                                       flex-shrink-0 cursor-pointer"
                        >
                            {copied ? "Copied!" : "Copy link"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
