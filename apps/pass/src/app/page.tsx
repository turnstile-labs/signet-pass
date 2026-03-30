import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col">

            <SiteNav />

            <main className="flex-1 flex flex-col justify-center max-w-3xl mx-auto px-6 py-20">

                {/* ── Hero ──────────────────────────────────────────────────── */}
                <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-2 mb-5">
                    Signet Pass
                </p>

                <h1 className="text-[2.2rem] sm:text-[2.8rem] lg:text-[3.4rem] font-bold tracking-tight text-white leading-[1.08] mb-5">
                    You can fake<br />a retina scan.<br />Not a 5-year receipt.
                </h1>

                <p className="text-[1rem] font-semibold text-text mb-3">
                    A verified access pass. Backed by cryptographic history.
                </p>

                <p className="text-[1.05rem] text-muted leading-relaxed mb-10">
                    Create a Signet Pass in one transaction — set a cutoff date, share the link.
                    Users drop an old exchange email, generate a ZK proof in the browser in ~30 seconds,
                    and claim their pass on-chain. Nothing leaves their device.
                    No bots. No self-reported claims. No KYC.
                </p>

                {/* ── CTAs ─────────────────────────────────────────────────── */}
                <div className="flex items-center gap-3 flex-wrap mb-10">
                    <Link
                        href="/demo"
                        className="bg-accent font-medium px-6 py-2.5 rounded-lg text-sm
                                   hover:bg-accent/90 transition-colors"
                        style={{ color: "#fff" }}
                    >
                        Try the demo →
                    </Link>
                    <Link
                        href="/developers"
                        className="border border-border px-6 py-2.5 rounded-lg text-sm text-muted
                                   hover:text-text hover:border-text/30 transition-colors"
                    >
                        Create a pass
                    </Link>
                    <Link
                        href="/how-it-works"
                        className="px-3 py-2.5 text-sm text-muted hover:text-text transition-colors"
                    >
                        How it works
                    </Link>
                </div>

                {/* ── Trust signals ─────────────────────────────────────────── */}
                <div className="grid sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-4">
                        <span className="text-lg mt-0.5 flex-shrink-0">🔒</span>
                        <div>
                            <p className="text-[0.85rem] font-semibold text-text mb-1">
                                Nothing leaves the browser.
                            </p>
                            <p className="text-[0.76rem] text-muted leading-relaxed">
                                The ZK proof runs entirely on the user&apos;s device.
                                No email content, no inbox, no server — zero data exposure.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-4">
                        <span className="text-lg mt-0.5 flex-shrink-0">⚖️</span>
                        <div>
                            <p className="text-[0.85rem] font-semibold text-text mb-1">
                                A pass, not a security.
                            </p>
                            <p className="text-[0.76rem] text-muted leading-relaxed">
                                No token allocation. No financial instrument. No KYC red tape.
                                A credential proving historical exchange activity — nothing more.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-4">
                        <span className="text-lg mt-0.5 flex-shrink-0">🔁</span>
                        <div>
                            <p className="text-[0.85rem] font-semibold text-text mb-1">
                                Prove once. Valid everywhere.
                            </p>
                            <p className="text-[0.76rem] text-muted leading-relaxed">
                                One attestation stored on-chain, reused across every
                                Signet-integrated project — no re-proving ever needed.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-4">
                        <span className="text-lg mt-0.5 flex-shrink-0">🛠️</span>
                        <div>
                            <p className="text-[0.85rem] font-semibold text-text mb-1">
                                One read call to integrate.
                            </p>
                            <p className="text-[0.76rem] text-muted leading-relaxed">
                                <code className="font-mono text-text text-[0.72rem]">isVerified(address) → bool</code>.
                                Gate a React component, a Next.js API route, or any backend —
                                zero infrastructure required.
                            </p>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}
