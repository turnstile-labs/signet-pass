import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

const AIRDROP_URL   = process.env.NEXT_PUBLIC_AIRDROP_URL   ?? "http://localhost:3002";
const PASS_URL      = process.env.NEXT_PUBLIC_PASS_URL      ?? "http://localhost:3003";
const RUG_URL       = process.env.NEXT_PUBLIC_RUG_REGISTRY_URL ?? "http://localhost:3001";

export default function Home() {
    return (
        <div className="min-h-screen flex flex-col">

            <SiteNav wide />

            <main className="flex-1 flex flex-col justify-center max-w-3xl mx-auto px-6 py-20">

                {/* ── Hero ──────────────────────────────────────────────────── */}
                <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-2 mb-5">
                    Signet Protocol
                </p>

                <h1 className="text-[2.8rem] sm:text-[3.4rem] font-bold tracking-tight text-white leading-[1.08] mb-3">
                    Proof of person.<br />Recorded once.<br />Valid forever.
                </h1>

                <p className="text-[1.05rem] text-muted leading-relaxed mb-10">
                    Signet is a trustless, privacy-preserving attestation layer for Ethereum.
                    Prove your KYC-gated exchange account existed before a given date —
                    privately, in your browser — and write a permanent on-chain record.
                    Any smart contract can query it with a single view call. No ZK knowledge
                    required.
                </p>

                <div className="flex items-center gap-4 flex-wrap">
                    <Link
                        href="/prove"
                        className="bg-accent font-medium px-6 py-2.5 rounded-lg text-sm
                                   hover:bg-accent/90 transition-colors"
                        style={{ color: "#fff" }}
                    >
                        Get your attestation
                    </Link>
                    <Link
                        href="/developers"
                        className="border border-border px-6 py-2.5 rounded-lg text-sm text-muted
                                   hover:text-text hover:border-text/30 transition-colors"
                    >
                        Integrate Signet →
                    </Link>
                </div>

                {/* ── Trust signal ──────────────────────────────────────────── */}
                <div className="mt-10 flex items-start gap-3 rounded-xl border border-border
                                bg-surface px-4 py-4">
                    <span className="text-lg mt-0.5 flex-shrink-0">🔒</span>
                    <div>
                        <p className="text-[0.88rem] font-semibold text-text mb-1">
                            Your email never leaves your device.
                        </p>
                        <p className="text-[0.78rem] text-muted leading-relaxed">
                            ZK proof generated entirely in your browser. No email uploaded,
                            read, or stored. Verified once, readable by every protocol forever.
                        </p>
                    </div>
                </div>

                {/* ── Products built on Signet ──────────────────────────────── */}
                <div className="mt-16">
                    <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-2 mb-6">
                        Products built on Signet
                    </p>

                    <div className="space-y-3">
                        {/* Signet Airdrop */}
                        <a href={AIRDROP_URL}
                           className="group flex items-center justify-between rounded-xl border border-border
                                      bg-surface hover:border-accent/40 hover:bg-surface-2
                                      px-5 py-4 transition-colors">
                            <div className="flex items-center gap-4">
                                <span className="text-2xl">🪂</span>
                                <div>
                                    <p className="text-[0.88rem] font-semibold text-text">Signet Airdrop</p>
                                    <p className="text-[0.75rem] text-muted">
                                        Gate token claims with verified exchange account age. No bots.
                                    </p>
                                </div>
                            </div>
                            <span className="text-muted-2 text-[0.78rem] group-hover:text-accent transition-colors">
                                →
                            </span>
                        </a>

                        {/* Signet Pass */}
                        <a href={PASS_URL}
                           className="group flex items-center justify-between rounded-xl border border-border
                                      bg-surface hover:border-accent/40 hover:bg-surface-2
                                      px-5 py-4 transition-colors">
                            <div className="flex items-center gap-4">
                                <span className="text-2xl">🗒️</span>
                                <div>
                                    <p className="text-[0.88rem] font-semibold text-text">Signet Pass</p>
                                    <p className="text-[0.75rem] text-muted">
                                        Verified access passes. Real people only. Monetized.
                                    </p>
                                </div>
                            </div>
                            <span className="text-muted-2 text-[0.78rem] group-hover:text-accent transition-colors">
                                →
                            </span>
                        </a>

                        {/* Rug Registry */}
                        <a href={RUG_URL}
                           className="group flex items-center justify-between rounded-xl border border-border
                                      bg-surface hover:border-accent/40 hover:bg-surface-2
                                      px-5 py-4 transition-colors">
                            <div className="flex items-center gap-4">
                                <span className="text-2xl">🪦</span>
                                <div>
                                    <p className="text-[0.88rem] font-semibold text-text">Rug Survivor Registry</p>
                                    <p className="text-[0.75rem] text-muted">
                                        Soulbound badges for verified victims of FTX, Celsius, Mt. Gox.
                                    </p>
                                </div>
                            </div>
                            <span className="text-muted-2 text-[0.78rem] group-hover:text-accent transition-colors">
                                →
                            </span>
                        </a>
                    </div>
                </div>

            </main>
        </div>
    );
}
