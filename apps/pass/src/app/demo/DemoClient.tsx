"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { SiteNav } from "@/components/SiteNav";
import { SIGNET_PASS_ABI, isValidAddress } from "@/lib/wagmi";

// The live demo gate, deployed on Base Sepolia.
// Override with NEXT_PUBLIC_DEMO_CONTRACT to use a different contract.
const DEMO_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_CONTRACT ?? "0x2566081B73fE2e2340B95B36ccd2256584b64C8F"
) as `0x${string}`;

const DEMO_NAME = "Signet Builder Access";

const RESOURCES = [
    { icon: "⚡", label: "Integration boilerplate",  sub: "React + wagmi starter, ready to copy"  },
    { icon: "📐", label: "Technical architecture",   sub: "ZK circuit design & contract specs"     },
    { icon: "💬", label: "Builder Discord",           sub: "Early access to the builder channel"   },
    { icon: "🔑", label: "Beta verification endpoint", sub: "Hosted isVerified API on Base"        },
] as const;

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

// ── Main component ────────────────────────────────────────────────────────────

export function DemoClient() {
    const { address, isConnected } = useAccount();

    // On-chain verification check
    const { data: verified, isLoading: checking } = useReadContract({
        address:      DEMO_CONTRACT,
        abi:          SIGNET_PASS_ABI,
        functionName: "isVerified",
        args:         [address!],
        query:        { enabled: isConnected && !!address && isValidAddress(DEMO_CONTRACT) },
    });

    const unlocked = isConnected && verified === true;

    // Client-only URLs (avoids SSR/CSR mismatch)
    const [verifyUrl, setVerifyUrl] = useState("");
    const [shareUrl,  setShareUrl]  = useState("");
    useEffect(() => {
        const base = process.env.NEXT_PUBLIC_PASS_URL || window.location.origin;
        const p    = new URLSearchParams({ contract: DEMO_CONTRACT, name: DEMO_NAME });
        setVerifyUrl(`${base}/verify?${p.toString()}`);
        setShareUrl(`${base}/verify?${p.toString()}`);
    }, []);

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 space-y-8">

                {/* ── Header ────────────────────────────────────────────────── */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-3">
                        Live demo · Base Sepolia
                    </p>
                    <h1 className="text-[1.8rem] sm:text-[2.2rem] font-bold tracking-tight text-white leading-[1.1] mb-3">
                        Experience the gate
                    </h1>
                    <p className="text-[0.9rem] text-muted leading-relaxed">
                        A real Signet Pass gate, deployed on-chain. Connect a wallet and prove your crypto
                        history to unlock builder access. The ZK proof runs in your browser — nothing
                        leaves your device.
                    </p>
                </div>

                {/* ── Gate card ─────────────────────────────────────────────── */}
                <div className="relative rounded-2xl border border-border overflow-hidden">

                    {/* Content (blurred behind the gate when locked) */}
                    <div
                        className="p-6 space-y-4"
                        style={{
                            filter:     unlocked ? "none" : "blur(5px)",
                            transition: "filter 0.6s ease",
                            userSelect: unlocked ? "auto" : "none",
                            pointerEvents: unlocked ? "auto" : "none",
                        }}
                        aria-hidden={!unlocked}
                    >
                        {/* Access-granted header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-1">
                                    {unlocked ? "✓ access granted" : DEMO_NAME}
                                </p>
                                <h2 className="text-[1.05rem] font-semibold text-white">
                                    {unlocked && address
                                        ? `Welcome, ${shorten(address)}`
                                        : "Builder resources"}
                                </h2>
                            </div>
                            {unlocked && (
                                <span className="text-[0.65rem] font-medium bg-green-500/10 text-green-400
                                                 border border-green-500/20 px-2.5 py-1 rounded-full">
                                    Verified
                                </span>
                            )}
                        </div>

                        {/* Resource cards */}
                        <div className="space-y-2">
                            {RESOURCES.map((item, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-xl border border-border
                                                        bg-surface px-4 py-3">
                                    <span className="text-base flex-shrink-0">{item.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[0.82rem] font-medium text-text">{item.label}</p>
                                        <p className="text-[0.72rem] text-muted">{item.sub}</p>
                                    </div>
                                    <span className="text-[0.7rem] text-muted-2 flex-shrink-0">→</span>
                                </div>
                            ))}
                        </div>

                        {/* Contract-call display */}
                        <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-1">
                            <p className="text-[0.62rem] font-mono text-muted-2 mb-1.5">on-chain check</p>
                            <p className="font-mono text-[0.78rem] text-muted">
                                isVerified(
                                <span className="text-accent">
                                    {address ? shorten(address) : "0x…"}
                                </span>
                                )
                            </p>
                            <p className="font-mono text-[0.78rem]">
                                <span className="text-muted">{"→ "}</span>
                                <span className="text-green-400">true ✓</span>
                            </p>
                            <p className="font-mono text-[0.6rem] text-muted-2 pt-0.5">
                                contract: {DEMO_CONTRACT.slice(0, 10)}…{DEMO_CONTRACT.slice(-8)}
                            </p>
                        </div>

                        {/* Share proof row */}
                        {shareUrl && (
                            <div className="flex items-center justify-between gap-4 rounded-xl
                                            border border-green-500/20 bg-green-500/5 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-[0.78rem] font-medium text-green-400 mb-0.5">
                                        Share your proof
                                    </p>
                                    <p className="text-[0.68rem] font-mono text-muted-2 truncate">
                                        {shareUrl}
                                    </p>
                                </div>
                                <CopyBtn text={shareUrl} label="copy link" />
                            </div>
                        )}
                    </div>

                    {/* ── Gate overlay (locked only) ──────────────────────── */}
                    {!unlocked && (
                        <div
                            className="absolute inset-0 flex items-center justify-center
                                       bg-bg/75 backdrop-blur-[3px] px-6"
                        >
                            <div className="flex flex-col items-center text-center max-w-[300px] w-full">

                                {/* Lock icon */}
                                <div className="w-11 h-11 rounded-2xl border border-border bg-surface
                                                flex items-center justify-center mb-4 text-xl">
                                    🔒
                                </div>

                                <h3 className="text-[1rem] font-semibold text-white mb-1.5">
                                    {DEMO_NAME}
                                </h3>

                                <p className="text-[0.76rem] text-muted mb-3">
                                    Requires a verified crypto exchange account
                                </p>

                                <span className="inline-block font-mono text-[0.62rem] bg-surface
                                                 border border-border px-2.5 py-1 rounded-full
                                                 text-muted-2 mb-5">
                                    Any exchange · Account from 2021 or earlier
                                </span>

                                {checking ? (
                                    <div className="flex items-center gap-2 text-[0.78rem] text-muted">
                                        <div className="w-3.5 h-3.5 border border-accent/30 border-t-accent
                                                        rounded-full animate-spin flex-shrink-0" />
                                        Checking verification…
                                    </div>
                                ) : !isConnected ? (
                                    <div className="w-full space-y-2.5">
                                        <ConnectKitButton.Custom>
                                            {({ show }) => (
                                                <button
                                                    onClick={show}
                                                    className="w-full bg-accent text-white text-[0.82rem]
                                                               font-semibold px-5 py-2.5 rounded-xl
                                                               hover:bg-accent/90 transition-colors"
                                                >
                                                    Connect wallet
                                                </button>
                                            )}
                                        </ConnectKitButton.Custom>
                                        <p className="text-[0.67rem] text-muted-2">
                                            Then prove your email to unlock
                                        </p>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-2.5">
                                        {verifyUrl && (
                                            <Link
                                                href={verifyUrl}
                                                className="block w-full bg-accent text-white text-[0.82rem]
                                                           font-semibold px-5 py-2.5 rounded-xl
                                                           hover:bg-accent/90 transition-colors text-center"
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

                {/* ── Integration snippet ───────────────────────────────────── */}
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                        <p className="text-[0.7rem] font-mono text-muted-2">the integration</p>
                        <span className="text-[0.62rem] font-mono bg-accent/10 text-accent
                                         border border-accent/20 px-1.5 py-0.5 rounded-full">
                            3 lines
                        </span>
                    </div>
                    <pre className="px-4 py-3.5 text-[0.74rem] font-mono text-muted leading-relaxed overflow-x-auto">
                        <code>{`const verified = await contract.isVerified(userAddress)
if (!verified) throw new Error("Not verified")
// Access granted — address has proven crypto history`}</code>
                    </pre>
                    <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-4">
                        <p className="text-[0.72rem] text-muted">
                            One read call. No server. No OAuth. No KYC.
                        </p>
                        <Link href="/developers" className="text-[0.72rem] text-accent hover:underline flex-shrink-0">
                            Full guide →
                        </Link>
                    </div>
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
                        className="bg-accent text-white text-[0.8rem] font-medium px-5 py-2.5
                                   rounded-lg hover:bg-accent/90 transition-colors flex-shrink-0 text-center"
                    >
                        Create a pass →
                    </Link>
                </div>

            </main>
        </div>
    );
}
