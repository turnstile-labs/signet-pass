"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { CodeBlock } from "@/components/CodeBlock";

// ── Code templates ────────────────────────────────────────────────────────────

const PASS = "0xYOUR_PASS_ADDRESS";

const CODE_REACT = `import { SignetPass } from "@signet/react";
import { useAccount } from "wagmi";

const PASS = "${PASS}";

export function App() {
    const { address } = useAccount();
    return (
        <SignetPass contract={PASS} wallet={address}>
            {/* Rendered only for verified wallets */}
            <YourGatedContent />
        </SignetPass>
    );
}`;

const CODE_HOOK = `import { usePass } from "@signet/react";
import { useAccount } from "wagmi";

const PASS = "${PASS}";

export function GatedSection() {
    const { address } = useAccount();
    const { verified, loading, recheck } = usePass({
        contract: PASS,
        wallet:   address,
    });

    if (loading)   return <Spinner />;
    if (!verified) return <ProvePrompt onVerified={recheck} />;
    return <YourGatedContent />;
}`;

const CODE_TS = `import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const client = createPublicClient({ chain: baseSepolia, transport: http() });

const hasPass = await client.readContract({
    address:      "${PASS}",
    abi:          [{ name: "isVerified", type: "function",
                     stateMutability: "view",
                     inputs:  [{ name: "wallet", type: "address" }],
                     outputs: [{ type: "bool" }] }],
    functionName: "isVerified",
    args:         ["0xCONNECTED_WALLET"],
});

if (hasPass) {
    // grant access, enable feature, unlock content...
}`;

// ── Tabs config ───────────────────────────────────────────────────────────────

const TABS = [
    { id: "react"      as const, label: "React",      hint: "gate a component",  lang: "tsx"        as const, code: CODE_REACT, filename: "SignetPass.tsx",   badge: "@signet/react", pkg: "@signet/react" },
    { id: "hook"       as const, label: "Hook",       hint: "custom UI / state", lang: "tsx"        as const, code: CODE_HOOK,  filename: "GatedSection.tsx", badge: "@signet/react", pkg: "@signet/react" },
    { id: "typescript" as const, label: "TypeScript", hint: "backend / API",     lang: "typescript" as const, code: CODE_TS,   filename: "pass.ts",          badge: "viem",          pkg: "viem"          },
] as const;

type TabId  = typeof TABS[number]["id"];
type PkgMgr = "npm" | "pnpm" | "yarn";

// ── Install command ───────────────────────────────────────────────────────────

function installCmd(mgr: PkgMgr, pkg: string): string {
    if (mgr === "npm")  return `npm install ${pkg}`;
    if (mgr === "pnpm") return `pnpm add ${pkg}`;
    return `yarn add ${pkg}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DevelopersPage() {
    const [tab,    setTab]    = useState<TabId>("react");
    const [pkgMgr, setPkgMgr] = useState<PkgMgr>("npm");

    const active = TABS.find(t => t.id === tab)!;

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-10">

                {/* ── Header ────────────────────────────────────────────────── */}
                <div>
                    <p className="font-mono text-[0.63rem] uppercase tracking-widest text-muted-2 mb-3">
                        Signet Pass · Developers
                    </p>
                    <h1 className="text-[1.9rem] sm:text-[2.2rem] font-bold tracking-tight text-white leading-[1.1] mb-2">
                        Integrate
                    </h1>
                    <p className="text-[0.88rem] text-muted leading-relaxed">
                        One read call — no server, no OAuth, no database.
                        Gate any component, API route, or backend with a verified exchange account check.
                    </p>
                </div>

                {/* ── No-code callout ───────────────────────────────────────── */}
                <Link
                    href="/create"
                    className="flex items-center justify-between gap-4 rounded-xl border border-border
                               bg-surface px-4 py-3.5 hover:border-accent/40 hover:bg-surface-2/60
                               transition-colors group"
                >
                    <div>
                        <p className="text-[0.82rem] font-medium text-text">Just want to create a gate?</p>
                        <p className="text-[0.74rem] text-muted mt-0.5">No code required — deploy in one transaction. →</p>
                    </div>
                    <span className="text-muted-2 group-hover:text-accent transition-colors text-sm flex-shrink-0">→</span>
                </Link>

                {/* ── How it works in one line ──────────────────────────────── */}
                <div className="space-y-3">
                    <p className="text-[0.8rem] font-semibold text-text">How it works</p>
                    <div className="grid gap-2">
                        {[
                            { n: "1", text: "Deploy a pass contract — sets a cutoff date and optional exchange filter." },
                            { n: "2", text: "Share the verify URL — users prove their account age with a ZK email proof." },
                            { n: "3", text: "Call isVerified(address) — returns true for any wallet that completed the proof." },
                        ].map(({ n, text }) => (
                            <div key={n} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                                <span className="font-mono text-[0.65rem] text-muted-2 mt-0.5 w-3 shrink-0">{n}</span>
                                <p className="text-[0.8rem] text-muted leading-relaxed">{text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Code snippets ─────────────────────────────────────────── */}
                <div className="space-y-3">
                    <p className="text-[0.8rem] font-semibold text-text">Integration</p>

                    <div className="rounded-xl border border-border bg-surface overflow-hidden">

                        {/* Tab bar */}
                        <div className="flex border-b border-border px-2 pt-1 overflow-x-auto">
                            {TABS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={`flex-shrink-0 px-4 py-3 min-h-[44px] text-[0.8rem] font-medium
                                                border-b-2 -mb-px transition-colors cursor-pointer ${
                                        tab === t.id
                                            ? "border-accent text-text"
                                            : "border-transparent text-muted hover:text-text"
                                    }`}
                                >
                                    {t.label}
                                    <span className={`hidden sm:block text-[0.63rem] font-normal mt-0.5 ${
                                        tab === t.id ? "text-accent" : "text-muted-2"
                                    }`}>
                                        {t.hint}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Install */}
                        <div className="px-4 py-3 border-b border-border">
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                                <span className="font-mono text-[0.63rem] uppercase tracking-widest text-muted-2 shrink-0">
                                    Install
                                </span>
                                <code className="flex-1 font-mono text-[0.76rem] text-text truncate min-w-0">
                                    {installCmd(pkgMgr, active.pkg)}
                                </code>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    {(["npm", "pnpm", "yarn"] as const).map(pm => (
                                        <button
                                            key={pm}
                                            onClick={() => setPkgMgr(pm)}
                                            className={`font-mono text-[0.63rem] px-2 py-1.5 rounded
                                                        transition-colors cursor-pointer min-h-[32px] ${
                                                pkgMgr === pm
                                                    ? "bg-accent/15 text-accent"
                                                    : "text-muted-2 hover:text-text"
                                            }`}
                                        >
                                            {pm}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Code */}
                        <div className="px-4 py-4">
                            <CodeBlock
                                code={active.code}
                                language={active.lang}
                                filename={active.filename}
                                badge={active.badge}
                            />
                        </div>

                    </div>

                    <p className="text-[0.73rem] text-muted-2 px-1">
                        Replace <code className="font-mono text-[0.72rem] text-muted">0xYOUR_PASS_ADDRESS</code> with
                        your deployed contract address.{" "}
                        <Link href="/create" className="text-accent hover:underline">
                            Create a gate →
                        </Link>
                    </p>
                </div>

                {/* ── Reference ─────────────────────────────────────────────── */}
                <div className="space-y-3">
                    <p className="text-[0.8rem] font-semibold text-text">Contract reference</p>
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                        <div className="divide-y divide-border">
                            {[
                                { sig: "isVerified(address) → bool",  desc: "Returns true if this wallet has completed the ZK proof." },
                                { sig: "isEligible(address) → bool",  desc: "Returns true if the wallet has an on-chain attestation (may not have called verify yet)." },
                                { sig: "cutoff() → uint256",          desc: "Unix timestamp — emails older than this date qualify." },
                                { sig: "getAllowedHashes() → uint256[]", desc: "List of approved DKIM key hashes. Empty = any supported exchange." },
                            ].map(({ sig, desc }) => (
                                <div key={sig} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                                    <code className="font-mono text-[0.72rem] text-accent shrink-0 sm:w-64 leading-relaxed">
                                        {sig}
                                    </code>
                                    <p className="text-[0.76rem] text-muted leading-relaxed">{desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}
