"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { SiteNav } from "@/components/SiteNav";
import { SIGNET_PASS_ABI, isValidAddress } from "@/lib/wagmi";

// The live demo gate deployed on Base Sepolia.
// Set NEXT_PUBLIC_DEMO_CONTRACT in .env.local to use a different contract.
const DEMO_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_CONTRACT ?? "0x2566081B73fE2e2340B95B36ccd2256584b64C8F"
) as `0x${string}`;

const DEMO_NAME = "SGNL Token Presale — Round 1";

// ── Mock presale data ─────────────────────────────────────────────────────────
// Static feed that fills the blurred/revealed state; gives the "live" feeling.

const MOCK_FEED = [
    { addr: "0xf3a1…8c90", ago: "2 min ago"  },
    { addr: "0x7d22…4411", ago: "5 min ago"  },
    { addr: "0x9b15…cc03", ago: "8 min ago"  },
    { addr: "0x4e87…1f77", ago: "11 min ago" },
    { addr: "0xc031…a55d", ago: "19 min ago" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function shorten(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function CopyBtn({ text, label = "copy" }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    function handleClick() {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    }
    return (
        <button
            onClick={handleClick}
            className="inline-flex items-center gap-1 text-[0.7rem] text-muted-2
                       hover:text-accent transition-colors cursor-pointer"
        >
            {copied ? "✓ copied" : label}
        </button>
    );
}

// ── Presale dashboard (same layout, blurred when locked) ──────────────────────

function PresaleDashboard({
    unlocked,
    userAddr,
}: {
    unlocked: boolean;
    userAddr: string | undefined;
}) {
    return (
        <div className="p-5 space-y-4">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2 mb-1">
                        {unlocked ? "✓ whitelisted" : "token presale"}
                    </p>
                    <h2 className="text-[1.05rem] font-semibold text-white leading-tight">
                        SGNL — Private Round 1
                    </h2>
                </div>
                <div className="flex-shrink-0 flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                    <span className="text-[0.68rem] text-green font-medium">LIVE</span>
                    {unlocked && (
                        <span className="ml-2 text-[0.65rem] font-medium bg-green/10 text-green
                                         border border-green/25 px-2 py-0.5 rounded-full">
                            Eligible ✓
                        </span>
                    )}
                </div>
            </div>

            {/* Stat row */}
            <div className="grid grid-cols-3 gap-2">
                {[
                    { label: "Verified",    value: "1,247"     },
                    { label: "Price",       value: "0.05 ETH"  },
                    { label: "Pool",        value: "500 ETH"   },
                ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-border bg-surface px-3 py-2.5 text-center">
                        <p className="text-[0.88rem] font-semibold text-white">{value}</p>
                        <p className="text-[0.65rem] text-muted mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Allocation details */}
            <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-[0.75rem]">
                    <span className="text-muted">Max allocation</span>
                    <span className="text-text font-medium">2 ETH per wallet</span>
                </div>
                <div className="flex justify-between text-[0.75rem]">
                    <span className="text-muted">Eligibility</span>
                    <span className="text-text font-medium">Any exchange · 2025 or earlier</span>
                </div>
                <div className="flex justify-between text-[0.75rem]">
                    <span className="text-muted">Closes</span>
                    <span className="text-text font-medium">14 days remaining</span>
                </div>
            </div>

            {/* Live verification feed */}
            <div>
                <p className="text-[0.65rem] font-mono text-muted-2 mb-2">Recent verifications</p>
                <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
                    {/* User's own entry when unlocked */}
                    {unlocked && userAddr && (
                        <div className="flex items-center justify-between px-3 py-2.5 bg-green/5">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green flex-shrink-0" />
                                <span className="font-mono text-[0.75rem] text-green font-medium">
                                    {shorten(userAddr)}
                                </span>
                                <span className="text-[0.65rem] font-medium text-green/70">you</span>
                            </div>
                            <span className="text-[0.68rem] text-green/70">just now</span>
                        </div>
                    )}
                    {MOCK_FEED.map(({ addr, ago }) => (
                        <div key={addr} className="flex items-center justify-between px-3 py-2.5">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-2 flex-shrink-0" />
                                <span className="font-mono text-[0.75rem] text-muted">{addr}</span>
                            </div>
                            <span className="text-[0.68rem] text-muted-2">{ago}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Contract call (unlocked only — shows after reveal) */}
            {unlocked && userAddr && (
                <div className="rounded-xl border border-green/20 bg-green/5 px-4 py-3 space-y-1">
                    <p className="text-[0.62rem] font-mono text-muted-2 mb-1">on-chain check</p>
                    <p className="font-mono text-[0.76rem] text-muted">
                        isVerified(<span className="text-accent">{shorten(userAddr)}</span>)
                    </p>
                    <p className="font-mono text-[0.76rem]">
                        <span className="text-muted">→ </span>
                        <span className="text-green">true ✓</span>
                    </p>
                    <p className="font-mono text-[0.6rem] text-muted-2 pt-0.5">
                        contract: {DEMO_CONTRACT.slice(0, 10)}…{DEMO_CONTRACT.slice(-8)}
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DemoClient() {
    const { address, isConnected } = useAccount();

    // On-chain verification check — refetch on window focus so returning
    // from /verify immediately updates the gate state.
    const { data: verified, isLoading: checking } = useReadContract({
        address:      DEMO_CONTRACT,
        abi:          SIGNET_PASS_ABI,
        functionName: "isVerified",
        args:         [address!],
        query: {
            enabled:             isConnected && !!address && isValidAddress(DEMO_CONTRACT),
            refetchOnWindowFocus: true,
            staleTime:            0,
        },
    });

    const unlocked = isConnected && verified === true;

    // Client-only URLs (avoids SSR/CSR mismatch)
    const [verifyUrl, setVerifyUrl] = useState("");
    const [shareUrl,  setShareUrl]  = useState("");
    useEffect(() => {
        const base = process.env.NEXT_PUBLIC_PASS_URL || window.location.origin;
        const p = new URLSearchParams({
            contract: DEMO_CONTRACT,
            name:     DEMO_NAME,
            redirect: "/demo",
        });
        setVerifyUrl(`${base}/verify?${p.toString()}`);

        const sp = new URLSearchParams({ contract: DEMO_CONTRACT, name: DEMO_NAME });
        setShareUrl(`${base}/verify?${sp.toString()}`);
    }, []);

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 space-y-8">

                {/* ── Page header ───────────────────────────────────────────── */}
                <div>
                    <h1 className="text-[1.8rem] sm:text-[2.2rem] font-bold tracking-tight text-white leading-[1.1] mb-2">
                        Demos
                    </h1>
                    <p className="text-[0.88rem] text-muted">
                        Live gates deployed on Base Sepolia — interact with the real thing.
                    </p>
                </div>

                {/* ── Demo list ─────────────────────────────────────────────── */}
                {/* More demos can be added here as additional cards. */}
                <div className="space-y-3">
                    <div className="rounded-2xl border border-accent/25 bg-surface px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <p className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-2 mb-1.5">
                                    Live demo · Base Sepolia
                                </p>
                                <p className="text-[0.88rem] font-semibold text-text mb-1">
                                    SGNL Token Presale gate
                                </p>
                                <p className="text-[0.76rem] text-muted leading-relaxed">
                                    Connect a wallet and prove your crypto history to get whitelisted.
                                    The full user flow — ZK proof in the browser, on-chain verification,
                                    content reveal — runs live below.
                                </p>
                            </div>
                            <span className="flex-shrink-0 text-[0.65rem] font-medium text-green mt-0.5">
                                ● active
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <span className="text-[0.62rem] font-mono bg-bg border border-border
                                             px-2 py-0.5 rounded-full text-muted-2">
                                🔒 locked
                            </span>
                            <span className="text-[0.62rem] font-mono bg-bg border border-border
                                             px-2 py-0.5 rounded-full text-muted-2">
                                ZK proof · ~30 s
                            </span>
                            <span className="text-[0.62rem] font-mono bg-bg border border-border
                                             px-2 py-0.5 rounded-full text-muted-2">
                                isVerified() → true
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Gate card ─────────────────────────────────────────────── */}
                <div className="relative rounded-2xl border border-border overflow-hidden">

                    {/* Dashboard content — blurred behind gate when locked */}
                    <div
                        style={{
                            filter:        unlocked ? "none" : "blur(5px)",
                            transition:    "filter 0.6s ease",
                            userSelect:    unlocked ? "auto" : "none",
                            pointerEvents: unlocked ? "auto" : "none",
                        }}
                        aria-hidden={!unlocked}
                    >
                        <PresaleDashboard unlocked={unlocked} userAddr={address} />
                    </div>

                    {/* Share proof row — outside blur container */}
                    {unlocked && shareUrl && (
                        <div className="mx-5 mb-5 flex items-center justify-between gap-4 rounded-xl
                                        border border-green/20 bg-green/5 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-[0.78rem] font-medium text-green mb-0.5">Share your proof</p>
                                <p className="text-[0.66rem] font-mono text-muted-2 truncate">{shareUrl}</p>
                            </div>
                            <CopyBtn text={shareUrl} label="copy link" />
                        </div>
                    )}

                    {/* ── Gate overlay (locked only) ──────────────────────── */}
                    {!unlocked && (
                        <div className="absolute inset-0 flex items-center justify-center
                                        bg-bg/78 backdrop-blur-[3px] px-6">
                            <div className="flex flex-col items-center text-center max-w-[300px] w-full">

                                <div className="w-11 h-11 rounded-2xl border border-border bg-surface
                                                flex items-center justify-center mb-4 text-xl">
                                    🔒
                                </div>

                                <h3 className="text-[1rem] font-semibold text-white mb-1.5">
                                    Private Round Whitelist
                                </h3>

                                <p className="text-[0.76rem] text-muted mb-3">
                                    Prove you had a crypto exchange account to get whitelisted
                                </p>

                                <span className="inline-block font-mono text-[0.62rem] bg-surface
                                                 border border-border px-2.5 py-1 rounded-full
                                                 text-muted-2 mb-5">
                                    Any exchange · Account from 2025 or earlier
                                </span>

                                {checking ? (
                                    <div className="flex items-center gap-2 text-[0.78rem] text-muted">
                                        <div className="w-3.5 h-3.5 border border-accent/30 border-t-accent
                                                        rounded-full animate-spin flex-shrink-0" />
                                        Checking…
                                    </div>
                                ) : !isConnected ? (
                                    <div className="w-full space-y-2.5">
                                        <ConnectKitButton.Custom>
                                            {({ show }) => (
                                                <button
                                                    onClick={show}
                                                    className="w-full bg-accent text-[0.82rem]
                                                               font-semibold px-5 py-2.5 rounded-xl
                                                               hover:bg-accent/90 transition-colors"
                                                    style={{ color: "#fff" }}
                                                >
                                                    Connect wallet
                                                </button>
                                            )}
                                        </ConnectKitButton.Custom>
                                        <p className="text-[0.67rem] text-muted-2">
                                            Then prove your email to get whitelisted
                                        </p>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-2.5">
                                        {verifyUrl && (
                                            <Link
                                                href={verifyUrl}
                                                className="block w-full bg-accent text-[0.82rem]
                                                           font-semibold px-5 py-2.5 rounded-xl
                                                           hover:bg-accent/90 transition-colors text-center"
                                                style={{ color: "#fff" }}
                                            >
                                                Prove eligibility →
                                            </Link>
                                        )}
                                        <p className="text-[0.67rem] text-muted-2 leading-snug">
                                            Drop an exchange email · ZK proof in ~30 s · nothing leaves your device
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Deployer CTA ──────────────────────────────────────────── */}
                <div className="rounded-xl border border-border bg-surface px-5 py-4
                                flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-[0.85rem] font-semibold text-text">Create your own gate</p>
                        <p className="text-[0.74rem] text-muted mt-0.5">
                            Two minutes to deploy. No code required.
                        </p>
                    </div>
                    <Link
                        href="/developers"
                        className="bg-accent text-[0.8rem] font-medium px-5 py-2.5
                                   rounded-lg hover:bg-accent/90 transition-colors flex-shrink-0 text-center"
                        style={{ color: "#fff" }}
                    >
                        Create a pass →
                    </Link>
                </div>

            </main>
        </div>
    );
}
