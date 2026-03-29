"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import {
    getPublicClient,
    FACTORY_ADDRESS,
    SIGNET_PASS_FACTORY_ABI,
    SUPPORTED_EXCHANGES,
} from "@/lib/wagmi";

// Exchanges without "any" (the checkboxes)
const EXCHANGE_OPTIONS = SUPPORTED_EXCHANGES.filter(e => e.id !== "any");

const PASS_URL = process.env.NEXT_PUBLIC_PASS_URL ?? "https://pass.signet.xyz";

// ── Helpers ───────────────────────────────────────────────────────────────────

function oneYearAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
}

function dateToUnix(s: string): bigint {
    return BigInt(Math.floor(new Date(s + "T00:00:00Z").getTime() / 1000));
}

function buildVerifyUrl(contract: string, name: string): string {
    const p = new URLSearchParams({ contract });
    if (name.trim()) p.set("name", name.trim());
    return `${PASS_URL}/verify?${p.toString()}`;
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className={`font-mono text-[0.68rem] hover:text-accent transition-colors cursor-pointer ${className}`}
        >
            {copied ? "copied" : "copy"}
        </button>
    );
}

// ── No-factory fallback ───────────────────────────────────────────────────────

function NoFactoryState() {
    const CLI_SNIPPET = `SIGNET_ADDRESS=0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1 \\
SIGNET_TREASURY=<your-treasury-address> \\
CUTOFF_UNIX=$(date -d "1 year ago" +%s) \\
forge script contracts/script/DeployPass.s.sol \\
  --rpc-url base_sepolia --account <keystore> --broadcast -vvvv`;

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-amber/25 bg-amber/5 px-4 py-3.5">
                <p className="text-[0.82rem] font-semibold text-amber mb-1">Factory not configured</p>
                <p className="text-[0.76rem] text-muted leading-relaxed">
                    Set{" "}
                    <code className="font-mono text-text">NEXT_PUBLIC_FACTORY_ADDRESS</code>{" "}
                    to use one-click deployment. The shared Signet factory on Base Sepolia is{" "}
                    <code className="font-mono text-[0.7rem] text-text">0xa64CAcfDe13aE7cDC31673C16e5F36a01215fc0E</code>.
                </p>
            </div>
            <div>
                <p className="text-[0.76rem] text-muted-2 mb-2">Or deploy via Foundry CLI:</p>
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                        <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">bash</span>
                        <CopyButton text={CLI_SNIPPET} />
                    </div>
                    <pre className="px-4 py-3 font-mono text-[0.7rem] text-muted leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                        {CLI_SNIPPET}
                    </pre>
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreateFlow() {
    const { address, isConnected } = useAccount();
    const { data: walletClient }   = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }     = useSwitchChain();

    // ── Form state ────────────────────────────────────────────────────────────
    const [name,        setName]        = useState("");
    const [cutoffDate,  setCutoffDate]  = useState(oneYearAgo);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [advanced,    setAdvanced]    = useState(false);

    // ── Deploy state ──────────────────────────────────────────────────────────
    type Phase = "idle" | "deploying" | "deployed" | "error";
    const [phase,        setPhase] = useState<Phase>("idle");
    const [errorMsg,     setError] = useState("");
    const [deployedAddr, setAddr]  = useState("");
    const [deployedTx,   setTx]    = useState("");

    const cutoffUnix    = cutoffDate ? dateToUnix(cutoffDate) : 0n;
    const allowedHashes = EXCHANGE_OPTIONS
        .filter(e => selectedIds.includes(e.id))
        .flatMap(e => [...e.hashes]);
    const verifyUrl = deployedAddr ? buildVerifyUrl(deployedAddr, name) : "";

    const toggleExchange = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // ── Deploy ────────────────────────────────────────────────────────────────
    const handleDeploy = useCallback(async () => {
        if (!walletClient || !address) return;
        setPhase("deploying");
        setError("");
        try {
            await switchChainAsync({ chainId: baseSepolia.id });
            const { result: newAddr } = await getPublicClient().simulateContract({
                address:      FACTORY_ADDRESS,
                abi:          SIGNET_PASS_FACTORY_ABI,
                functionName: "deploy",
                args:         [cutoffUnix, allowedHashes, address],
                account:      address,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const txHash = await (walletClient.writeContract as any)({
                address:      FACTORY_ADDRESS,
                abi:          SIGNET_PASS_FACTORY_ABI,
                functionName: "deploy",
                args:         [cutoffUnix, allowedHashes, address],
                account:      address,
            }) as `0x${string}`;
            await getPublicClient().waitForTransactionReceipt({ hash: txHash });
            setAddr(newAddr as string);
            setTx(txHash);
            setPhase("deployed");
        } catch (e) {
            setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
            setPhase("error");
        }
    }, [walletClient, address, cutoffUnix, allowedHashes, switchChainAsync]);

    // ── Success state ─────────────────────────────────────────────────────────
    if (phase === "deployed") {
        return (
            <div className="space-y-5">
                <div>
                    <p className="text-[0.95rem] font-semibold text-green mb-1">✓ Pass is live</p>
                    <p className="text-[0.78rem] text-muted">Share this link with your community.</p>
                </div>
                <div className="rounded-xl border border-green/25 bg-green/5 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-green/15">
                        <span className="text-[0.65rem] font-mono uppercase tracking-widest text-green/70">
                            Your pass link
                        </span>
                        <CopyButton text={verifyUrl} className="text-green/70" />
                    </div>
                    <p className="px-4 py-3 font-mono text-[0.72rem] text-text break-all">{verifyUrl}</p>
                </div>
                <div className="rounded-xl border border-border overflow-hidden text-[0.78rem]">
                    <div className="flex justify-between items-center px-4 py-2.5 border-b border-border">
                        <span className="text-muted-2">Contract</span>
                        <div className="flex items-center gap-2">
                            <code className="font-mono text-[0.72rem] text-muted hidden sm:block">
                                {deployedAddr.slice(0, 10)}…{deployedAddr.slice(-8)}
                            </code>
                            <CopyButton text={deployedAddr} className="text-muted-2" />
                            <a href={`https://sepolia.basescan.org/address/${deployedAddr}`}
                               target="_blank" rel="noopener noreferrer"
                               className="font-mono text-muted-2 hover:text-accent transition-colors">
                                ↗
                            </a>
                        </div>
                    </div>
                    <div className="flex justify-between px-4 py-2.5">
                        <span className="text-muted-2">Transaction</span>
                        <a href={`https://sepolia.basescan.org/tx/${deployedTx}`}
                           target="_blank" rel="noopener noreferrer"
                           className="font-mono text-muted hover:text-accent transition-colors">
                            {deployedTx.slice(0, 10)}…{deployedTx.slice(-8)} ↗
                        </a>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3.5 space-y-1.5">
                    <p className="text-[0.76rem] font-semibold text-text">Next: gate your contract</p>
                    <p className="text-[0.72rem] text-muted leading-relaxed">
                        Copy your contract address above, then paste it into the code snippet.
                        One view call —{" "}
                        <code className="font-mono text-text">isVerified(address)</code>{" "}
                        returns <code className="font-mono text-text">true</code> or <code className="font-mono text-text">false</code>.{" "}
                        <a href="/developers" className="text-accent hover:underline">
                            Get the snippet →
                        </a>
                    </p>
                </div>
                <button
                    onClick={() => { setPhase("idle"); setAddr(""); setTx(""); setName(""); setSelectedIds([]); setCutoffDate(oneYearAgo()); }}
                    className="text-[0.76rem] text-muted-2 hover:text-muted transition-colors"
                >
                    Deploy another
                </button>
            </div>
        );
    }

    // ── No factory configured ─────────────────────────────────────────────────
    if (!FACTORY_ADDRESS) {
        return <NoFactoryState />;
    }

    // ── Form ──────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-5">

            {/* Project name — always visible, fills in the share link */}
            <div className="space-y-1.5">
                <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                    Project name
                    <span className="ml-1.5 normal-case tracking-normal text-muted-2">(optional)</span>
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="My Project"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2
                               text-[0.88rem] text-text placeholder:text-muted-2
                               outline-none focus:border-accent/50 transition-colors font-mono"
                />
                {name.trim() && (
                    <p className="text-[0.68rem] text-muted-2">
                        Your share link will say{" "}
                        <span className="text-muted italic">&ldquo;Join {name.trim()}&rdquo;</span>
                    </p>
                )}
            </div>

            {/* Wallet row */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[0.88rem] font-semibold text-text">Deploy pass</p>
                    {address && (
                        <p className="font-mono text-[0.68rem] text-muted-2 mt-0.5">
                            {address.slice(0, 6)}…{address.slice(-4)}
                        </p>
                    )}
                </div>
                <ConnectKitButton />
            </div>

            {!isConnected && (
                <p className="text-[0.78rem] text-muted">Connect your wallet to deploy.</p>
            )}

            {isConnected && address && (
                <>
                    {/* Advanced settings toggle — cutoff + exchange filter */}
                    <button
                        onClick={() => setAdvanced(v => !v)}
                        className="flex items-center gap-1.5 text-[0.76rem] text-muted
                                   hover:text-text transition-colors cursor-pointer"
                    >
                        <span className={`transition-transform duration-150 ${advanced ? "rotate-90" : ""}`}>▸</span>
                        Advanced settings
                        {!advanced && (
                            <span className="font-mono text-[0.65rem] text-muted-2 ml-1">
                                (cutoff: {cutoffDate} · {
                                    selectedIds.length === 0
                                        ? "any exchange"
                                        : selectedIds.length === 1
                                            ? EXCHANGE_OPTIONS.find(e => e.id === selectedIds[0])?.label
                                            : `${selectedIds.length} exchanges`
                                })
                            </span>
                        )}
                    </button>

                    {advanced && (
                        <div className="space-y-5 rounded-xl border border-border bg-bg px-4 py-4">

                            {/* Cutoff date */}
                            <div className="space-y-1.5">
                                <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                    Account cutoff
                                </label>
                                <input
                                    type="date"
                                    value={cutoffDate}
                                    onChange={e => setCutoffDate(e.target.value)}
                                    className="w-full bg-surface border border-border rounded-lg px-3 py-2
                                               text-[0.82rem] text-text outline-none focus:border-accent/50
                                               transition-colors font-mono [color-scheme:dark]"
                                />
                                <p className="text-[0.68rem] text-muted-2">
                                    Only accounts with an email older than this date qualify.
                                </p>
                            </div>

                            {/* Exchange filter — multi-select */}
                            <div className="space-y-2">
                                <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                    Exchange filter
                                    <span className="ml-2 normal-case tracking-normal text-muted-2">
                                        — select one or more, or leave empty for any
                                    </span>
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                                    {EXCHANGE_OPTIONS.map(ex => {
                                        const on = selectedIds.includes(ex.id);
                                        return (
                                            <button
                                                key={ex.id}
                                                onClick={() => toggleExchange(ex.id)}
                                                className={`rounded-lg border px-2 py-2 text-left transition-colors cursor-pointer
                                                    ${on
                                                        ? "border-accent/50 bg-accent/10 text-accent"
                                                        : "border-border bg-surface hover:border-border-h text-muted"
                                                    }`}
                                            >
                                                <p className="text-[0.72rem] font-medium leading-tight">{ex.label}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[0.68rem] text-muted-2">
                                    {selectedIds.length === 0
                                        ? "No filter — any supported exchange qualifies."
                                        : `Only ${EXCHANGE_OPTIONS.filter(e => selectedIds.includes(e.id)).map(e => e.label).join(", ")} accounts qualify.`
                                    }
                                </p>
                            </div>
                        </div>
                    )}

                    {phase === "error" && (
                        <div className="rounded-lg border border-red/25 bg-red/5 px-4 py-3">
                            <p className="font-mono text-[0.72rem] text-red">{errorMsg}</p>
                        </div>
                    )}

                    <button
                        onClick={handleDeploy}
                        disabled={phase === "deploying"}
                        className="w-full rounded-xl bg-accent font-semibold
                                   text-[0.9rem] py-3 hover:opacity-90 transition-opacity
                                   disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        style={{ color: "#fff" }}
                    >
                        {phase === "deploying" ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Deploying…
                            </span>
                        ) : "Deploy pass →"}
                    </button>
                </>
            )}
        </div>
    );
}
