import { ProtocolPageTabs } from "@/components/ProtocolPageTabs";
import { SiteNav } from "@/components/SiteNav";

export default function DevelopersPage() {
    return (
        <div className="min-h-screen flex flex-col">

            <SiteNav wide />

            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-14">

                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="mb-12">
                    <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-2 mb-4">
                        Signet Protocol · Developers
                    </p>
                    <h1 className="text-[2.4rem] font-bold tracking-tight text-white leading-[1.1] mb-4">
                        Gate access.<br />In one view call.
                    </h1>
                    <p className="text-[1rem] text-muted leading-relaxed">
                        Signet gives your contract a permanent, on-chain record of each
                        user&apos;s verified exchange account age. One view call to enforce
                        your snapshot cutoff — no ZK knowledge, no new infrastructure, no
                        vendor lock-in. Works for airdrops, passes, or any access gate.
                    </p>
                </div>

                {/* ── Tabs ─────────────────────────────────────────────────── */}
                <ProtocolPageTabs />


            </main>
        </div>
    );
}
