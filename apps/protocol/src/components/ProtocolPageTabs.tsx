"use client";

import { useState } from "react";
import { ProtocolWizard } from "./ProtocolWizard";
import { FrontendDemo }   from "./FrontendDemo";
import { CodeBlock }      from "./CodeBlock";

type Tab = "contracts" | "frontend";

const ADDRESSES = [
    { name: "AttestationCache", network: "Base Sepolia", addr: "0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1", href: "https://sepolia.basescan.org/address/0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1" },
    { name: "DKIMRegistry",     network: "Base Sepolia", addr: "0xd984F26057A990a4f4de5A36faF7968b818BAe46", href: "https://sepolia.basescan.org/address/0xd984F26057A990a4f4de5A36faF7968b818BAe46" },
    { name: "Groth16Verifier",  network: "Base Sepolia", addr: "0x55e90a3c1330220307eC085281C307Dd0D94A3E7", href: "https://sepolia.basescan.org/address/0x55e90a3c1330220307eC085281C307Dd0D94A3E7" },
];

const DOMAINS = [
    { domain: "coinbase.com",  constant: "COINBASE_PUBKEY_HASH",  status: "✓ Live" },
    { domain: "binance.com",   constant: "BINANCE_PUBKEY_HASH",   status: "✓ Live" },
    { domain: "kraken.com",    constant: "KRAKEN_PUBKEY_HASH",    status: "✓ Live" },
    { domain: "okx.com",       constant: "OKX_PUBKEY_HASH",       status: "✓ Live" },
    { domain: "bybit.com",     constant: "BYBIT_PUBKEY_HASH",     status: "✓ Live" },
    { domain: "gemini.com",    constant: "GEMINI_PUBKEY_HASH",    status: "✓ Live" },
    { domain: "robinhood.com", constant: "ROBINHOOD_PUBKEY_HASH", status: "✓ Live" },
    { domain: "crypto.com",    constant: "CRYPTO_PUBKEY_HASH",    status: "✓ Live" },
    { domain: "kucoin.com",    constant: "KUCOIN_PUBKEY_HASH",    status: "✓ Live" },
];

function CopyAddrBtn({ addr }: { addr: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="font-mono text-[0.68rem] px-2 py-0.5 rounded text-muted-2
                       hover:text-accent hover:bg-accent/8 transition-colors cursor-pointer shrink-0"
        >
            {copied ? "✓" : "⎘"}
        </button>
    );
}

export function ProtocolPageTabs() {
    const [tab, setTab] = useState<Tab>("contracts");

    return (
        <div>
            {/* ── Tab bar ──────────────────────────────────────────────────── */}
            <div className="flex gap-1 border-b border-border mb-10 w-full">
                {([
                    { id: "contracts", label: "@signet/contracts" },
                    { id: "frontend",  label: "@signet/react"     },
                ] as { id: Tab; label: string }[]).map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-3 text-sm font-medium transition-colors cursor-pointer
                                    border-b-2 -mb-px
                                    ${tab === t.id
                                        ? "border-accent text-text"
                                        : "border-transparent text-muted hover:text-text"
                                    }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Contracts tab ────────────────────────────────────────────── */}
            {tab === "contracts" && (
                <div className="space-y-14">

                    <p className="text-[0.88rem] text-muted leading-relaxed -mt-4">
                        One view call — <code className="font-mono text-[0.82rem] text-text">getAttestation(wallet)</code> — returns
                        the on-chain record of a wallet&apos;s verified exchange account age.
                        Gate your airdrop with your own snapshot cutoff. No ZK knowledge required.
                    </p>

                    {/* Contract wizard */}
                    <section>
                        <h2 className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2 mb-1">
                            Contract wizard
                        </h2>
                        <p className="text-[0.82rem] text-muted mb-6">
                            Set your cutoff date and target exchange — get a production-ready Solidity contract pre-wired to Signet.
                        </p>
                        <ProtocolWizard />
                    </section>

                    {/* Install */}
                    <section>
                        <h2 className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2 mb-1">
                            Install
                        </h2>
                        <p className="text-[0.82rem] text-muted mb-4">
                            Pull in OpenZeppelin and Signet&apos;s Solidity interfaces.
                        </p>
                        <div className="space-y-2">
                            {[
                                { label: "forge", cmd: "forge install OpenZeppelin/openzeppelin-contracts" },
                                { label: "npm",   cmd: "npm install @signet/contracts" },
                                { label: "pnpm",  cmd: "pnpm add @signet/contracts" },
                            ].map(p => (
                                <CodeBlock key={p.label} code={p.cmd} language="bash" filename={p.label} />
                            ))}
                        </div>
                    </section>

                    {/* Deployed addresses */}
                    <section>
                        <h2 className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2 mb-1">
                            Deployed contracts · Base Sepolia
                        </h2>
                        <p className="text-[0.82rem] text-muted mb-4">
                            Mainnet deployment in progress. Audited — import and inherit, don&apos;t redeploy.
                        </p>
                        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                            {ADDRESSES.map(r => (
                                <div key={r.addr}
                                     className="flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-2 transition-colors gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="font-mono text-[0.8rem] text-text shrink-0">{r.name}</span>
                                        <span className="text-[0.72rem] text-muted-2 shrink-0 hidden sm:block">{r.network}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <code className="font-mono text-[0.68rem] text-muted-2 hidden lg:block">{r.addr}</code>
                                        <code className="font-mono text-[0.68rem] text-muted-2 lg:hidden">
                                            {r.addr.slice(0, 8)}…{r.addr.slice(-6)}
                                        </code>
                                        <CopyAddrBtn addr={r.addr} />
                                        <a href={r.href} target="_blank" rel="noopener noreferrer"
                                           className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                                            ↗
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* DKIM domains */}
                    <section>
                        <h2 className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2 mb-1">
                            Registered email domains
                        </h2>
                        <p className="text-[0.82rem] text-muted mb-6">
                            KYC-gated exchanges only — the strongest sybil signal on-chain.
                        </p>
                        <div className="rounded-xl border border-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-surface-2">
                                        <th className="text-left px-4 py-2.5 text-[0.72rem] font-mono text-muted-2">Domain</th>
                                        <th className="text-left px-4 py-2.5 text-[0.72rem] font-mono text-muted-2 hidden sm:table-cell">Constant</th>
                                        <th className="text-left px-4 py-2.5 text-[0.72rem] font-mono text-muted-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {DOMAINS.map(r => (
                                        <tr key={r.domain} className="bg-surface hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 font-mono text-[0.78rem] text-text">{r.domain}</td>
                                            <td className="px-4 py-2.5 font-mono text-[0.72rem] text-muted hidden sm:table-cell">{r.constant}</td>
                                            <td className={`px-4 py-2.5 text-[0.78rem] ${r.status.startsWith("✓") ? "text-green" : "text-muted-2"}`}>
                                                {r.status}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                </div>
            )}

            {/* ── Frontend tab ─────────────────────────────────────────────── */}
            {tab === "frontend" && (
                <div className="space-y-14">
                    <p className="text-[0.88rem] text-muted leading-relaxed -mt-4">
                        Wrap your claim button with{" "}
                        <code className="font-mono text-[0.82rem] text-text">{"<SignetGate>"}</code>.
                        Signet checks the on-chain attestation, handles the verification redirect,
                        and returns the user to your app — your frontend just renders the result.
                    </p>
                    <FrontendDemo />
                </div>
            )}
        </div>
    );
}
