import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full px-5 py-10 sm:py-16">

                {/* ── Hero ─────────────────────────────────────────────────── */}
                <h1 className="text-[2.2rem] sm:text-[3rem] font-bold tracking-tight text-white
                                leading-[1.06] mb-5">
                    You can fake<br />a retina scan.<br />
                    <span className="text-accent">Not a 5-year receipt.</span>
                </h1>

                <p className="text-[0.95rem] text-muted leading-relaxed mb-8 max-w-lg">
                    Signet Pass lets anyone gate access using verified exchange account history —
                    privately, in the browser, in ~30 seconds.
                    No KYC. No bots. No code required to get started.
                </p>

                {/* ── CTAs ──────────────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-3 mb-12">
                    <Link
                        href="/create?tab=create"
                        className="bg-accent font-semibold px-6 py-3 rounded-xl text-[0.9rem]
                                   hover:opacity-90 transition-opacity text-center"
                        style={{ color: "#fff" }}
                    >
                        Create a pass →
                    </Link>
                    <Link
                        href="/demo"
                        className="border border-border px-6 py-3 rounded-xl text-[0.9rem]
                                   text-muted hover:text-text hover:border-text/30
                                   transition-colors text-center"
                    >
                        See demos
                    </Link>
                </div>

                {/* ── Who it's for ──────────────────────────────────────────── */}
                <div className="grid sm:grid-cols-2 gap-3">

                    <div className="rounded-xl border border-border bg-surface px-4 py-4 space-y-1.5">
                        <p className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2">
                            Founders &amp; community managers
                        </p>
                        <p className="text-[0.88rem] font-semibold text-text">
                            Deploy a pass, share a link.
                        </p>
                        <p className="text-[0.76rem] text-muted leading-relaxed">
                            Set a cutoff date, get a shareable URL. Watch your verified
                            allowlist fill up in real time — export to CSV anytime.
                        </p>
                    </div>

                    <div className="rounded-xl border border-border bg-surface px-4 py-4 space-y-1.5">
                        <p className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2">
                            Developers &amp; integrators
                        </p>
                        <p className="text-[0.88rem] font-semibold text-text">
                            One read call. Done.
                        </p>
                        <p className="text-[0.76rem] text-muted leading-relaxed">
                            <code className="font-mono text-[0.72rem] text-text/80">isVerified(address) → bool</code>.
                            Gate any component, API route, or backend —
                            no server, no OAuth, no infrastructure.
                        </p>
                    </div>

                    <div className="rounded-xl border border-border bg-surface px-4 py-4 space-y-1.5">
                        <p className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2">
                            For users
                        </p>
                        <p className="text-[0.88rem] font-semibold text-text">
                            Nothing leaves your device.
                        </p>
                        <p className="text-[0.76rem] text-muted leading-relaxed">
                            The ZK proof runs entirely in the browser. No email content,
                            no inbox access, no data ever leaves your device.
                        </p>
                    </div>

                    <div className="rounded-xl border border-border bg-surface px-4 py-4 space-y-1.5">
                        <p className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2">
                            Prove once. Valid everywhere.
                        </p>
                        <p className="text-[0.88rem] font-semibold text-text">
                            One attestation, reused forever.
                        </p>
                        <p className="text-[0.76rem] text-muted leading-relaxed">
                            A verified pass is stored on-chain. Any Signet-integrated
                            project reads the same record — no re-proving, ever.
                        </p>
                    </div>

                </div>

            </main>
        </div>
    );
}
