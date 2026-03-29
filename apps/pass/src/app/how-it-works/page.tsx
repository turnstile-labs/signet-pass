import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata = {
    title: "Protocol — Signet",
    description: "Time is the only unforgeable asset. How Signet gates access on verified exchange account age — privately, in the browser, recorded once on-chain.",
};

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-border pt-10 mt-10 first:border-0 first:pt-0 first:mt-0">
            <div className="flex items-start gap-4">
                <span className="font-mono text-[0.65rem] text-muted-2 mt-1 w-5 shrink-0 select-none">
                    {num}
                </span>
                <div className="flex-1 min-w-0">
                    <h2 className="text-[1.25rem] font-semibold text-text mb-3">{title}</h2>
                    <div className="text-[0.92rem] text-muted leading-relaxed space-y-3">
                        {children}
                    </div>
                </div>
            </div>
        </section>
    );
}

function Callout({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-surface px-4 py-4 text-[0.85rem] text-muted leading-relaxed">
            {children}
        </div>
    );
}

function Step({ icon, label, sub }: { icon: string; label: string; sub: string }) {
    return (
        <div className="flex items-start gap-3">
            <span className="text-base mt-0.5 shrink-0">{icon}</span>
            <div>
                <p className="text-[0.88rem] font-medium text-text">{label}</p>
                <p className="text-[0.8rem] text-muted-2">{sub}</p>
            </div>
        </div>
    );
}

export default function HowItWorksPage() {
    return (
        <div className="min-h-screen flex flex-col">

            <SiteNav />

            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-14">

                <div className="mb-14">
                    <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-2 mb-4">
                        Signet Protocol
                    </p>
                    <h1 className="text-[2.4rem] font-bold tracking-tight text-white leading-[1.1] mb-4">
                        Time is the only<br />unforgeable asset.
                    </h1>
                    <p className="text-[1rem] text-muted leading-relaxed">
                        You can spoof a biometric scan. You can forge a proxy passport.
                        But you cannot mathematically manufacture a 2019 Coinbase receipt.
                        That immutable history is the foundation of Signet.
                    </p>
                </div>

                <Section num="01" title="The illusion of demand">
                    <p>
                        Access gates have one job: measure genuine human interest. Today, they fail entirely.
                        Bot farms spin up thousands of fresh wallets in minutes, inflating your metrics
                        and drowning out real users. Your &ldquo;10,000 signups&rdquo; often translate
                        to 400 humans and 9,600 scripts.
                    </p>
                    <p>
                        Existing tools don&apos;t solve this. Social tasks are automated at scale.
                        CAPTCHAs are solved in bulk. Disposable emails bypass basic verification.
                        Wallet age is meaningless when wallets are free.
                    </p>
                    <p>
                        The result? By launch day, your true early demand is a mystery.
                        The signal you needed most is gone.
                    </p>
                </Section>

                <Section num="02" title="Unforgeable history">
                    <p>
                        Opening a KYC-gated exchange account years ago required a government-issued ID,
                        a live selfie, and days of verification. It was rate-limited, tied to a real person,
                        and bound to a specific point in time. That timestamp is an unalterable fact
                        that predates your snapshot — and it cannot be created retroactively.
                    </p>
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                        <table className="w-full text-[0.82rem]">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left px-4 py-2.5 font-mono font-medium text-muted-2">Method</th>
                                    <th className="text-left px-4 py-2.5 font-mono font-medium text-muted-2">What it proves</th>
                                    <th className="text-left px-4 py-2.5 font-mono font-medium text-muted-2">Farmable?</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-border">
                                    <td className="px-4 py-2.5 text-text font-medium">Biometrics (World ID)</td>
                                    <td className="px-4 py-2.5 text-muted">Biological uniqueness today</td>
                                    <td className="px-4 py-2.5 text-amber font-medium">Yes — retina proxies exist</td>
                                </tr>
                                <tr className="border-b border-border">
                                    <td className="px-4 py-2.5 text-text font-medium">Traditional KYC</td>
                                    <td className="px-4 py-2.5 text-muted">Legal identity today</td>
                                    <td className="px-4 py-2.5 text-amber font-medium">Yes — proxy passports exist</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 text-accent font-medium">Signet (Historical)</td>
                                    <td className="px-4 py-2.5 text-muted">Economic participation <em>yesterday</em></td>
                                    <td className="px-4 py-2.5 text-green font-medium">No — you can&apos;t fake the past</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <Callout>
                        <span className="font-medium text-text">Why not old project emails?</span>
                        {" "}Newsletter and Discord emails carry no identity guarantees —
                        anyone can generate thousands of addresses in minutes.
                        Only a KYC-gated exchange account ties a real identity to a real moment in time.
                    </Callout>
                </Section>

                <Section num="03" title="Cryptographic certainty via DKIM">
                    <p>
                        Every email sent by a major exchange is cryptographically signed by their
                        mail servers using <span className="text-text font-medium">DKIM</span>.
                        The signature is embedded in the headers — invisible to the reader,
                        but verifiable by anyone with the exchange&apos;s public key.
                    </p>
                    <p>
                        Signet leverages that signature to confirm, with absolute mathematical certainty,
                        that a specific exchange sent a specific email at an exact time —
                        without ever reading the email&apos;s contents.
                    </p>

                    <div className="rounded-xl border border-border bg-surface p-5 space-y-4 mt-2">
                        <p className="text-[0.8rem] font-mono uppercase tracking-widest text-muted-2 mb-2">
                            What happens when a user claims their pass
                        </p>
                        <Step
                            icon="✉️"
                            label="Export an old exchange email as .eml"
                            sub="A welcome email, trade confirmation, or login alert from Coinbase, Binance, Kraken, OKX, or 5 more. The older the email, the stronger the signal."
                        />
                        <Step
                            icon="🔍"
                            label="The browser verifies the DKIM signature"
                            sub="The cryptographic signature in the email header is checked against the exchange's public key — proving the email was sent, untampered, at that exact time."
                        />
                        <Step
                            icon="⚡"
                            label="A ZK proof is generated locally in ~30 seconds"
                            sub="Only the account age is extracted. Nothing else leaves the device — not the email address, not the inbox, nothing."
                        />
                        <Step
                            icon="⛓️"
                            label="The attestation is written on-chain"
                            sub="One transaction. Permanently tied to the wallet, readable by any contract, reusable across every Signet-integrated project — forever."
                        />
                    </div>
                </Section>

                <Section num="04" title="Zero friction, zero infrastructure">
                    <p>
                        Create a pass in one transaction. Set a cutoff date and an optional
                        exchange filter, share the link. No servers. No database. No vendor that
                        can shut you down.
                    </p>
                    <p>
                        Deployment costs only gas. When a user claims their pass, they pay a small
                        Signet protocol fee alongside their transaction. You collect no fees and hold no funds.
                    </p>
                    <Callout>
                        <span className="font-medium text-text">Verified once, valid everywhere.</span>
                        {" "}A user who proves their Coinbase account existed before your cutoff
                        never has to prove it again. Every Signet-integrated protocol — pass,
                        airdrop, access gate — reads the same on-chain record.
                    </Callout>
                </Section>

                <Section num="05" title="The regulatory moat: a pass is not a security">
                    <p>
                        Every other distribution mechanism in Web3 is under intense legal scrutiny.
                        Token sales, airdrops, and points programs all carry securities risk.
                        A Signet pass carries none.
                    </p>
                    <p>
                        A Signet pass is exactly what it says: a credential proving historical
                        exchange activity before a given date.
                        No promise of future value. No token allocation. No financial instrument.
                    </p>
                    <Callout>
                        <span className="font-medium text-text">The structural advantage:</span>
                        {" "}Build genuine sybil-resistant demand signal before your token launch,
                        before your TGE, before your legal structure is finalized —
                        completely outside the regulatory perimeter that governs token distribution.
                    </Callout>
                </Section>

                <div className="border-t border-border mt-14 pt-10 flex flex-col sm:flex-row gap-4">
                    <Link
                        href="/developers"
                        className="bg-accent font-medium px-6 py-2.5 rounded-lg text-sm
                                   hover:bg-accent/90 transition-colors text-center"
                        style={{ color: "#fff" }}
                    >
                        Create a pass
                    </Link>
                    <Link
                        href="/"
                        className="border border-border px-6 py-2.5 rounded-lg text-sm text-muted
                                   hover:text-text hover:border-text/30 transition-colors text-center"
                    >
                        ← Back to overview
                    </Link>
                </div>

            </main>
        </div>
    );
}
