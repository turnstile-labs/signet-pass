"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWalletClient, useSwitchChain, useDisconnect } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { waitForCallsStatus } from "viem/experimental";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import { SiteNav } from "@/components/SiteNav";
import { SIGNET_PASS_ABI, isValidAddress, getPublicClient } from "@/lib/wagmi";

// ── Contracts ─────────────────────────────────────────────────────────────────

const PASS_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_CONTRACT ?? "0x653454ee8e92c479a97566864da2f0dc8b9a4b62"
) as `0x${string}`;

const BADGE_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_BADGE_CONTRACT ?? "0x96643e54695ca91682e4fe4f3a96f025108a442c"
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


// ── Main component ─────────────────────────────────────────────────────────────

export function BadgeGateClient() {
    const { address, isConnected }  = useAccount();
    const { disconnect }             = useDisconnect();

    // Disconnect on every page visit so users experience the full connect flow each time
    useEffect(() => { disconnect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

    // ── Share links — use token-specific URL so X/Farcaster unfurl the OG image ─
    // /demo/badge/<tokenId> has OG metadata + redirects to /demo/badge; gives crawlers the og:image
    const shareUrl = mintedId ? `${origin}/demo/badge/${mintedId}` : `${origin}/demo/badge`;

    // X: punchy, broad audience — lead with the surprising mechanic
    const xText = [
        `Just proved my crypto history with a ZK email proof and minted a soulbound badge on-chain.`,
        ``,
        `No KYC. No data upload. ~30 seconds in the browser.`,
        ``,
        `This is how @signetpass gates access — without identity.`,
        ``,
        shareUrl,
    ].join("\n");

    // Farcaster: crypto-native, technical detail lands well
    const castText = [
        `Just minted Signet Verified Member Badge #${mintedId ?? ""}`,
        ``,
        `Proved exchange account history → ZK proof in browser → soulbound NFT on Base.`,
        `Nothing left my device. No KYC. The proof is on-chain forever.`,
        ``,
        `Build the same gate for your drop or presale 👇`,
        ``,
        shareUrl,
    ].join("\n");

    const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`;
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}`;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-10 space-y-6">

                {/* Heading */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-2">
                        Live demo · Base Sepolia
                    </p>
                    <h1 className="text-[1.6rem] sm:text-[2rem] font-bold tracking-tight text-white leading-[1.1]">
                        Verified Member Badge
                    </h1>
                    <p className="text-[0.82rem] text-muted mt-2 leading-relaxed">
                        Prove your exchange history once — mint a soulbound badge on-chain forever.
                        One per wallet. No transfers. No fakes.
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
                        <div className="p-5 space-y-4">

                            {/* Badge info card */}
                            <div className="rounded-xl border border-border bg-bg p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center
                                                    justify-center text-xl flex-shrink-0">
                                        🏅
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[0.78rem] font-mono text-muted-2 mb-0.5">
                                            Soulbound NFT · Base Sepolia
                                        </p>
                                        <p className="text-[1rem] font-semibold text-white leading-tight">
                                            Verified Member Badge
                                        </p>
                                        <p className="text-[0.72rem] text-muted truncate">
                                            One per wallet · Non-transferable · Forever on-chain
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-border">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green" />
                                        <span className="text-[0.68rem] text-muted">
                                            {totalMinted !== undefined
                                                ? `${Number(totalMinted)} minted · Verified members only`
                                                : "Verified members only"}
                                        </span>
                                    </div>
                                    {claimed && mintedId && (
                                        <span className="font-mono text-[0.68rem] text-accent">
                                            #{mintedId}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {claimed && (
                                <>
                                    <div className="rounded-xl border border-green/20 bg-green/5 px-4 py-3">
                                        <p className="text-[0.75rem] text-green/80 leading-relaxed">
                                            <span className="font-semibold text-green">Badge minted.</span>
                                            {" "}Your proof is valid on every Signet-gated project — no re-proving needed.
                                        </p>
                                    </div>

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
                                    Any exchange
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
                                        <button
                                            onClick={() => disconnect()}
                                            className="w-full text-[0.67rem] text-muted-2 hover:text-muted transition-colors pt-0.5"
                                        >
                                            {address?.slice(0, 6)}…{address?.slice(-4)} · Disconnect
                                        </button>
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
                                        <button
                                            onClick={() => disconnect()}
                                            className="w-full text-[0.67rem] text-muted-2 hover:text-muted transition-colors pt-0.5"
                                        >
                                            {address?.slice(0, 6)}…{address?.slice(-4)} · Disconnect
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* How this works */}
                <div className="rounded-xl border border-border bg-surface px-5 py-4 space-y-3">
                    <p className="text-[0.72rem] font-mono uppercase tracking-widest text-muted-2">
                        How this works
                    </p>
                    <div className="space-y-2">
                        {[
                            { step: "1", text: "Creator deploys a Signet gate linked to any ERC-721 contract — the NFT contract checks isVerified() before minting." },
                            { step: "2", text: "User proves a crypto exchange account with a ZK email proof. ~30 seconds in the browser, nothing leaves your device." },
                            { step: "3", text: "isVerified() returns true on-chain. Badge mints directly to wallet — soulbound, non-transferable, one per address." },
                        ].map(({ step, text }) => (
                            <div key={step} className="flex items-start gap-3">
                                <span className="font-mono text-[0.65rem] text-muted-2 bg-bg border border-border
                                                 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {step}
                                </span>
                                <p className="text-[0.78rem] text-muted leading-relaxed">{text}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-[0.67rem] text-muted-2 pt-1 border-t border-border">
                        The badge contract is deployed on Base Sepolia — the mint and ZK proof are fully real.
                    </p>
                </div>

            </main>
        </div>
    );
}
