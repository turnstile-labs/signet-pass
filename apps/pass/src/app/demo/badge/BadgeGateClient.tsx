"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWalletClient, useSwitchChain } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { waitForCallsStatus } from "viem/experimental";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import { SiteNav } from "@/components/SiteNav";
import { SIGNET_PASS_ABI, isValidAddress } from "@/lib/wagmi";

// ── Contract addresses ────────────────────────────────────────────────────────

// The existing demo SignetPass — verified users here are eligible for the badge.
// This demonstrates "prove once, valid everywhere".
const PASS_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_CONTRACT ?? "0x2566081B73fE2e2340B95B36ccd2256584b64C8F"
) as `0x${string}`;

const BADGE_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_BADGE_CONTRACT ?? ""
) as `0x${string}`;

const DEMO_PASS_NAME = "SGNL Token Presale — Round 1";

// ── Badge contract ABI (minimal) ──────────────────────────────────────────────

const BADGE_ABI = [
    {
        inputs:          [],
        name:            "mint",
        outputs:         [],
        stateMutability: "nonpayable",
        type:            "function",
    },
    {
        inputs:  [{ name: "wallet", type: "address" }],
        name:    "hasMinted",
        outputs: [{ type: "bool" }],
        stateMutability: "view",
        type:            "function",
    },
    {
        inputs:  [],
        name:    "totalMinted",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type:            "function",
    },
    {
        inputs:  [{ name: "wallet", type: "address" }],
        name:    "tokenOf",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type:            "function",
    },
] as const;

// ── Paymaster helpers (reuse pattern from create page) ────────────────────────

const _alchemyKey   = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const PAYMASTER_URL = _alchemyKey
    ? `https://base-sepolia.g.alchemy.com/v2/${_alchemyKey}`
    : "";

// ── Badge SVG preview (mirrors the on-chain design) ───────────────────────────

function BadgePreview({ tokenId, muted = false }: { tokenId?: number; muted?: boolean }) {
    return (
        <div className={`relative flex flex-col items-center justify-center p-8
                         rounded-2xl border ${muted ? "border-border/40" : "border-accent/30"}
                         bg-gradient-to-br from-[#0d0d1a] to-[#1a1030]
                         transition-all duration-500`}
             style={{ minHeight: 240 }}
        >
            {/* Outer glow */}
            <div className={`absolute inset-0 rounded-2xl transition-opacity duration-500
                             ${muted ? "opacity-0" : "opacity-100"}`}
                 style={{ boxShadow: "inset 0 0 60px #6366f115" }}
            />

            {/* Ring */}
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4
                              transition-all duration-500 relative
                              ${muted
                                  ? "border-2 border-border/30 bg-surface/30"
                                  : "border-2 border-accent/60 bg-accent/10"}`}
            >
                <div className={`absolute inset-0 rounded-full transition-opacity duration-500
                                  ${muted ? "opacity-0" : "opacity-100"}`}
                     style={{ boxShadow: "0 0 30px #6366f130" }}
                />
                <span className={`text-4xl transition-all duration-500
                                   ${muted ? "opacity-20" : "opacity-100"}`}>
                    ✓
                </span>
            </div>

            <p className={`font-mono text-[0.7rem] font-bold tracking-[0.2em] uppercase mb-1
                           transition-colors duration-300
                           ${muted ? "text-muted-2/40" : "text-[#a5b4fc]"}`}>
                Signet
            </p>
            <p className={`font-mono text-[0.6rem] tracking-[0.15em] uppercase mb-3
                           transition-colors duration-300
                           ${muted ? "text-muted-2/30" : "text-[#7c3aed]"}`}>
                Verified Member
            </p>

            {tokenId && (
                <p className="font-mono text-[0.58rem] text-[#4b4080] mt-2">
                    # {tokenId}
                </p>
            )}

            {!muted && (
                <div className="absolute bottom-3 right-3">
                    <span className="font-mono text-[0.55rem] text-muted-2/50">Base Sepolia · SBT</span>
                </div>
            )}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BadgeGateClient() {
    const { address, isConnected }    = useAccount();
    const { data: walletClient }      = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }        = useSwitchChain();
    const { data: capabilities }      = useCapabilities();
    const { writeContractsAsync }     = useWriteContracts();

    type Phase = "idle" | "minting" | "minted" | "error";
    const [phase,    setPhase]    = useState<Phase>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [verifyUrl, setVerifyUrl] = useState("");

    useEffect(() => {
        const base = process.env.NEXT_PUBLIC_PASS_URL || window.location.origin;
        const p    = new URLSearchParams({
            contract: PASS_CONTRACT,
            name:     DEMO_PASS_NAME,
            redirect: "/demo/badge",
        });
        setVerifyUrl(`${base}/verify?${p.toString()}`);
    }, []);

    // ── Contract reads ────────────────────────────────────────────────────────

    const badgeDeployed = isValidAddress(BADGE_CONTRACT);

    const { data: isVerified, isLoading: checkingVerified } = useReadContract({
        address:      PASS_CONTRACT,
        abi:          SIGNET_PASS_ABI,
        functionName: "isVerified",
        args:         [address!],
        query: {
            enabled:              isConnected && !!address,
            refetchOnWindowFocus: true,
            staleTime:            0,
        },
    });

    const { data: alreadyMinted, isLoading: checkingMinted, refetch: refetchMinted } = useReadContract({
        address:      BADGE_CONTRACT,
        abi:          BADGE_ABI,
        functionName: "hasMinted",
        args:         [address!],
        query: {
            enabled: isConnected && !!address && badgeDeployed,
            refetchOnWindowFocus: true,
            staleTime: 0,
        },
    });

    const { data: tokenId } = useReadContract({
        address:      BADGE_CONTRACT,
        abi:          BADGE_ABI,
        functionName: "tokenOf",
        args:         [address!],
        query: {
            enabled: isConnected && !!address && badgeDeployed && !!alreadyMinted,
        },
    });

    const { data: totalMinted } = useReadContract({
        address:      BADGE_CONTRACT,
        abi:          BADGE_ABI,
        functionName: "totalMinted",
        query: { enabled: badgeDeployed, refetchInterval: 15_000 },
    });

    // ── Mint ──────────────────────────────────────────────────────────────────

    const handleMint = useCallback(async () => {
        if (!walletClient || !address) return;
        setPhase("minting");
        setErrorMsg("");
        try {
            if (walletClient.chain?.id !== baseSepolia.id) {
                await switchChainAsync({ chainId: baseSepolia.id });
            }

            const calls = [{ address: BADGE_CONTRACT, abi: BADGE_ABI, functionName: "mint" as const, args: [] as const }];

            // Use EIP-5792 (gasless via Coinbase Smart Wallet) if available
            const caps = capabilities?.[baseSepolia.id];
            const canSponsor = caps?.paymasterService?.supported === true;

            if (canSponsor && PAYMASTER_URL) {
                const result = await writeContractsAsync({
                    contracts:       calls,
                    capabilities:    { paymasterService: { url: PAYMASTER_URL } },
                });
                await waitForCallsStatus({ id: result, client: walletClient as never });
            } else if (canSponsor) {
                const result = await writeContractsAsync({ contracts: calls });
                await waitForCallsStatus({ id: result, client: walletClient as never });
            } else {
                await walletClient.writeContract({
                    address:      BADGE_CONTRACT,
                    abi:          BADGE_ABI,
                    functionName: "mint",
                    args:         [],
                });
            }

            await refetchMinted();
            setPhase("minted");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            const clean = msg.includes("NotVerified")    ? "Your wallet doesn't have a valid Signet attestation yet."
                        : msg.includes("AlreadyMinted")  ? "This wallet already claimed a badge."
                        : msg.includes("User rejected")  ? "Transaction cancelled."
                        : "Transaction failed. Please try again.";
            setErrorMsg(clean);
            setPhase("error");
        }
    }, [walletClient, address, capabilities, writeContractsAsync, switchChainAsync, refetchMinted]);

    // ── Derived state ─────────────────────────────────────────────────────────

    const checking = checkingVerified || checkingMinted;
    const eligible = isVerified === true;
    const claimed  = alreadyMinted === true || phase === "minted";
    const mintedId = tokenId ? Number(tokenId) : undefined;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-6">

                {/* Back */}
                <Link href="/demo"
                    className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted
                               hover:text-text transition-colors">
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
                        Prove your exchange history once, mint a soulbound badge forever.
                        No transfers. No fakes.
                    </p>
                </div>

                {/* Gate card */}
                <div className="relative rounded-2xl border border-border overflow-hidden">

                    {/* Blurred badge — always rendered */}
                    <div
                        style={{
                            filter:        claimed ? "none" : "blur(6px)",
                            transition:    "filter 0.7s ease",
                            userSelect:    claimed ? "auto" : "none",
                            pointerEvents: claimed ? "auto" : "none",
                        }}
                        aria-hidden={!claimed}
                    >
                        <div className="p-6">
                            <BadgePreview tokenId={claimed ? mintedId : undefined} muted={false} />

                            {claimed && (
                                <div className="mt-5 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-green/15 border border-green/30
                                                          flex items-center justify-center text-green text-[0.7rem]
                                                          flex-shrink-0">✓</span>
                                        <p className="text-[0.88rem] font-semibold text-green">Badge minted</p>
                                    </div>
                                    <p className="text-[0.78rem] text-muted leading-relaxed">
                                        Your soulbound badge is now on-chain and tied to your wallet.
                                        It cannot be transferred or burned.
                                    </p>
                                    {BADGE_CONTRACT && mintedId && (
                                        <a
                                            href={`https://sepolia.basescan.org/token/${BADGE_CONTRACT}?a=${address}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[0.78rem] text-accent hover:text-accent/80 transition-colors"
                                        >
                                            View on Basescan ↗
                                        </a>
                                    )}
                                    {totalMinted !== undefined && (
                                        <p className="font-mono text-[0.65rem] text-muted-2">
                                            {Number(totalMinted)} badge{Number(totalMinted) !== 1 ? "s" : ""} minted total
                                        </p>
                                    )}
                                </div>
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

                                {/* CTA states */}
                                {!badgeDeployed ? (
                                    <p className="text-[0.75rem] text-amber font-mono">
                                        Contract deploying — check back soon
                                    </p>
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
                                                <button
                                                    onClick={show}
                                                    className="w-full bg-accent text-[0.82rem] font-semibold
                                                               px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                                                    style={{ color: "#fff" }}
                                                >
                                                    Connect wallet
                                                </button>
                                            )}
                                        </ConnectKitButton.Custom>
                                        <p className="text-[0.67rem] text-muted-2">
                                            Then prove your exchange email to mint
                                        </p>
                                    </div>
                                ) : eligible ? (
                                    <div className="w-full space-y-2.5">
                                        <button
                                            onClick={handleMint}
                                            disabled={phase === "minting"}
                                            className="w-full bg-accent text-[0.82rem] font-semibold
                                                       px-5 py-2.5 rounded-xl hover:opacity-90
                                                       transition-opacity disabled:opacity-60
                                                       flex items-center justify-center gap-2"
                                            style={{ color: "#fff" }}
                                        >
                                            {phase === "minting" ? (
                                                <>
                                                    <div className="w-3.5 h-3.5 border-2 border-white/30
                                                                    border-t-white rounded-full animate-spin" />
                                                    Minting…
                                                </>
                                            ) : "Mint badge →"}
                                        </button>
                                        {phase === "error" && (
                                            <p className="text-[0.7rem] text-red leading-snug">{errorMsg}</p>
                                        )}
                                        <p className="text-[0.67rem] text-green/70">
                                            ✓ Eligible — your attestation is verified
                                        </p>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-2.5">
                                        {verifyUrl && (
                                            <Link
                                                href={verifyUrl}
                                                className="block w-full bg-accent text-[0.82rem] font-semibold
                                                           px-5 py-2.5 rounded-xl hover:opacity-90
                                                           transition-opacity text-center"
                                                style={{ color: "#fff" }}
                                            >
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

                {/* "Prove once" callout */}
                {isConnected && eligible && !claimed && (
                    <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
                        <p className="text-[0.78rem] text-accent/80 leading-relaxed">
                            <span className="font-semibold text-accent">Prove once, use everywhere.</span>
                            {" "}Your Signet attestation from the presale demo works here too.
                        </p>
                    </div>
                )}

                {/* Stats footer */}
                {badgeDeployed && totalMinted !== undefined && (
                    <p className="font-mono text-[0.65rem] text-muted-2 text-center">
                        {Number(totalMinted)} badge{Number(totalMinted) !== 1 ? "s" : ""} minted · Base Sepolia
                    </p>
                )}

            </main>
        </div>
    );
}
