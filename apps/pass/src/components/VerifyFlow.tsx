"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useDisconnect, useWalletClient, useSwitchChain } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import { parseAbiItem } from "viem";
import {
    getPublicClient,
    ATTESTATION_CACHE_ADDRESS,
    ATTESTATION_CACHE_ABI,
    SIGNET_PASS_ABI,
    formatEth,
    formatDate,
    isValidAddress,
    hashesToLabels,
    hashesToDomains,
    hashToExchange,
} from "@/lib/wagmi";
import { ProveStep }      from "@/components/ProveStep";
import { ThemeToggle }    from "@/components/ThemeToggle";

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase =
    | "idle"
    | "no_contract"
    | "loading_contract"
    | "checking"
    | "needs_verification"
    | "prove"
    | "ineligible_cutoff"
    | "ineligible_exchange"
    | "already_verified"
    | "eligible"
    | "tx_pending"
    | "done"
    | "error";

interface ContractInfo {
    cutoff:        bigint;
    allowedHashes: bigint[];
    feePerCheck:   bigint;
}

interface AttestationData {
    pubkeyHash:     bigint;
    emailTimestamp: bigint;
    registeredAt:   bigint;
}

// ── Pill ───────────────────────────────────────────────────────────────────────

function Pill({ dot, label }: { dot: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg border border-border text-[0.7rem] text-muted">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {label}
        </span>
    );
}

// ── Spinner ────────────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <div className="w-4 h-4 flex-shrink-0 relative">
            <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
            <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
    contractAddress: string | null;
    passName:    string | null;
}

export function VerifyFlow({ contractAddress, passName }: Props) {
    const { address, isConnected } = useAccount();
    const { disconnect }           = useDisconnect();
    const { data: walletClient }   = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }     = useSwitchChain();

    const [phase,         setPhase]         = useState<Phase>("idle");
    const [contractInfo,  setContractInfo]  = useState<ContractInfo | null>(null);
    const [attestation,   setAttestation]   = useState<AttestationData | null>(null);
    const [txHash,        setTxHash]        = useState("");
    const [errorMsg,      setErrorMsg]      = useState("");
    const [copied,        setCopied]        = useState(false);
    const [verifiedCount, setVerifiedCount] = useState<number | null>(null);

    const prevAddressRef = useRef<string | undefined>(undefined);
    const validContract  = isValidAddress(contractAddress);

    // ── Reset on disconnect or wallet change ───────────────────────────────────
    useEffect(() => {
        if (!isConnected) {
            const nonResetPhases: Phase[] = ["idle", "no_contract", "loading_contract"];
            if (!nonResetPhases.includes(phase)) {
                setPhase("idle");
                setAttestation(null);
                setErrorMsg("");
            }
            prevAddressRef.current = undefined;
            return;
        }
        if (prevAddressRef.current && prevAddressRef.current !== address) {
            setPhase("idle");
            setAttestation(null);
            setErrorMsg("");
        }
        prevAddressRef.current = address;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, address]);

    // ── Load contract info + verified count ───────────────────────────────────
    useEffect(() => {
        if (!validContract) { setPhase("no_contract"); return; }
        setPhase("loading_contract");
        (async () => {
            try {
                const client = getPublicClient();
                const addr   = contractAddress as `0x${string}`;
                const [cutoff, allowedHashes, feePerCheck] = await Promise.all([
                    client.readContract({ address: addr, abi: SIGNET_PASS_ABI, functionName: "cutoff"           }) as Promise<bigint>,
                    client.readContract({ address: addr, abi: SIGNET_PASS_ABI, functionName: "getAllowedHashes" }) as Promise<bigint[]>,
                    client.readContract({ address: addr, abi: SIGNET_PASS_ABI, functionName: "feePerCheck"      }) as Promise<bigint>,
                ]);
                setContractInfo({ cutoff, allowedHashes: [...allowedHashes], feePerCheck });
                setPhase("idle");
            } catch {
                setPhase("error");
                setErrorMsg("Could not load this pass. The link may be incorrect.");
            }
        })();

        (async () => {
            try {
                const client = getPublicClient();
                const logs = await client.getLogs({
                    address:   contractAddress as `0x${string}`,
                    event:     parseAbiItem("event Verified(address indexed wallet)"),
                    fromBlock: 0n,
                    toBlock:   "latest",
                });
                setVerifiedCount(logs.length);
            } catch { /* non-critical */ }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractAddress]);

    // ── Check eligibility ──────────────────────────────────────────────────────
    const checkEligibility = useCallback(async () => {
        if (!isConnected || !address || !contractInfo || !validContract) return;
        setPhase("checking");
        try {
            const client = getPublicClient();
            const addr   = contractAddress as `0x${string}`;

            const alreadyVerified = await client.readContract({
                address: addr, abi: SIGNET_PASS_ABI, functionName: "isVerified", args: [address],
            }) as boolean;
            if (alreadyVerified) { setPhase("already_verified"); return; }

            const att = await client.readContract({
                address: ATTESTATION_CACHE_ADDRESS, abi: ATTESTATION_CACHE_ABI,
                functionName: "getAttestation", args: [address],
            }) as AttestationData;

            if (att.registeredAt === 0n) { setAttestation(null); setPhase("needs_verification"); return; }
            setAttestation(att);

            if (att.emailTimestamp >= contractInfo.cutoff) { setPhase("ineligible_cutoff"); return; }

            if (contractInfo.allowedHashes.length > 0 && !contractInfo.allowedHashes.includes(att.pubkeyHash)) {
                setPhase("ineligible_exchange");
                return;
            }

            setPhase("eligible");
        } catch {
            setPhase("error");
            setErrorMsg("Something went wrong checking your eligibility. Please try again.");
        }
    }, [isConnected, address, contractInfo, contractAddress, validContract]);

    useEffect(() => {
        if (isConnected && address && contractInfo && phase === "idle") {
            checkEligibility();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, address, contractInfo]);

    // ── Submit verify() ────────────────────────────────────────────────────────
    const handleVerify = useCallback(async () => {
        if (!walletClient || !address || !contractInfo || !validContract) return;
        setPhase("tx_pending");
        setErrorMsg("");
        try {
            await switchChainAsync({ chainId: baseSepolia.id });
            const addr = contractAddress as `0x${string}`;
            await getPublicClient().simulateContract({
                address: addr, abi: SIGNET_PASS_ABI, functionName: "verify",
                value: contractInfo.feePerCheck, account: address,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hash = await (walletClient.writeContract as any)({
                address: addr, abi: SIGNET_PASS_ABI, functionName: "verify",
                value: contractInfo.feePerCheck, account: address,
            }) as `0x${string}`;
            await getPublicClient().waitForTransactionReceipt({ hash });
            setTxHash(hash);
            setVerifiedCount(prev => (prev ?? 0) + 1);
            setPhase("done");
        } catch (e) {
            const raw     = e instanceof Error ? e.message : String(e);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errName = (e as any)?.cause?.data?.errorName ?? "";
            if (errName === "AlreadyVerified" || raw.includes("AlreadyVerified")) {
                setPhase("already_verified");
            } else if (errName === "SignetNoAttestation" || raw.includes("SignetNoAttestation")) {
                setPhase("needs_verification");
            } else if (errName === "SignetEmailTooRecent" || raw.includes("SignetEmailTooRecent")) {
                setPhase("ineligible_cutoff");
            } else if (errName === "SignetWrongExchange" || raw.includes("SignetWrongExchange")) {
                setPhase("ineligible_exchange");
            } else {
                setPhase("error");
                setErrorMsg(errName || raw.split("\n")[0]);
            }
        }
    }, [walletClient, address, contractInfo, contractAddress, validContract, switchChainAsync]);

    // ── Share helpers ──────────────────────────────────────────────────────────
    const shareUrl = typeof window !== "undefined"
        ? window.location.href
        : `${process.env.NEXT_PUBLIC_PASS_URL ?? "https://pass.signet.xyz"}/verify?contract=${contractAddress}${passName ? `&name=${encodeURIComponent(passName)}` : ""}`;

    const shareText = `Just got my Signet pass${passName ? ` for ${passName}` : ""}.\n\nProved account age on-chain. No bots. No fakes.`;

    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        `${shareText}\n\n${shareUrl}`
    )}`;

    const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`;

    function copyLink() {
        navigator.clipboard.writeText(shareUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    const allowedDomains = contractInfo ? hashesToDomains(contractInfo.allowedHashes) : [];

    // ── No contract ───────────────────────────────────────────────────────────
    if (phase === "no_contract") {
        return (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-xl shadow-black/15">
                <div className="px-6 pt-6 pb-5">
                    <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2 mb-1.5">
                        Signet
                    </p>
                    <h1 className="text-[1.4rem] font-bold text-white leading-tight mb-2">
                        This link looks incomplete.
                    </h1>
                    <p className="text-[0.82rem] text-muted leading-relaxed">
                        The project may have shared an incorrect URL.
                        Ask them for the correct pass link.
                    </p>
                </div>
            </div>
        );
    }

    // ── Shared card header ─────────────────────────────────────────────────────

    const cardHeader = (
        <div className="px-6 pt-5 pb-5">
            <div className="flex items-center justify-between mb-1.5">
                <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">
                    Signet
                </p>
                <div className="flex items-center gap-2">
                    {verifiedCount !== null && verifiedCount > 0 && (
                        <span className="font-mono text-[0.62rem] text-green/80 bg-green/8 border border-green/20 px-2 py-0.5 rounded-full">
                            {verifiedCount} verified
                        </span>
                    )}
                    <ThemeToggle />
                </div>
            </div>
            <h1 className="text-[1.6rem] font-bold tracking-tight text-white leading-[1.1] mb-4">
                {passName ?? "Prove eligibility"}
            </h1>

            {phase === "loading_contract" && (
                <div className="flex gap-2">
                    {[72, 88, 52].map(w => (
                        <div key={w} className="h-6 rounded-full bg-surface-2 animate-pulse" style={{ width: w }} />
                    ))}
                </div>
            )}

            {contractInfo && (
                <div className="flex flex-wrap gap-1.5">
                    <Pill dot="bg-accent/60" label={`Account before ${formatDate(contractInfo.cutoff)}`} />
                    {contractInfo.allowedHashes.length > 0
                        ? hashesToLabels(contractInfo.allowedHashes).map(label => (
                            <Pill key={label} dot="bg-blue/60" label={label} />
                          ))
                        : <Pill dot="bg-blue/60" label="Any exchange" />
                    }
                    <Pill dot="bg-green/60"
                        label={contractInfo.feePerCheck === 0n ? "Free" : formatEth(contractInfo.feePerCheck)} />
                </div>
            )}
        </div>
    );

    // ── Card footer ────────────────────────────────────────────────────────────

    const cardFooter = (
        <div className="px-6 py-3.5 border-t border-border/60 flex items-center justify-between">
            <span className="text-[0.63rem] text-muted-2 leading-none">
                Your email stays on your device — nothing is shared
            </span>
            {isConnected && (
                <button
                    onClick={() => disconnect()}
                    className="text-[0.63rem] text-muted-2 hover:text-muted transition-colors cursor-pointer leading-none"
                >
                    Disconnect
                </button>
            )}
        </div>
    );

    // ── Done / already-verified ────────────────────────────────────────────────

    if (phase === "done" || phase === "already_verified") {
        const alreadyWas = phase === "already_verified";
        return (
            <div className="rounded-2xl border border-green/25 bg-surface overflow-hidden shadow-xl shadow-black/15">
                {cardHeader}
                <div className="h-px bg-green/15" />
                <div className="px-6 py-8 text-center space-y-5">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green/10 border border-green/30">
                        <span className="text-2xl text-green">✓</span>
                    </div>

                    <div>
                        <p className="text-[1.4rem] font-bold text-green mb-1">
                            Pass confirmed.
                        </p>
                        <p className="text-[0.88rem] text-muted leading-relaxed">
                            {alreadyWas
                                ? "You already hold this pass."
                                : "Your pass is on-chain."
                            }
                        </p>
                        <p className="text-[0.75rem] text-muted-2 mt-1.5 leading-relaxed">
                            Verified once — works on every Signet-gated project, forever.
                        </p>
                    </div>

                    <div className="flex gap-2.5 justify-center flex-wrap">
                        <a href={tweetUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-2 border border-border text-[0.8rem] text-text hover:border-accent/50 hover:text-accent transition-colors">
                            <span className="font-bold">𝕏</span>
                            <span>Share</span>
                        </a>
                        <a href={castUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-2 border border-border text-[0.8rem] text-text hover:border-accent/50 hover:text-accent transition-colors">
                            <svg width="13" height="13" viewBox="0 0 1000 1000" fill="none" className="flex-shrink-0">
                                <rect width="1000" height="1000" rx="200" fill="#8A63D2"/>
                                <path d="M200 155H800V275H320V440H600V560H320V845H200Z" fill="white"/>
                            </svg>
                            <span>Cast</span>
                        </a>
                        <button onClick={copyLink}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-2 border border-border text-[0.8rem] text-text hover:border-accent/50 hover:text-accent transition-colors cursor-pointer">
                            <span>{copied ? "✓" : "🔗"}</span>
                            <span>{copied ? "Copied!" : "Copy link"}</span>
                        </button>
                    </div>

                    {txHash && (
                        <a href={`https://sepolia.basescan.org/tx/${txHash}`}
                           target="_blank" rel="noopener noreferrer"
                           className="block font-mono text-[0.7rem] text-muted-2 hover:text-accent transition-colors">
                            View on BaseScan ↗
                        </a>
                    )}
                </div>
                {cardFooter}
            </div>
        );
    }

    // ── Phase body ─────────────────────────────────────────────────────────────

    let body: React.ReactNode;

    if (phase === "loading_contract") {
        body = (
            <div className="flex items-center gap-3">
                <Spinner />
                <span className="text-[0.85rem] text-muted">Loading pass…</span>
            </div>
        );
    }

    else if (phase === "idle" && !isConnected) {
        body = (
            <div className="space-y-4">
                <p className="text-[0.88rem] text-muted leading-relaxed">
                    Connect your wallet to check if you qualify.
                    Your wallet address is your identity — no email, no personal data.
                </p>
                <ConnectKitButton.Custom>
                    {({ show }) => (
                        <button onClick={show}
                            className="w-full rounded-xl px-4 py-3 text-sm font-medium
                                bg-surface-2 border border-border-h text-text
                                hover:border-accent/50 hover:text-accent transition-colors cursor-pointer">
                            Connect wallet
                        </button>
                    )}
                </ConnectKitButton.Custom>
            </div>
        );
    }

    else if (phase === "idle" && isConnected) {
        body = (
            <div className="flex items-center gap-3">
                <Spinner />
                <span className="text-[0.85rem] text-muted">Checking if you qualify…</span>
            </div>
        );
    }

    else if (phase === "checking") {
        body = (
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <Spinner />
                    <span className="text-[0.85rem] text-muted">Checking your eligibility…</span>
                </div>
                {address && (
                    <p className="font-mono text-[0.7rem] text-muted-2 pl-7">
                        {address.slice(0, 10)}…{address.slice(-8)}
                    </p>
                )}
            </div>
        );
    }

    else if (phase === "needs_verification") {
        body = (
            <div className="space-y-4">
                <div>
                    <p className="text-[0.88rem] font-semibold text-text mb-2">
                        One-time account verification
                    </p>
                    <p className="text-[0.82rem] text-muted leading-relaxed">
                        This pass requires proof of an old exchange account.
                        You&apos;ll upload an old email — your browser verifies it locally
                        in about 30 seconds. Nothing leaves your device.
                    </p>
                    <p className="text-[0.74rem] text-muted-2 mt-2">
                        Done once. Works for every Signet project, forever.
                    </p>
                </div>
                <button
                    onClick={() => setPhase("prove")}
                    className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium hover:bg-accent/90 transition-colors cursor-pointer"
                    style={{ color: "#fff" }}>
                    Verify with an old exchange email →
                </button>
            </div>
        );
    }

    else if (phase === "prove") {
        body = (
            <ProveStep
                allowedDomains={allowedDomains}
                cutoff={contractInfo?.cutoff}
                onAttested={() => {
                    setPhase("checking");
                    setTimeout(() => checkEligibility(), 1500);
                }}
                onBack={() => setPhase("needs_verification")}
            />
        );
    }

    else if (phase === "ineligible_cutoff" && contractInfo) {
        body = (
            <div className="space-y-4">
                <div className="rounded-xl border border-border bg-bg px-5 py-4 space-y-2">
                    <p className="text-[0.88rem] font-semibold text-text">Account opened too recently</p>
                    {attestation && (
                        <p className="text-[0.82rem] text-muted leading-relaxed">
                            Your account dates to{" "}
                            <span className="font-medium text-text">{formatDate(attestation.emailTimestamp)}</span>,
                            but this pass requires an account older than{" "}
                            <span className="font-medium text-text">{formatDate(contractInfo.cutoff)}</span>.
                        </p>
                    )}
                    <p className="text-[0.74rem] text-muted-2">
                        If you have an older account on another supported exchange, try an earlier email.
                    </p>
                </div>
                <button onClick={() => { setAttestation(null); setPhase("prove"); }}
                    className="text-[0.82rem] text-accent hover:text-accent/80 transition-colors cursor-pointer">
                    Try with an older email →
                </button>
            </div>
        );
    }

    else if (phase === "ineligible_exchange" && contractInfo) {
        const exchangeNames = hashesToLabels(contractInfo.allowedHashes).join(", ") || "?";
        body = (
            <div className="space-y-4">
                <div className="rounded-xl border border-border bg-bg px-5 py-4 space-y-2">
                    <p className="text-[0.88rem] font-semibold text-text">Exchange not accepted</p>
                    <p className="text-[0.82rem] text-muted leading-relaxed">
                        This pass only accepts accounts from{" "}
                        <span className="font-medium text-text">{exchangeNames}</span>.
                    </p>
                    <p className="text-[0.74rem] text-muted-2">
                        Use an old email from one of those exchanges.
                    </p>
                </div>
                <button onClick={() => { setAttestation(null); setPhase("prove"); }}
                    className="text-[0.82rem] text-accent hover:text-accent/80 transition-colors cursor-pointer">
                    Try with a different exchange →
                </button>
            </div>
        );
    }

    else if (phase === "eligible" && attestation && contractInfo) {
        const ex = hashToExchange(attestation.pubkeyHash);
        body = (
            <div className="space-y-4">
                <div className="rounded-xl border border-green/25 bg-green/5 px-5 py-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-green/20 border border-green/40 flex items-center justify-center text-[0.6rem] text-green">✓</div>
                        <p className="text-[0.88rem] font-semibold text-green">You qualify.</p>
                    </div>
                    <p className="text-[0.82rem] text-muted leading-relaxed">
                        Account predates{" "}
                        <span className="font-medium text-text">{formatDate(contractInfo.cutoff)}</span>
                        {ex ? <> · <span className="font-medium text-text">{ex.label}</span></> : null}.
                    </p>
                    {contractInfo.feePerCheck > 0n && (
                        <div className="flex items-center justify-between pt-2 border-t border-green/15 text-[0.82rem]">
                            <span className="text-muted">Fee</span>
                            <span className="font-mono font-medium text-text">{formatEth(contractInfo.feePerCheck)}</span>
                        </div>
                    )}
                </div>
                <button onClick={handleVerify}
                    className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium hover:bg-accent/90 transition-colors cursor-pointer"
                    style={{ color: "#fff" }}>
                    {contractInfo.feePerCheck > 0n
                        ? `Pay ${formatEth(contractInfo.feePerCheck)} · Get pass →`
                        : "Get your pass →"
                    }
                </button>
            </div>
        );
    }

    else if (phase === "tx_pending") {
        body = (
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <Spinner />
                    <span className="text-[0.85rem] text-muted">Recording your pass…</span>
                </div>
                <p className="text-[0.74rem] text-muted-2 pl-7">
                    Approve in your wallet, then wait a moment.
                </p>
            </div>
        );
    }

    else if (phase === "error") {
        body = (
            <div className="space-y-3">
                <div className="rounded-xl border border-red/25 bg-red/5 px-5 py-4">
                    <p className="text-[0.82rem] font-semibold text-red mb-1.5">Something went wrong.</p>
                    <p className="font-mono text-[0.72rem] text-muted leading-relaxed break-words">
                        {errorMsg || "An unexpected error occurred."}
                    </p>
                </div>
                <button onClick={checkEligibility}
                    className="text-[0.82rem] text-accent hover:text-accent/80 transition-colors cursor-pointer">
                    Try again
                </button>
            </div>
        );
    }

    // ── Render card ────────────────────────────────────────────────────────────

    return (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-xl shadow-black/15">
            {cardHeader}
            <div className="h-px bg-border" />
            <div className="px-6 py-6">
                {body}
            </div>
            {cardFooter}
        </div>
    );
}
