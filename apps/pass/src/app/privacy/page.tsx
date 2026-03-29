import { SiteNav } from "@/components/SiteNav";

export const metadata = {
    title: "Privacy Policy — Signet",
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />
            <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 space-y-8">
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-3">
                        Signet · Legal
                    </p>
                    <h1 className="text-[2rem] font-bold tracking-tight text-white leading-[1.1] mb-3">
                        Privacy Policy
                    </h1>
                    <p className="text-[0.8rem] text-muted-2">Last updated: March 2026</p>
                </div>

                <div className="space-y-6 text-[0.9rem] text-muted leading-relaxed">
                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">What we collect</h2>
                        <p>
                            Signet Pass does not collect personal data. The zero-knowledge proof
                            process runs entirely in your browser. Your email contents are never
                            transmitted to our servers.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">On-chain data</h2>
                        <p>
                            When you verify a pass, your wallet address and a timestamp are recorded
                            on the Base blockchain. This data is public and immutable by design.
                            No email addresses or personal identifiers are stored on-chain.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">ZK proofs</h2>
                        <p>
                            The proof reveals only that you control an exchange account older than a
                            specified date. It does not reveal your email address, account balance,
                            transaction history, or any other personal information.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">Analytics</h2>
                        <p>
                            We do not use third-party analytics trackers. Standard server access logs
                            may be retained for security purposes and are not shared with third parties.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">Contact</h2>
                        <p>
                            Questions about privacy? Reach us at{" "}
                            <a href="mailto:privacy@signet.xyz"
                               className="text-accent hover:text-accent/80 transition-colors">
                                privacy@signet.xyz
                            </a>.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
