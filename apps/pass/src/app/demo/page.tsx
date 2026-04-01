import Link from "next/link";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
    title:       "Demos — Signet Pass",
    description: "Live Signet Pass gates deployed on Base Sepolia. Try the real verification flow — ZK proof in the browser, on-chain check, content reveal.",
};

// ── Demo registry ─────────────────────────────────────────────────────────────
// Add new demos here; they appear as cards in the list automatically.

const DEMOS = [
    {
        href:        "/demo/access",
        eyebrow:     "Secret URL reveal · Community access",
        title:       "Private Discord Invite",
        description: "Gate a secret Discord invite behind a ZK proof. Verified wallets see the link — no bot, no role assignment, no Discord integration.",
        tags:        ["Wallet required", "Any exchange", "Zero integration", "Testnet"],
        status:      "active" as const,
    },
    {
        href:        "/demo/presale",
        eyebrow:     "Token presale · Base Sepolia",
        title:       "SGNL — Private Round 1",
        description: "Whitelist gate for a fictional token presale. Connect a wallet and verify your crypto account history to secure an allocation.",
        tags:        ["Wallet required", "Any exchange", "Testnet"],
        status:      "active" as const,
    },
    {
        href:        "/demo/badge",
        eyebrow:     "Soulbound NFT · Base Sepolia",
        title:       "Verified Member Badge",
        description: "Gate an on-chain mint with Signet. Verified wallets mint a non-transferable badge — one per address, forever on-chain.",
        tags:        ["Wallet required", "Any exchange", "On-chain mint", "Testnet"],
        status:      "active" as const,
    },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DemosPage() {
    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-8">

                {/* Header */}
                <div>
                    <h1 className="text-[1.8rem] sm:text-[2.2rem] font-bold tracking-tight text-white leading-[1.1] mb-2">
                        Demos
                    </h1>
                    <p className="text-[0.88rem] text-muted">
                        Live gates deployed on Base Sepolia — interact with the real thing.
                    </p>
                </div>

                {/* Demo list */}
                <div className="space-y-3">
                    {DEMOS.map(({ href, eyebrow, title, description, tags, status }) => (
                        <Link
                            key={href}
                            href={href}
                            className="block rounded-2xl border border-border bg-surface px-5 py-4
                                       hover:border-accent/40 hover:bg-surface-2/60 transition-colors group"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-2 mb-1.5">
                                        {eyebrow}
                                    </p>
                                    <p className="text-[0.88rem] font-semibold text-text mb-1">
                                        {title}
                                    </p>
                                    <p className="text-[0.76rem] text-muted leading-relaxed">
                                        {description}
                                    </p>
                                </div>
                                {status === "active" && (
                                    <span className="text-[0.65rem] font-medium text-green flex-shrink-0">
                                        ● active
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                                {tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="text-[0.62rem] font-mono bg-bg border border-border
                                                   px-2 py-0.5 rounded-full text-muted-2"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </Link>
                    ))}
                </div>

            </main>
        </div>
    );
}
