"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useDisconnect } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { SiteNav } from "@/components/SiteNav";
import { SIGNET_PASS_ABI, isValidAddress } from "@/lib/wagmi";

// ── Config ─────────────────────────────────────────────────────────────────────
// Same demo pass used by presale + badge (any exchange, no cutoff)
const DEMO_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_CONTRACT ?? "0x653454ee8e92c479a97566864da2f0dc8b9a4b62"
) as `0x${string}`;

const DEMO_NAME = "Verified Community Access";

// Secret revealed only to verified wallets.
// In production: fetched from an encrypted server-side vault after on-chain check.
// For this demo: hardcoded — the ZK verification step is still fully real.
const SECRET_INVITE_URL = "https://discord.gg/signet-verified";
const COMMUNITY_NAME    = "Signet Verified Members";
const COMMUNITY_DESC    = "Private channel for verified community members only";
const MEMBER_COUNT      = "1,247 members";

// ── Component ──────────────────────────────────────────────────────────────────

export function AccessGateClient() {
    const { address, isConnected } = useAccount();
    const { disconnect }           = useDisconnect();

    // Disconnect on every page visit so users experience the full connect flow each time
    useEffect(() => { disconnect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [verifyUrl, setVerifyUrl] = useState("");
    useEffect(() => {
        const base = process.env.NEXT_PUBLIC_PASS_URL || window.location.origin;
        const p = new URLSearchParams({
            contract: DEMO_CONTRACT,
            name:     DEMO_NAME,
            redirect: "/demo/access",
        });
        setVerifyUrl(`${base}/verify?${p.toString()}`);
    }, []);

    // ── On-chain eligibility check ─────────────────────────────────────────────
    const { data: verified, isLoading: checking } = useReadContract({
        address:      isValidAddress(DEMO_CONTRACT) ? DEMO_CONTRACT : undefined,
        abi:          SIGNET_PASS_ABI,
        functionName: "isVerified",
        args:         address ? [address] : undefined,
        query:        { enabled: !!address && isValidAddress(DEMO_CONTRACT) },
    });

    const unlocked = isConnected && verified === true;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-6">

                {/* Heading */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-2">
                        Live demo · Base Sepolia
                    </p>
                    <h1 className="text-[1.6rem] sm:text-[2rem] font-bold tracking-tight text-white leading-[1.1]">
                        Secret URL Reveal
                    </h1>
                    <p className="text-[0.82rem] text-muted mt-2 leading-relaxed">
                        A private Discord link — visible only to verified wallets.
                        No bot. No role assignment. No integration with Discord.
                    </p>
                </div>

                {/* Gate card */}
                <div className="relative rounded-2xl border border-border overflow-hidden">

                    {/* Discord invite card — always rendered, blurred when locked */}
                    <div
                        style={{
                            filter:        unlocked ? "none" : "blur(7px)",
                            transition:    "filter 0.7s ease",
                            userSelect:    unlocked ? "auto" : "none",
                            pointerEvents: unlocked ? "auto" : "none",
                        }}
                        aria-hidden={!unlocked}
                    >
                        <div className="p-6 space-y-5">

                            {/* Discord-style invite card */}
                            <div className="rounded-xl border border-border bg-bg p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    {/* Server icon */}
                                    <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center
                                                    justify-center text-xl flex-shrink-0">
                                        🔑
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[0.78rem] font-mono text-muted-2 mb-0.5">
                                            You have been invited to join
                                        </p>
                                        <p className="text-[1rem] font-semibold text-white leading-tight truncate">
                                            {COMMUNITY_NAME}
                                        </p>
                                        <p className="text-[0.72rem] text-muted truncate">
                                            {COMMUNITY_DESC}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-border">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green" />
                                        <span className="text-[0.68rem] text-muted">
                                            {MEMBER_COUNT} · Verified members only
                                        </span>
                                    </div>
                                    <a
                                        href={SECRET_INVITE_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-accent text-[0.78rem] font-semibold
                                                   px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                                        style={{ color: "#fff" }}
                                    >
                                        Join server →
                                    </a>
                                </div>
                            </div>

                            {/* Invite URL */}
                            <div className="rounded-xl border border-border bg-bg px-4 py-3">
                                <p className="font-mono text-[0.65rem] text-muted-2 mb-1 uppercase tracking-wider">
                                    Your invite link
                                </p>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-mono text-[0.8rem] text-accent truncate">
                                        {SECRET_INVITE_URL}
                                    </span>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(SECRET_INVITE_URL)}
                                        className="text-[0.68rem] text-muted-2 hover:text-muted transition-colors flex-shrink-0"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            {/* "Prove once" callout */}
                            <div className="rounded-xl border border-green/20 bg-green/5 px-4 py-3">
                                <p className="text-[0.75rem] text-green/80 leading-relaxed">
                                    <span className="font-semibold text-green">Verified.</span>
                                    {" "}Your proof is valid on every Signet-gated project —
                                    no re-proving needed.
                                </p>
                            </div>

                        </div>
                    </div>

                    {/* Lock overlay */}
                    {!unlocked && (
                        <div className="absolute inset-0 flex items-center justify-center
                                        bg-bg/80 backdrop-blur-[3px] px-6">
                            <div className="flex flex-col items-center text-center max-w-[300px] w-full space-y-4">

                                <div className="w-11 h-11 rounded-2xl border border-border bg-surface
                                                flex items-center justify-center text-xl">
                                    🔒
                                </div>

                                <div>
                                    <h3 className="text-[1rem] font-semibold text-white mb-1">
                                        Private invite
                                    </h3>
                                    <p className="text-[0.75rem] text-muted">
                                        Verify your crypto account history to unlock this invite link
                                    </p>
                                </div>

                                <span className="inline-block font-mono text-[0.62rem] bg-surface
                                                 border border-border px-2.5 py-1 rounded-full text-muted-2">
                                    Any exchange
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
                                                    className="w-full bg-accent text-[0.82rem] font-semibold
                                                               px-5 py-2.5 rounded-xl hover:bg-accent/90 transition-colors"
                                                    style={{ color: "#fff" }}
                                                >
                                                    Connect wallet
                                                </button>
                                            )}
                                        </ConnectKitButton.Custom>
                                        <p className="text-[0.67rem] text-muted-2">
                                            Then prove your email to get access
                                        </p>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-2.5">
                                        {verifyUrl && (
                                            <Link
                                                href={verifyUrl}
                                                className="block w-full bg-accent text-[0.82rem] font-semibold
                                                           px-5 py-2.5 rounded-xl hover:bg-accent/90 transition-colors text-center"
                                                style={{ color: "#fff" }}
                                            >
                                                Prove eligibility →
                                            </Link>
                                        )}
                                        <p className="text-[0.67rem] text-muted-2 leading-snug">
                                            Drop an exchange email · ZK proof in ~30 s · nothing leaves your device
                                        </p>
                                        <button
                                            onClick={() => disconnect()}
                                            className="w-full text-[0.67rem] text-muted-2 hover:text-muted transition-colors pt-0.5"
                                        >
                                            {address?.slice(0, 6)}…{address?.slice(-4)} · Disconnect
                                        </button>
                                    </div>
                                )}

                            </div>
                        </div>
                    )}
                </div>

                {/* "Zero integration" callout */}
                <div className="rounded-xl border border-border bg-surface px-5 py-4 space-y-3">
                    <p className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2">
                        How this works
                    </p>
                    <div className="space-y-2">
                        {[
                            { step: "1", text: "Creator pastes a secret URL into Signet Pass — no code, no Discord bot." },
                            { step: "2", text: "User proves a crypto exchange account with a ZK email proof." },
                            { step: "3", text: "On-chain pass is issued. Secret URL is revealed." },
                        ].map(({ step, text }) => (
                            <div key={step} className="flex items-start gap-3">
                                <span className="font-mono text-[0.65rem] text-muted-2 bg-bg border border-border
                                                 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {step}
                                </span>
                                <p className="text-[0.78rem] text-muted leading-relaxed">{text}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-[0.67rem] text-muted-2 pt-1 border-t border-border">
                        In production the URL is encrypted server-side — this demo uses a hardcoded invite to show the UX.
                    </p>
                </div>

            </main>
        </div>
    );
}
