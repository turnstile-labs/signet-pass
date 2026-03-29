import { SiteNav } from "@/components/SiteNav";

export const metadata = {
    title: "Terms of Service — Signet",
};

export default function TermsPage() {
    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />
            <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 space-y-8">
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-3">
                        Signet · Legal
                    </p>
                    <h1 className="text-[2rem] font-bold tracking-tight text-white leading-[1.1] mb-3">
                        Terms of Service
                    </h1>
                    <p className="text-[0.8rem] text-muted-2">Last updated: March 2026</p>
                </div>

                <div className="space-y-6 text-[0.9rem] text-muted leading-relaxed">
                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">1. Acceptance</h2>
                        <p>
                            By using Signet Pass (&ldquo;the Service&rdquo;), you agree to these terms.
                            If you do not agree, do not use the Service.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">2. Description</h2>
                        <p>
                            Signet Pass is a protocol for creating cryptographically verifiable access
                            passes on the Base blockchain. It uses zero-knowledge proofs derived from
                            DKIM email signatures to verify exchange account ownership without revealing
                            private information.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">3. Beta Software</h2>
                        <p>
                            The Service is provided in beta. It may contain bugs, experience downtime,
                            or change without notice. Use it at your own risk.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">4. No Warranties</h2>
                        <p>
                            The Service is provided &ldquo;as is&rdquo; without warranty of any kind.
                            Signet makes no guarantees regarding uptime, accuracy, or fitness for a
                            particular purpose.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">5. Limitation of Liability</h2>
                        <p>
                            To the maximum extent permitted by law, Signet shall not be liable for
                            any indirect, incidental, or consequential damages arising from your use
                            of the Service.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[1rem] font-semibold text-text">6. Changes</h2>
                        <p>
                            We may update these terms at any time. Continued use of the Service
                            constitutes acceptance of the revised terms.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
