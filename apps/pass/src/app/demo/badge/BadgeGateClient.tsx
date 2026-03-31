"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWalletClient, useSwitchChain } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { waitForCallsStatus } from "viem/experimental";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import { SiteNav } from "@/components/SiteNav";
import { SIGNET_PASS_ABI, isValidAddress, getPublicClient } from "@/lib/wagmi";

// ── Contracts ─────────────────────────────────────────────────────────────────

const PASS_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_CONTRACT ?? "0x33caf63041f4a2f36df16af1497bf8f5a50218eb"
) as `0x${string}`;

const BADGE_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_BADGE_CONTRACT ?? "0x79594813f2b5ce4747b9a885e3a10592b6f74526"
) as `0x${string}`;

const DEMO_PASS_NAME = "Verified Member Badge";

// ── Gas sponsorship — same pattern as rug-registry ────────────────────────────

const _alchemyKey   = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const PAYMASTER_URL = _alchemyKey
    ? `https://base-sepolia.g.alchemy.com/v2/${_alchemyKey}`
    : "";

// ── Badge contract ABI (minimal) ──────────────────────────────────────────────

const BADGE_ABI = [
    { inputs: [],                                    name: "mint",        outputs: [],               stateMutability: "nonpayable", type: "function" },
    { inputs: [{ name: "wallet", type: "address" }], name: "hasMinted",   outputs: [{ type: "bool" }], stateMutability: "view",    type: "function" },
    { inputs: [],                                    name: "totalMinted", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [{ name: "wallet", type: "address" }], name: "tokenOf",     outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

// ── Badge SVG preview (mirrors on-chain design) ───────────────────────────────

function BadgePreview({ tokenId, locked = false }: { tokenId?: number; locked?: boolean }) {
    return (
        <div className={`relative flex flex-col items-center justify-center p-8 rounded-2xl
                         border transition-all duration-500
                         ${locked ? "border-border/40" : "border-accent/30"}
                         bg-gradient-to-br from-[#0d0d1a] to-[#1a1030]`}
             style={{ minHeight: 240 }}>
            {!locked && (
                <div className="absolute inset-0 rounded-2xl"
                     style={{ boxShadow: "inset 0 0 60px #6366f115" }} />
            )}
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4
                              relative transition-all duration-500
                              ${locked ? "border-2 border-border/30 bg-surface/30"
                                       : "border-2 border-accent/60 bg-accent/10"}`}>
                {!locked && (
                    <div className="absolute inset-0 rounded-full"
                         style={{ boxShadow: "0 0 30px #6366f130" }} />
                )}
                <span className={`text-4xl transition-all duration-500 ${locked ? "opacity-20" : "opacity-100"}`}>
                    ✓
                </span>
            </div>
            <p className={`font-mono text-[0.7rem] font-bold tracking-[0.2em] uppercase mb-1
                           ${locked ? "text-muted-2/40" : "text-[#a5b4fc]"}`}>
                Signet
            </p>
            <p className={`font-mono text-[0.6rem] tracking-[0.15em] uppercase mb-3
                           ${locked ? "text-muted-2/30" : "text-[#7c3aed]"}`}>
                Verified Member
            </p>
            {tokenId && (
                <p className="font-mono text-[0.58rem] text-[#4b4080] mt-2">
                    # {tokenId}
                </p>
            )}
            {!locked && (
                <div className="absolute bottom-3 right-3">
                    <span className="font-mono text-[0.55rem] text-muted-2/50">Base Sepolia · SBT</span>
                </div>
            )}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BadgeGateClient() {
    const { address, isConnected }  = useAccount();
    const { data: walletClient }    = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }      = useSwitchChain();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: capabilities }    = useCapabilities() as { data: any };
    const { writeContractsAsync }   = useWriteContracts();

    type Phase = "idle" | "minting" | "minted" | "error";
    const [phase,     setPhase]     = useState<Phase>("idle");
    const [txHash,    setTxHash]    = useState("");
    const [errorMsg,  setErrorMsg]  = useState("");
    const [verifyUrl, setVerifyUrl] = useState("");

    useEffect(() => {
        const base = process.env.NEXT_PUBLIC_PASS_URL || window.location.origin;
        const p    = new URLSearchParams({ contract: PASS_CONTRACT, name: DEMO_PASS_NAME, redirect: "/demo/badge" });
        setVerifyUrl(`${base}/verify?${p.toString()}`);
    }, []);

    // ── Reads ─────────────────────────────────────────────────────────────────

    const badgeDeployed = isValidAddress(BADGE_CONTRACT);

    const { data: isVerified, isLoading: checkingVerified } = useReadContract({
        address:      PASS_CONTRACT,
        abi:          SIGNET_PASS_ABI,
        functionName: "isVerified",
        args:         [address!],
        query: { enabled: isConnected && !!address, refetchOnWindowFocus: true, staleTime: 0 },
    });

    const { data: alreadyMinted, isLoading: checkingMinted, refetch: refetchMinted } = useReadContract({
        address:      BADGE_CONTRACT,
        abi:          BADGE_ABI,
        functionName: "hasMinted",
        args:         [address!],
        query: { enabled: isConnected && !!address && badgeDeployed, refetchOnWindowFocus: true, staleTime: 0 },
    });

    const { data: tokenId } = useReadContract({
        address:      BADGE_CONTRACT,
        abi:          BADGE_ABI,
        functionName: "tokenOf",
        args:         [address!],
        query: { enabled: isConnected && !!address && badgeDeployed && !!alreadyMinted },
    });

    const { data: totalMinted } = useReadContract({
        address:      BADGE_CONTRACT,
        abi:          BADGE_ABI,
        functionName: "totalMinted",
        query: { enabled: badgeDeployed, refetchInterval: 15_000 },
    });

    // ── Mint — same pattern as rug-registry ───────────────────────────────────

    const handleMint = useCallback(async () => {
        if (!walletClient || !address) return;
        setPhase("minting");
        setErrorMsg("");
        try {
            await switchChainAsync({ chainId: baseSepolia.id });

            const chainCaps    = capabilities?.[baseSepolia.id];
            const usePaymaster = !!(chainCaps?.paymasterService?.supported && PAYMASTER_URL);

            let hash: `0x${string}`;

            if (usePaymaster) {
                const callsResult = await writeContractsAsync({
                    contracts: [{
                        address:      BADGE_CONTRACT,
                        abi:          BADGE_ABI,
                        functionName: "mint",
                        args:         [],
                    }],
                    capabilities: { paymasterService: { url: PAYMASTER_URL } },
                });
                // writeContractsAsync may return a string or { id: string } depending on viem version
                const callsId = typeof callsResult === "string" ? callsResult : callsResult.id;
                const result = await waitForCallsStatus(walletClient, {
                    id: callsId, timeout: 120_000, pollingInterval: 2_000, throwOnFailure: true,
                });
                hash = result?.receipts?.[0]?.transactionHash as `0x${string}`;
                if (!hash) throw new Error("Transaction confirmed but no receipt hash found.");
            } else {
                // EOA path — cast bypasses wagmi's narrowed WalletClient type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                hash = await (walletClient.writeContract as any)({
                    address:      BADGE_CONTRACT,
                    abi:          BADGE_ABI,
                    functionName: "mint",
                    args:         [],
                });
                await getPublicClient().waitForTransactionReceipt({ hash });
            }

            setTxHash(hash);
            await refetchMinted();
            setPhase("minted");

        } catch (err: unknown) {
            const e = err as { code?: number; message?: string; shortMessage?: string };
            if (e?.code === 4001 || e?.message?.includes("rejected")) {
                setPhase("idle");
                return;
            }
            const clean = e?.message?.includes("NotVerified")   ? "Your wallet doesn't have a valid Signet attestation yet."
                        : e?.message?.includes("AlreadyMinted") ? "This wallet already claimed a badge."
                        : e?.shortMessage ?? e?.message         ?? "Transaction failed. Please try again.";
            setErrorMsg(clean);
            setPhase("error");
        }
    }, [walletClient, address, capabilities, writeContractsAsync, switchChainAsync, refetchMinted]);

    // ── Derived state ─────────────────────────────────────────────────────────

    const checking = checkingVerified || checkingMinted;
    const eligible = isVerified === true;
    const claimed  = alreadyMinted === true || phase === "minted";
    const mintedId = tokenId ? Number(tokenId) : undefined;
    const origin   = typeof window !== "undefined" ? window.location.origin : "https://signet-pass.vercel.app";

    // ── Share links ───────────────────────────────────────────────────────────

    const shareText  = `I just minted a Signet Verified Member badge — ZK proof of crypto account history, on-chain, non-transferable.`;
    const shareUrl   = `${origin}/demo/badge`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-6">

                {/* Back */}
                <Link href="/demo"
                      className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted hover:text-text transition-colors">
                    ← Demos
                </Link>

                {/* Heading */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-2">
                        Live demo · Base Sepolia
                    </p>
                    <h1 className="text-[1.6rem] sm:text-[2rem] font-bold tracking-tight text-white leading-[1.1]">
                        Verified Member Badge
                    </h1>
                    <p className="text-[0.82rem] text-muted mt-2 leading-relaxed">
                        Prove your exchange history once — mint a soulbound badge forever.
                        No transfers. No fakes.
                    </p>
                </div>

                {/* Gate card */}
                <div className="relative rounded-2xl border border-border overflow-hidden">

                    {/* Badge content — always rendered, blurred when locked */}
                    <div
                        style={{
                            filter:        claimed ? "none" : "blur(6px)",
                            transition:    "filter 0.7s ease",
                            userSelect:    claimed ? "auto" : "none",
                            pointerEvents: claimed ? "auto" : "none",
                        }}
                        aria-hidden={!claimed}
                    >
                        <div className="p-6 space-y-5">
                            <BadgePreview tokenId={claimed ? mintedId : undefined} />

                            {claimed && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-green/15 border border-green/30
                                                          flex items-center justify-center text-green text-[0.7rem] flex-shrink-0">✓</span>
                                        <p className="text-[0.88rem] font-semibold text-green">Badge minted</p>
                                    </div>

                                    <p className="text-[0.78rem] text-muted leading-relaxed">
                                        Your soulbound badge is on-chain and tied to this wallet.
                                        It cannot be transferred or burned.
                                    </p>

                                    {/* Share */}
                                    <div className="space-y-2">
                                        <p className="text-[0.68rem] font-mono uppercase tracking-widest text-muted-2">
                                            Share your badge
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <a href={twitterUrl} target="_blank" rel="noopener noreferrer"
                                               className="flex items-center justify-center gap-2 rounded-xl border border-border
                                                          bg-bg hover:border-accent/40 hover:bg-accent/[0.03]
                                                          px-4 py-2.5 text-[0.82rem] font-medium text-muted
                                                          hover:text-text transition-colors">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                                </svg>
                                                Post on X
                                            </a>
                                            <a href={warpcastUrl} target="_blank" rel="noopener noreferrer"
                                               className="flex items-center justify-center gap-2 rounded-xl border border-border
                                                          bg-bg hover:border-accent/40 hover:bg-accent/[0.03]
                                                          px-4 py-2.5 text-[0.82rem] font-medium text-muted
                                                          hover:text-text transition-colors">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                                                </svg>
                                                Cast on Farcaster
                                            </a>
                                        </div>
                                    </div>

                                    {/* Tx + basescan link */}
                                    {txHash && (
                                        <div className="rounded-xl border border-border bg-bg px-4 py-3 flex items-center gap-3">
                                            <span className="text-[0.7rem] text-muted-2 shrink-0">Tx</span>
                                            <span className="font-mono text-[0.67rem] text-muted truncate">
                                                {txHash}
                                            </span>
                                            <a href={`https://sepolia.basescan.org/tx/${txHash}`}
                                               target="_blank" rel="noopener noreferrer"
                                               className="shrink-0 text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                                                ↗
                                            </a>
                                        </div>
                                    )}

                                    {totalMinted !== undefined && (
                                        <p className="font-mono text-[0.65rem] text-muted-2">
                                            {Number(totalMinted)} badge{Number(totalMinted) !== 1 ? "s" : ""} minted total
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Lock overlay */}
                    {!claimed && (
                        <div className="absolute inset-0 flex items-center justify-center
                                        bg-bg/80 backdrop-blur-[3px] px-6">
                            <div className="flex flex-col items-center text-center max-w-[300px] w-full space-y-4">

                                <div className="w-11 h-11 rounded-2xl border border-border bg-surface
                                                flex items-center justify-center text-xl">
                                    🏅
                                </div>

                                <div>
                                    <h3 className="text-[1rem] font-semibold text-white mb-1">
                                        Verified Member Badge
                                    </h3>
                                    <p className="text-[0.75rem] text-muted">
                                        Prove a crypto exchange account to mint your soulbound badge
                                    </p>
                                </div>

                                <span className="inline-block font-mono text-[0.62rem] bg-surface
                                                 border border-border px-2.5 py-1 rounded-full text-muted-2">
                                    Any exchange · Account from 2025 or earlier
                                </span>

                                {!badgeDeployed ? (
                                    <p className="text-[0.75rem] text-amber font-mono">Contract deploying — check back soon</p>
                                ) : checking ? (
                                    <div className="flex items-center gap-2 text-[0.78rem] text-muted">
                                        <div className="w-3.5 h-3.5 border border-accent/30 border-t-accent
                                                        rounded-full animate-spin flex-shrink-0" />
                                        Checking…
                                    </div>
                                ) : !isConnected ? (
                                    <div className="w-full space-y-2.5">
                                        <ConnectKitButton.Custom>
                                            {({ show }) => (
                                                <button onClick={show}
                                                    className="w-full bg-accent text-[0.82rem] font-semibold
                                                               px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                                                    style={{ color: "#fff" }}>
                                                    Connect wallet
                                                </button>
                                            )}
                                        </ConnectKitButton.Custom>
                                        <p className="text-[0.67rem] text-muted-2">Then prove your exchange email to mint</p>
                                    </div>
                                ) : eligible ? (
                                    <div className="w-full space-y-2.5">
                                        <button onClick={handleMint} disabled={phase === "minting"}
                                            className="w-full bg-accent text-[0.82rem] font-semibold
                                                       px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity
                                                       disabled:opacity-60 flex items-center justify-center gap-2"
                                            style={{ color: "#fff" }}>
                                            {phase === "minting" ? (
                                                <>
                                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white
                                                                    rounded-full animate-spin" />
                                                    Minting…
                                                </>
                                            ) : "Mint badge →"}
                                        </button>
                                        {phase === "error" && (
                                            <p className="text-[0.7rem] text-red leading-snug">{errorMsg}</p>
                                        )}
                                        <p className="text-[0.67rem] text-green/70">✓ Eligible — attestation verified</p>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-2.5">
                                        {verifyUrl && (
                                            <Link href={verifyUrl}
                                                  className="block w-full bg-accent text-[0.82rem] font-semibold
                                                             px-5 py-2.5 rounded-xl hover:opacity-90
                                                             transition-opacity text-center"
                                                  style={{ color: "#fff" }}>
                                                Prove eligibility →
                                            </Link>
                                        )}
                                        <p className="text-[0.67rem] text-muted-2 leading-snug">
                                            Drop an exchange email · ZK proof in ~30 s · nothing leaves your device
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* "Prove once" callout — only visible when eligible but not yet minted */}
                {isConnected && eligible && !claimed && (
                    <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
                        <p className="text-[0.78rem] text-accent/80 leading-relaxed">
                            <span className="font-semibold text-accent">Prove once, use everywhere.</span>
                            {" "}Your attestation from the presale demo works here too — no re-proving needed.
                        </p>
                    </div>
                )}

            </main>
        </div>
    );
}
