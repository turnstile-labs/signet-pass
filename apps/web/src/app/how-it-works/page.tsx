import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata = {
    title: "How it works — Signet Protocol",
    description: "How Signet proves wallet ownership of a KYC-gated exchange account — privately, in your browser, recorded once on-chain. Verified once, valid forever.",
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

            <SiteNav wide />

            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-14">

                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="mb-14">
                    <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-2 mb-4">
                        Signet Protocol · How it works
                    </p>
                    <h1 className="text-[2.4rem] font-bold tracking-tight text-white leading-[1.1] mb-4">
                        History doesn&apos;t lie.<br />Neither does cryptography.
                    </h1>
                    <p className="text-[1rem] text-muted leading-relaxed">
                        A trustless, privacy-preserving way to prove your crypto exchange account
                        existed before a given date — without revealing your identity, your email,
                        or anything else.
                    </p>
                </div>

                {/* ── Sections ─────────────────────────────────────────────── */}
                <Section num="01" title="The problem: anyone can fake being early">
                    <p>
                        Airdrops are meant to reward early adopters — the people who believed
                        in a project before it had traction. But they're routinely farmed.
                        Attackers spin up thousands of fresh wallets at the moment of an
                        announcement, interact just enough to qualify, and claim a disproportionate
                        share of the allocation.
                    </p>
                    <p>
                        One entity masquerades as many. The damage is real: smaller allocations
                        for genuine early users, demoralized communities, and tokens immediately
                        dumped by bots. In the worst cases, the majority of an airdrop goes
                        to farmers — not the community it was meant for.
                    </p>
                    <p>
                        The naive fix — requiring wallets older than a certain date — doesn't
                        work. Wallets are free and take seconds to create. On-chain age alone
                        is not proof of anything.
                    </p>
                </Section>

                <Section num="02" title="The signal: your exchange account is history you can't fake">
                    <p>
                        A Coinbase, Binance, or Kraken account required government-issued ID to
                        open. It was rate-limited, tied to a real person, and impossible to
                        mass-create. The timestamp on that account is a fact that predates any
                        snapshot — and it can't be manufactured retroactively.
                    </p>
                    <p>
                        That makes KYC-gated exchange account age the strongest sybil-resistance
                        signal available on-chain today. If your account existed before the
                        snapshot date, you were almost certainly a real early user — not a bot
                        farm that spun up wallets the night before the announcement.
                    </p>
                    <Callout>
                        <span className="font-medium text-text">Why not use the project's own domain?</span>
                        {" "}Emails from a project's newsletter or app carry no identity
                        guarantee — anyone can create thousands of accounts in minutes. The
                        sybil signal requires a KYC-gated identity provider. Exchanges are
                        currently the most accessible and universally trusted option.
                    </Callout>
                </Section>

                <Section num="03" title="The proof: how your account age is verified">
                    <p>
                        Every email sent by a major exchange is cryptographically signed by
                        that exchange's mail servers using a standard called{" "}
                        <span className="text-text font-medium">DKIM</span>. This signature is
                        embedded in the email headers — it's already there in every email in
                        your inbox, invisible to you but verifiable by anyone with the
                        exchange's public key.
                    </p>
                    <p>
                        Signet uses that signature to confirm, with cryptographic certainty,
                        that a specific exchange sent a specific email at a specific time —
                        without needing to see what's in the email.
                    </p>

                    <div className="rounded-xl border border-border bg-surface p-5 space-y-4 mt-2">
                        <p className="text-[0.8rem] font-mono uppercase tracking-widest text-muted-2 mb-2">
                            The flow
                        </p>
                        <Step
                            icon="✉️"
                            label="Export an old exchange email as .eml"
                            sub="Any email from a major exchange — Coinbase, Binance, Kraken, OKX, and more. A welcome email, trade confirmation, or login alert — the older the better. Gmail, Outlook, and Apple Mail all support .eml export."
                        />
                        <Step
                            icon="🔍"
                            label="Your browser verifies the DKIM signature"
                            sub="The cryptographic signature embedded in every exchange email is checked against the exchange's public key — proving it was sent untampered."
                        />
                        <Step
                            icon="⚡"
                            label="Your browser proves the timestamp locally"
                            sub="Only the account age is extracted. A ZK proof is generated in ~30 seconds. Nothing leaves your device — not the email, not your identity."
                        />
                        <Step
                            icon="⛓️"
                            label="Your attestation is recorded on-chain"
                            sub="Your wallet submits the proof. The attestation is stored permanently — tied to your address, readable by any smart contract, reusable for every future airdrop."
                        />
                    </div>
                </Section>

                <Section num="04" title="What stays private">
                    <p>
                        The proof reveals exactly one thing: that your wallet is controlled by
                        someone who had a KYC-gated exchange account before a certain date.
                        That's it.
                    </p>
                    <p>
                        Your email address, the contents of your inbox, your exchange username,
                        your real name — none of it is seen, stored, or transmitted. The
                        computation runs entirely in your browser. Signet's servers never
                        receive your email file.
                    </p>
                    <Callout>
                        <span className="font-medium text-text">What's on-chain:</span>
                        {" "}wallet address · exchange domain · account creation timestamp
                        <br />
                        <span className="font-medium text-text">What stays private:</span>
                        {" "}email address · inbox contents · identity · everything else
                    </Callout>
                </Section>

                <Section num="05" title="Why it's trustless">
                    <p>
                        Trustless means you don't have to trust Signet. You don't have to trust
                        that our servers behave correctly or that we don't leak your data.
                        The verification happens in your browser, the proof is self-contained,
                        and the on-chain record speaks for itself.
                    </p>
                    <p>
                        Any smart contract can verify your eligibility with a single read
                        call — no API, no oracle, no dependency on Signet being online.
                        Once your attestation is on-chain, it's permanent and reusable across
                        every future airdrop that queries the same registry.
                    </p>
                    <Callout>
                        <span className="font-medium text-text">Verify once, use everywhere.</span>
                        {" "}Your attestation is a permanent, permissionless, on-chain credential.
                        Every protocol that integrates Signet can read it — no re-verification,
                        no re-uploading, no further interaction with Signet required.
                    </Callout>
                </Section>

                {/* ── CTAs ─────────────────────────────────────────────────── */}
                <div className="border-t border-border mt-14 pt-10 flex flex-col sm:flex-row gap-4">
                    <Link
                        href="/prove"
                        className="bg-accent font-medium px-6 py-2.5 rounded-lg text-sm
                                   hover:bg-accent/90 transition-colors text-center"
                        style={{ color: "#fff" }}
                    >
                        Get your attestation
                    </Link>
                    <Link
                        href="/developers"
                        className="border border-border px-6 py-2.5 rounded-lg text-sm text-muted
                                   hover:text-text hover:border-text/30 transition-colors text-center"
                    >
                        Integrate Signet →
                    </Link>
                </div>

            </main>
        </div>
    );
}
