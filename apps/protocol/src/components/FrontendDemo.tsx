"use client";

import { useState, useEffect } from "react";
import { CodeBlock } from "./CodeBlock";

// ── Code generation ───────────────────────────────────────────────────────────

function toUnix(dateStr: string) {
    return Math.floor(new Date(dateStr).getTime() / 1000);
}

function generateCode(cutoff: string) {
    return `import { SignetGate } from "@signet/react";

function ClaimPage({ userAddress }: { userAddress: string }) {
  return (
    <SignetGate
      wallet={userAddress}
      cutoff={${toUnix(cutoff)}}
      returnUrl={window.location.href}
    >
      {/* Only rendered when wallet is eligible */}
      <ClaimButton />
    </SignetGate>
  );
}`;
}

// ── Single shared card shell ──────────────────────────────────────────────────

function WidgetCard({
    borderClass,
    header,
    body,
    footer,
}: {
    borderClass: string;
    header:      React.ReactNode;
    body:        React.ReactNode;
    footer:      React.ReactNode;
}) {
    return (
        <div className={`rounded-2xl border overflow-hidden bg-surface ${borderClass}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
                {header}
            </div>
            <div className="px-4 py-4 min-h-[80px] text-[0.78rem] text-muted leading-relaxed">
                {body}
            </div>
            <div className="px-4 pb-4">
                {footer}
            </div>
        </div>
    );
}

function StatusPill({ dot, label, textClass }: { dot: string; label: string; textClass: string }) {
    return (
        <span className={`flex items-center gap-1.5 text-[0.7rem] font-medium ${textClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {label}
        </span>
    );
}

function ActionBtn({
    text, sub, bg, color = "#fff",
}: {
    text: string; sub?: string; bg: string; color?: string;
}) {
    return (
        <div className={`w-full rounded-xl px-4 py-2.5 text-center select-none cursor-default ${bg}`}
             style={{ color }}>
            <p className="text-[0.82rem] font-semibold">{text}</p>
            {sub && <p className="text-[0.65rem] mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>{sub}</p>}
        </div>
    );
}

// ── The four states ───────────────────────────────────────────────────────────

function StateChecking() {
    return (
        <WidgetCard
            borderClass="border-border"
            header={
                <>
                    <span className="text-[0.82rem] font-semibold text-text">Checking eligibility</span>
                    <StatusPill dot="bg-muted-2 animate-pulse" label="Verifying" textClass="text-muted-2" />
                </>
            }
            body={
                <div className="space-y-2 animate-pulse pt-1">
                    <div className="h-2 bg-surface-2 rounded-full w-4/5" />
                    <div className="h-2 bg-surface-2 rounded-full w-3/5" />
                </div>
            }
            footer={<div className="h-9 bg-surface-2 rounded-xl animate-pulse" />}
        />
    );
}

function StateUnattested() {
    return (
        <WidgetCard
            borderClass="border-amber/30"
            header={
                <>
                    <span className="text-[0.82rem] font-semibold text-text">Verify your eligibility</span>
                    <StatusPill dot="bg-amber" label="Step required" textClass="text-amber" />
                </>
            }
            body="To claim this airdrop, you need to confirm your exchange account existed before the snapshot date. It takes ~30 seconds and runs privately in your browser."
            footer={
                <ActionBtn
                    text="Verify account to claim"
                    bg="bg-accent"
                />
            }
        />
    );
}

function StateTooRecent() {
    return (
        <WidgetCard
            borderClass="border-border"
            header={
                <>
                    <span className="text-[0.82rem] font-semibold text-text">Not eligible for this drop</span>
                    <StatusPill dot="bg-muted-2" label="Ineligible" textClass="text-muted" />
                </>
            }
            body={
                <>
                    Your oldest verified email is from{" "}
                    <span className="font-medium text-text">Mar 2025</span>, after the
                    snapshot cutoff of{" "}
                    <span className="font-medium text-text">Jan 1, 2024</span>. Only
                    wallets attested before the snapshot qualify.
                </>
            }
            footer={
                <ActionBtn
                    text="Created after snapshot cutoff"
                    bg="bg-surface-2 border border-border"
                    color="rgb(var(--muted))"
                />
            }
        />
    );
}

function StateEligible() {
    return (
        <WidgetCard
            borderClass="border-green/30"
            header={
                <>
                    <span className="text-[0.82rem] font-semibold text-text">You&apos;re eligible</span>
                    <StatusPill dot="bg-green" label="Eligible" textClass="text-green" />
                </>
            }
            body="Your exchange account qualifies for this airdrop. Claim your allocation below."
            footer={<ActionBtn text="Claim your tokens" bg="bg-green" />}
        />
    );
}

// ── Prove flow ────────────────────────────────────────────────────────────────

function ProveFlow() {
    const steps = [
        { icon: "🔗", title: "Connect wallet",         note: "MetaMask or any EIP-1193 wallet",                                       accent: false },
        { icon: "✉️", title: "Select an exchange email", note: "Any email from Coinbase, Binance, Kraken — exported as .eml",            accent: false },
        { icon: "⚡", title: "Browser proves it",       note: "ZK proof runs locally · ~30 s · nothing leaves your device",             accent: false },
        { icon: "↩️", title: "Back to your app",        note: "Verified on-chain · works for every future airdrop, no repeat needed",   accent: true  },
    ];
    return (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
                <p className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-2">
                    What happens on signet.xyz
                </p>
            </div>
            <div className="px-4 py-4">
                {steps.map((s, i) => (
                    <div key={s.title} className="flex gap-3">
                        <div className="flex flex-col items-center flex-shrink-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center
                                             text-sm mt-0.5 flex-shrink-0
                                             ${s.accent ? "bg-accent/15 border border-accent/30"
                                                        : "bg-surface-2 border border-border"}`}>
                                {s.icon}
                            </div>
                            {i < steps.length - 1 && <div className="w-px bg-border my-1 h-4" />}
                        </div>
                        <div className="pb-3">
                            <p className={`text-[0.8rem] font-medium leading-snug
                                           ${s.accent ? "text-accent" : "text-text"}`}>
                                {s.title}
                            </p>
                            <p className="text-[0.71rem] text-muted leading-relaxed mt-0.5">{s.note}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="px-4 pb-4 pt-1 border-t border-border">
                <a href="/prove"
                   className="flex items-center justify-center gap-2 w-full rounded-xl
                              border border-accent/30 bg-accent/5 text-accent
                              text-[0.8rem] font-medium py-2.5 hover:bg-accent/10 transition-colors">
                    <span>⬡</span>
                    Try the real flow
                </a>
            </div>
        </div>
    );
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

type Scenario = "checking" | "unattested" | "too-recent" | "eligible";

const SCENARIOS: { id: Scenario; label: string; note: string }[] = [
    { id: "checking",   label: "Checking",           note: "Reading attestation on-chain"  },
    { id: "unattested", label: "First-time user",    note: "Wallet has never verified"     },
    { id: "too-recent", label: "Account too recent", note: "Verified but account too new"  },
    { id: "eligible",   label: "Already eligible",   note: "Verified and meets cutoff"     },
];

const STATE_CARD: Record<Scenario, React.ReactNode> = {
    checking:    <StateChecking />,
    unattested:  <StateUnattested />,
    "too-recent": <StateTooRecent />,
    eligible:    <StateEligible />,
};

// ── Main component ────────────────────────────────────────────────────────────

export function FrontendDemo() {
    const [scenario, setScenario] = useState<Scenario>("unattested");
    const [cutoff,   setCutoff]   = useState("2024-01-01");

    // Reset to unattested if we somehow land on checking after a re-render
    useEffect(() => {}, [scenario]);

    const code = generateCode(cutoff);

    return (
        <div className="space-y-16">

            {/* ── Widget simulator ─────────────────────────────────────────── */}
            <section>
                <h2 className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2 mb-1">
                    Widget simulator
                </h2>
                <p className="text-[0.82rem] text-muted mb-6">
                    Pick a scenario to see exactly what your users will see.
                </p>

                {/* Scenario tabs */}
                <div className="flex gap-1 border-b border-border mb-6">
                    {SCENARIOS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setScenario(s.id)}
                            className={`px-3.5 py-2.5 text-[0.78rem] font-medium border-b-2 -mb-px
                                        transition-colors cursor-pointer
                                        ${scenario === s.id
                                            ? "border-accent text-text"
                                            : "border-transparent text-muted hover:text-text"
                                        }`}
                        >
                            {s.label}
                            <span className={`hidden sm:block text-[0.65rem] font-normal mt-0.5
                                              ${scenario === s.id ? "text-accent" : "text-muted-2"}`}>
                                {s.note}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Widget — side-by-side with ProveFlow when unattested */}
                {scenario === "unattested" ? (
                    <div className="grid lg:grid-cols-2 gap-4 items-start">
                        <StateUnattested />
                        <ProveFlow />
                    </div>
                ) : (
                    <div className="max-w-sm">
                        {STATE_CARD[scenario]}
                    </div>
                )}
            </section>

            {/* ── Code ─────────────────────────────────────────────────────── */}
            <section>
                <div className="flex items-center gap-4 mb-1">
                    <h2 className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2">
                        Code
                    </h2>
                    <div className="flex items-center gap-2">
                        <label className="text-[0.72rem] text-muted">cutoff</label>
                        <input
                            type="date"
                            value={cutoff}
                            onChange={e => setCutoff(e.target.value)}
                            className="bg-surface border border-border rounded-lg px-2.5 py-1
                                       text-[0.78rem] text-text outline-none focus:border-accent/50
                                       [color-scheme:dark]"
                        />
                    </div>
                </div>
                <p className="text-[0.82rem] text-muted mb-4">
                    Set your cutoff date — the unix timestamp is embedded in the generated code automatically.
                </p>
                <CodeBlock
                    code={code}
                    language="tsx"
                    filename="ClaimPage.tsx"
                    badge="@signet/react"
                />
            </section>

            {/* ── Install ──────────────────────────────────────────────────── */}
            <section>
                <h2 className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2 mb-1">
                    Install
                </h2>
                <p className="text-[0.82rem] text-muted mb-4">
                    Add the packages to your frontend project.
                </p>
                <div className="space-y-2">
                    {[
                        { label: "npm",  cmd: "npm install @signet/react @signet/sdk viem" },
                        { label: "pnpm", cmd: "pnpm add @signet/react @signet/sdk viem" },
                        { label: "yarn", cmd: "yarn add @signet/react @signet/sdk viem" },
                    ].map(p => (
                        <CodeBlock
                            key={p.label}
                            code={p.cmd}
                            language="bash"
                            filename={p.label}
                        />
                    ))}
                </div>
            </section>

        </div>
    );
}
