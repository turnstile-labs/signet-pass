"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

function GateLinkInput() {
    const router = useRouter();
    const [value, setValue] = useState("");
    const [error, setError] = useState("");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        const raw = value.trim();
        if (!raw) return;

        try {
            // Accept full URLs or bare query strings like ?contract=0x...
            const full = raw.startsWith("http") ? raw : `https://dummy.com/${raw.startsWith("?") ? raw : `?${raw}`}`;
            const url  = new URL(full);
            const contract = url.searchParams.get("contract") ?? "";
            const name     = url.searchParams.get("name")     ?? "";
            if (contract.startsWith("0x")) {
                router.push(`/verify?contract=${contract}${name ? `&name=${encodeURIComponent(name)}` : ""}`);
                return;
            }
        } catch { /* fall through */ }

        setError("Couldn't find a gate contract in that link. Try copying the full URL you received.");
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex gap-2">
                <input
                    type="text"
                    value={value}
                    onChange={e => { setValue(e.target.value); setError(""); }}
                    placeholder="Paste your gate link here"
                    className="flex-1 min-w-0 h-[44px] bg-surface border border-border-h rounded-xl
                               px-3.5 text-[0.82rem] text-text placeholder:text-muted-2
                               outline-none focus:border-accent/50 transition-colors"
                />
                <button
                    type="submit"
                    className="h-[44px] px-4 rounded-xl bg-surface border border-border-h
                               text-[0.82rem] font-medium text-muted hover:text-text
                               hover:border-text/30 transition-colors flex-shrink-0"
                >
                    Go →
                </button>
            </div>
            {error && (
                <p className="text-[0.72rem] text-red leading-snug">{error}</p>
            )}
        </form>
    );
}

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full px-5 py-10 sm:py-16 space-y-10">

                {/* ── Hero ──────────────────────────────────────────────────── */}
                <div className="space-y-4">
                    <h1 className="text-[2.2rem] sm:text-[3rem] font-bold tracking-tight text-white leading-[1.06]">
                        You can fake<br />a retina scan.<br />
                        <span className="text-accent">Not a 5-year receipt.</span>
                    </h1>
                    <p className="text-[0.95rem] text-muted leading-relaxed max-w-md">
                        Signet Pass gates access using verified exchange account history —
                        privately, in the browser, in ~30 seconds. No KYC. No bots.
                    </p>
                </div>

                {/* ── Three paths ───────────────────────────────────────────── */}
                <div className="space-y-3">

                    {/* Gate Creator */}
                    <div className="rounded-2xl border border-border bg-surface px-5 py-5 space-y-3">
                        <div className="space-y-0.5">
                            <p className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-2">
                                Founders &amp; community managers
                            </p>
                            <p className="text-[1rem] font-semibold text-text">
                                Create a gate
                            </p>
                            <p className="text-[0.78rem] text-muted leading-relaxed">
                                Deploy a verified access link in minutes. Set criteria, share the URL,
                                watch your allowlist fill up in real time.
                            </p>
                        </div>
                        <Link
                            href="/create?tab=create"
                            className="inline-flex items-center gap-1.5 bg-accent text-[0.82rem]
                                       font-semibold px-4 py-2 rounded-xl hover:opacity-90
                                       transition-opacity"
                            style={{ color: "#fff" }}
                        >
                            Get started →
                        </Link>
                    </div>

                    {/* User */}
                    <div className="rounded-2xl border border-border bg-surface px-5 py-5 space-y-3">
                        <div className="space-y-0.5">
                            <p className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-2">
                                I have a gate link
                            </p>
                            <p className="text-[1rem] font-semibold text-text">
                                Verify your access
                            </p>
                            <p className="text-[0.78rem] text-muted leading-relaxed">
                                Paste the link you received to prove eligibility and unlock access.
                                Nothing leaves your device.
                            </p>
                        </div>
                        <GateLinkInput />
                        <p className="text-[0.7rem] text-muted-2">
                            No link yet?{" "}
                            <Link href="/demo" className="text-accent hover:underline">
                                Try a live demo →
                            </Link>
                        </p>
                    </div>

                    {/* Developer */}
                    <div className="rounded-2xl border border-border bg-surface px-5 py-5 space-y-3">
                        <div className="space-y-0.5">
                            <p className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-2">
                                Developers &amp; integrators
                            </p>
                            <p className="text-[1rem] font-semibold text-text">
                                Build with Signet
                            </p>
                            <p className="text-[0.78rem] text-muted leading-relaxed">
                                One read call:{" "}
                                <code className="font-mono text-[0.72rem] text-text/80 bg-surface-2 px-1 rounded">
                                    isVerified(address) → bool
                                </code>
                                . Contracts, ABIs, and integration examples.
                            </p>
                        </div>
                        <Link
                            href="/developers"
                            className="inline-flex items-center gap-1.5 border border-border
                                       text-[0.82rem] font-medium px-4 py-2 rounded-xl
                                       text-muted hover:text-text hover:border-text/30
                                       transition-colors"
                        >
                            View docs →
                        </Link>
                    </div>

                </div>

            </main>
        </div>
    );
}
