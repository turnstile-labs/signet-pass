"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { CodeBlock } from "@/components/CodeBlock";

// ── Code templates ────────────────────────────────────────────────────────────

const PLACEHOLDER = "0xYOUR_PASS_ADDRESS";

function makeTypescript(addr: string) {
    return `import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const client = createPublicClient({ chain: baseSepolia, transport: http() });

const hasPass = await client.readContract({
    address:      "${addr}",
    abi:          [{ name: "isVerified", type: "function", stateMutability: "view",
                     inputs: [{ name: "wallet", type: "address" }],
                     outputs: [{ type: "bool" }] }],
    functionName: "isVerified",
    args:         ["0xCONNECTED_WALLET"],
});

if (hasPass) {
    // grant access, enable feature, unlock content...
}`;
}

function makeReact(addr: string) {
    return `import { SignetPass } from "@signet/react";
import { useAccount } from "wagmi";

const PASS = "${addr}";

export function App() {
    const { address } = useAccount();
    return (
        <SignetPass contract={PASS} wallet={address}>
            {/* Only rendered for verified members */}
            <YourGatedContent />
        </SignetPass>
    );
}`;
}

function makeHook(addr: string) {
    return `import { usePass } from "@signet/react";
import { useAccount } from "wagmi";

const PASS = "${addr}";

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
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DevelopersPage() {
    const [tab,    setTab]    = useState<"react" | "hook" | "typescript">("react");
    const [pkgMgr, setPkgMgr] = useState<"npm" | "pnpm" | "yarn">("npm");

    const TABS = [
        { id: "react"      as const, label: "React",      hint: "gate a component",  lang: "tsx"        as const, code: makeReact(PLACEHOLDER),      filename: "SignetPass.tsx",   badge: "@signet/react", pkg: "@signet/react" },
        { id: "hook"       as const, label: "Hook",       hint: "custom UI / state", lang: "tsx"        as const, code: makeHook(PLACEHOLDER),       filename: "GatedSection.tsx", badge: "@signet/react", pkg: "@signet/react" },
        { id: "typescript" as const, label: "TypeScript", hint: "backend / API",     lang: "typescript" as const, code: makeTypescript(PLACEHOLDER), filename: "pass.ts",          badge: "viem",          pkg: "viem"          },
    ];
    const activeTab = TABS.find(t => t.id === tab)!;

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 space-y-8">

                {/* ── Header ────────────────────────────────────────────────── */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-3">
                        Signet Pass · Developers
                    </p>
                    <h1 className="text-[2rem] sm:text-[2.4rem] font-bold tracking-tight text-white leading-[1.1] mb-2">
                        Integrate
                    </h1>
                    <p className="text-[0.88rem] text-muted leading-relaxed">
                        One read call — no server, no OAuth, no database.
                        Gate any component, API route, or backend.{" "}
                        <Link href="/create" className="text-accent hover:underline">
                            Need a pass first? →
                        </Link>
                    </p>
                </div>

                {/* ── Integrate section ─────────────────────────────────────── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[0.85rem] font-semibold text-text">Integrate</p>
                        <span className="text-[0.72rem] text-muted">Replace address after deploying</span>
                    </div>

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
                                    <span className={`hidden sm:block text-[0.64rem] font-normal mt-0.5 ${
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
                                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 shrink-0">
                                    Install
                                </span>
                                <code className="flex-1 font-mono text-[0.76rem] text-text truncate min-w-0">
                                    {pkgMgr === "npm"  && `npm install ${activeTab.pkg}`}
                                    {pkgMgr === "pnpm" && `pnpm add ${activeTab.pkg}`}
                                    {pkgMgr === "yarn" && `yarn add ${activeTab.pkg}`}
                                </code>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    {(["npm", "pnpm", "yarn"] as const).map(pm => (
                                        <button
                                            key={pm}
                                            onClick={() => setPkgMgr(pm)}
                                            className={`font-mono text-[0.65rem] px-2 py-1.5 rounded transition-colors cursor-pointer min-h-[32px]
                                                ${pkgMgr === pm
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
                        <div className="px-4 pt-4 pb-4 space-y-2">
                            <p className="text-[0.68rem] font-mono uppercase tracking-widest text-muted-2 mb-2">
                                Code
                            </p>
                            <CodeBlock
                                code={activeTab.code}
                                language={activeTab.lang}
                                filename={activeTab.filename}
                                badge={activeTab.badge}
                            />
                        </div>

                    </div>
                </div>

                {/* ── Contract reference ────────────────────────────────────── */}
                <div className="space-y-3">
                    <p className="text-[0.85rem] font-semibold text-text">Contract reference</p>
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                        <div className="divide-y divide-border">
                            {[
                                { sig: "isVerified(address) → bool",     desc: "Returns true if this wallet has completed the ZK proof for this pass." },
                                { sig: "isEligible(address) → bool",     desc: "Returns true if the wallet has an on-chain attestation (may not have called verify yet)." },
                                { sig: "cutoff() → uint256",             desc: "Unix timestamp — emails registered before this date qualify." },
                                { sig: "getAllowedHashes() → uint256[]", desc: "Approved DKIM key hashes. Empty array = any supported exchange." },
                            ].map(({ sig, desc }) => (
                                <div key={sig} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                                    <code className="font-mono text-[0.72rem] text-accent shrink-0 sm:w-72 leading-relaxed">
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
