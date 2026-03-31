"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useAccount, useWalletClient, useSwitchChain, useDisconnect } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { waitForCallsStatus } from "viem/experimental";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import { SiteNav } from "@/components/SiteNav";
import { CodeBlock } from "@/components/CodeBlock";
import {
    getPublicClient,
    FACTORY_ADDRESS,
    SIGNET_PASS_FACTORY_ABI,
    SUPPORTED_EXCHANGES,
    exchangeIdsToHashes,
} from "@/lib/wagmi";

const EXCHANGE_OPTIONS = SUPPORTED_EXCHANGES.filter(e => e.id !== "any");

// ── localStorage — save on deploy so /create My passes picks it up ────────────

interface SavedPass { contract: string; name: string; owner: string; createdAt: number; }
const STORAGE_KEY = "signet_passes_v1";

function loadSaved(): SavedPass[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function persistPasses(passes: SavedPass[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(passes)); } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function oneYearAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
}

function dateToUnix(s: string): bigint {
    return BigInt(Math.floor(new Date(s + "T00:00:00Z").getTime() / 1000));
}

const _alchemyKey   = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const PAYMASTER_URL = _alchemyKey ? `https://base-sepolia.g.alchemy.com/v2/${_alchemyKey}` : "";
const PASS_URL_ENV  = process.env.NEXT_PUBLIC_PASS_URL ?? "";

function buildVerifyUrl(contract: string, name: string): string {
    const base = PASS_URL_ENV || window.location.origin;
    const p = new URLSearchParams({ contract });
    if (name.trim()) p.set("name", name.trim());
    return `${base}/verify?${p.toString()}`;
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 font-mono text-[0.68rem] px-2 py-0.5 rounded
                       text-muted-2 hover:text-accent hover:bg-accent/8 transition-colors cursor-pointer"
        >
            {copied ? "✓ copied" : (label ?? "copy")}
        </button>
    );
}

// ── Code templates — address auto-fills after deploy ──────────────────────────

const PLACEHOLDER = "0xYOUR_PASS_ADDRESS";

function makeTypescript(addr: string) {
    return `import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const client = createPublicClient({ chain: baseSepolia, transport: http() });

const hasPass = await client.readContract({
    address:      "${addr}",
    abi:          [{ name: "isVerified", type: "function", stateMutability: "view",
                     inputs: [{ name: "wallet", type: "address" }],
                     outputs: [{ type: "bool" }] }],
    functionName: "isVerified",
    args:         ["0xCONNECTED_WALLET"],
});

if (hasPass) {
    // grant access, enable feature, unlock content...
}`;
}

function makeReact(addr: string) {
    return `import { SignetPass } from "@signet/react";
import { useAccount } from "wagmi";

const PASS = "${addr}";

export function App() {
    const { address } = useAccount();
    return (
        <SignetPass contract={PASS} wallet={address}>
            {/* Only rendered for verified members */}
            <YourGatedContent />
        </SignetPass>
    );
}`;
}

function makeHook(addr: string) {
    return `import { usePass } from "@signet/react";
import { useAccount } from "wagmi";

const PASS = "${addr}";

export function GatedSection() {
    const { address } = useAccount();
    const { verified, loading, recheck } = usePass({
        contract: PASS,
        wallet:   address,
    });

    if (loading)   return <Spinner />;
    if (!verified) return <ProvePrompt onVerified={recheck} />;
    return <YourGatedContent />;
}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DevelopersPage() {
    const { address, isConnected } = useAccount();
    const { data: walletClient }   = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }     = useSwitchChain();
    const { disconnect }           = useDisconnect();
    const { data: capabilities }   = useCapabilities();
    const { writeContractsAsync }  = useWriteContracts();

    const [name,        setName]        = useState("");
    const [cutoffDate,  setCutoffDate]  = useState(oneYearAgo);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [advanced,    setAdvanced]    = useState(false);

    const toggleExchange = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    type Phase = "idle" | "deploying" | "deployed" | "error";
    const [phase,        setPhase]        = useState<Phase>("idle");
    const [deployedAddr, setDeployedAddr] = useState("");
    const [deployedTx,   setDeployedTx]   = useState("");
    const [errorMsg,     setErrorMsg]     = useState("");

    const [tab,    setTab]    = useState<"typescript" | "react" | "hook">("react");
    const [pkgMgr, setPkgMgr] = useState<"npm" | "pnpm" | "yarn">("npm");

    const isDeployed = phase === "deployed";
    const [verifyUrl, setVerifyUrl] = useState("");

    useEffect(() => {
        if (deployedAddr) setVerifyUrl(buildVerifyUrl(deployedAddr, name));
        else setVerifyUrl("");
    }, [deployedAddr, name]);

    const addr      = deployedAddr || PLACEHOLDER;
    const allowedHashes = exchangeIdsToHashes(selectedIds);

    const TABS = [
        { id: "react"      as const, label: "React",      hint: "gate a component",  lang: "tsx"        as const, code: makeReact(addr),      filename: "SignetPass.tsx",   badge: "@signet/react", pkg: "@signet/react" },
        { id: "hook"       as const, label: "Hook",       hint: "custom UI / state", lang: "tsx"        as const, code: makeHook(addr),       filename: "GatedSection.tsx", badge: "@signet/react", pkg: "@signet/react" },
        { id: "typescript" as const, label: "TypeScript", hint: "backend / API",     lang: "typescript" as const, code: makeTypescript(addr), filename: "pass.ts",          badge: "viem",          pkg: "viem"          },
    ];
    const activeTab = TABS.find(t => t.id === tab)!;

    const handleDeploy = useCallback(async () => {
        if (!walletClient || !address) return;
        setPhase("deploying");
        setErrorMsg("");
        try {
            await switchChainAsync({ chainId: baseSepolia.id });
            const cutoffUnix = dateToUnix(cutoffDate);

            const { result: newAddr } = await getPublicClient().simulateContract({
                address:      FACTORY_ADDRESS,
                abi:          SIGNET_PASS_FACTORY_ABI,
                functionName: "deploy",
                args:         [cutoffUnix, allowedHashes, address],
                account:      address,
            });

            const contractCall = {
                address:      FACTORY_ADDRESS,
                abi:          SIGNET_PASS_FACTORY_ABI,
                functionName: "deploy" as const,
                args:         [cutoffUnix, allowedHashes, address] as const,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chainCaps    = (capabilities as any)?.[baseSepolia.id];
            const usePaymaster = !!(chainCaps?.paymasterService?.supported && PAYMASTER_URL);
            let txHash: `0x${string}`;

            if (usePaymaster) {
                const callsResult = await writeContractsAsync({
                    contracts:    [contractCall],
                    capabilities: { paymasterService: { url: PAYMASTER_URL } },
                });
                const callsId = typeof callsResult === "string" ? callsResult : callsResult.id;
                const result  = await waitForCallsStatus(walletClient, { id: callsId, timeout: 120_000, pollingInterval: 2_000, throwOnFailure: true });
                txHash = result?.receipts?.[0]?.transactionHash as `0x${string}`;
                if (!txHash) throw new Error("No receipt hash.");
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                txHash = await (walletClient.writeContract as any)({
                    ...contractCall,
                    account: address,
                }) as `0x${string}`;
                await getPublicClient().waitForTransactionReceipt({ hash: txHash });
            }

            setDeployedAddr(newAddr as string);
            setDeployedTx(txHash);
            setPhase("deployed");

            // Save so the /create "My passes" tab can list it.
            const saved   = loadSaved();
            const updated = saved.filter(p => p.contract.toLowerCase() !== (newAddr as string).toLowerCase());
            updated.push({ contract: newAddr as string, name, owner: address, createdAt: Date.now() });
            persistPasses(updated);
        } catch (e) {
            console.error(e);
            const short = e instanceof Error ? e.message.split("\n")[0] : String(e);
            setErrorMsg(short.length > 120 ? short.slice(0, 120) + "…" : short);
            setPhase("error");
        }
    }, [walletClient, address, cutoffDate, allowedHashes, switchChainAsync, capabilities, writeContractsAsync]);

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />

            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 space-y-8">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 mb-3">
                        Signet Pass · Integrate
                    </p>
                    <h1 className="text-[2rem] sm:text-[2.4rem] font-bold tracking-tight text-white leading-[1.1] mb-3">
                        Create. Copy. Ship.
                    </h1>
                    <p className="text-[0.88rem] text-muted leading-relaxed">
                        <span className="text-text font-medium">For developers and integrators</span>
                        {" "}— deploy a pass, copy the contract address, and drop one read call in your app.
                    </p>
                </div>

                {/* ── Step 1: Deploy ──────────────────────────────────────── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[0.85rem] font-semibold text-text">
                            {isDeployed ? "Step 1 — Pass created" : "Step 1 — Create your pass"}
                        </p>
                        {isDeployed
                            ? <span className="font-mono text-[0.65rem] text-green bg-green/8 border border-green/20 px-2 py-0.5 rounded-full">✓ Live</span>
                            : <span className="text-[0.72rem] text-muted">One transaction on Base</span>
                        }
                    </div>

                    <div className={`rounded-xl border bg-surface p-5 space-y-4 transition-colors ${
                        isDeployed ? "border-green/25" : "border-border"
                    }`}>

                        {isDeployed ? (
                            <div className="space-y-2.5">
                                {/* Contract address — the key output for developers */}
                                <div className="rounded-lg border border-border overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                                        <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">
                                            Contract address
                                        </span>
                                        <CopyBtn text={deployedAddr} label="copy" />
                                    </div>
                                    <p className="px-3 py-2 font-mono text-[0.7rem] text-accent break-all">
                                        {deployedAddr}
                                    </p>
                                </div>

                                {/* Share link */}
                                <div className="rounded-lg border border-border overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                                        <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-2">
                                            Verify link
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <CopyBtn text={verifyUrl} label="copy link" />
                                            <a href={verifyUrl} target="_blank" rel="noopener noreferrer"
                                               className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                                                ↗
                                            </a>
                                        </div>
                                    </div>
                                    <p className="px-3 py-2 font-mono text-[0.7rem] text-muted break-all">
                                        {verifyUrl}
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 pt-1 flex-wrap">
                                    <a href={`https://sepolia.basescan.org/tx/${deployedTx}`}
                                       target="_blank" rel="noopener noreferrer"
                                       className="font-mono text-[0.68rem] text-muted-2 hover:text-accent transition-colors">
                                        Transaction ↗
                                    </a>
                                    <button
                                        onClick={() => { setPhase("idle"); setDeployedAddr(""); setDeployedTx(""); setName(""); setCutoffDate(oneYearAgo()); setSelectedIds([]); }}
                                        className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors cursor-pointer"
                                    >
                                        Create another →
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Pass name */}
                                <div className="space-y-1.5">
                                    <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                        Pass name{" "}
                                        <span className="normal-case tracking-normal">(optional)</span>
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
                                </div>

                                {/* Connect wallet */}
                                {!isConnected && (
                                    <ConnectKitButton.Custom>
                                        {({ show }) => (
                                            <button onClick={show}
                                                className="w-full rounded-lg border border-border-h bg-surface-2
                                                           font-medium py-2.5 text-[0.88rem] text-text
                                                           hover:border-accent/50 hover:text-accent
                                                           transition-colors cursor-pointer">
                                                Connect wallet
                                            </button>
                                        )}
                                    </ConnectKitButton.Custom>
                                )}

                                {/* Advanced settings */}
                                {isConnected && (
                                    <div>
                                        <button
                                            onClick={() => setAdvanced(v => !v)}
                                            className="flex items-center gap-1.5 text-[0.72rem] text-muted
                                                       hover:text-text transition-colors cursor-pointer"
                                        >
                                            <span className={`transition-transform duration-150 ${advanced ? "rotate-90" : ""}`}>▸</span>
                                            Advanced settings
                                            {!advanced && (
                                                <span className="font-mono text-[0.65rem] text-muted-2 ml-1">
                                                    (cutoff: {cutoffDate} ·{" "}
                                                    {selectedIds.length === 0
                                                        ? "any exchange"
                                                        : selectedIds.length === 1
                                                            ? EXCHANGE_OPTIONS.find(e => e.id === selectedIds[0])?.label
                                                            : `${selectedIds.length} exchanges`
                                                    })
                                                </span>
                                            )}
                                        </button>
                                        {advanced && (
                                            <div className="mt-3 rounded-xl border border-border bg-bg px-4 py-4 space-y-4">
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
                                                <div className="space-y-2">
                                                    <label className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                                                        Exchange filter
                                                        <span className="ml-2 normal-case tracking-normal text-muted-2">
                                                            — leave empty to accept all
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
                                    </div>
                                )}

                                {isConnected && (
                                    <div className="space-y-2">
                                        {address && (
                                            <div className="flex items-center justify-between">
                                                <p className="font-mono text-[0.68rem] text-muted-2">
                                                    {address.slice(0, 8)}…{address.slice(-6)}
                                                </p>
                                                <button
                                                    onClick={() => disconnect()}
                                                    className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors cursor-pointer"
                                                >
                                                    Disconnect
                                                </button>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleDeploy}
                                            disabled={phase === "deploying" || !FACTORY_ADDRESS}
                                            className="w-full rounded-lg bg-accent font-semibold py-2.5 text-[0.88rem]
                                                       hover:opacity-90 transition-opacity disabled:opacity-50
                                                       disabled:cursor-not-allowed cursor-pointer"
                                            style={{ color: "#fff" }}
                                        >
                                            {phase === "deploying" ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                    Creating…
                                                </span>
                                            ) : "Create pass →"}
                                        </button>
                                    </div>
                                )}

                                {phase === "error" && (
                                    <div className="rounded-lg border border-red/25 bg-red/5 px-4 py-3">
                                        <p className="font-mono text-[0.72rem] text-red">{errorMsg}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Step 2: Integrate ────────────────────────────────────── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[0.85rem] font-semibold text-text">
                            Step 2 — Integrate
                        </p>
                        {isDeployed ? (
                            <span className="font-mono text-[0.65rem] text-green bg-green/8 border border-green/20 px-2 py-0.5 rounded-full">
                                ✓ address filled
                            </span>
                        ) : (
                            <span className="text-[0.72rem] text-muted">Address fills in after deploy</span>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-surface overflow-hidden">

                        {/* Tab bar */}
                        <div className="flex border-b border-border px-2 pt-1 overflow-x-auto">
                            {TABS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={`flex-shrink-0 px-4 py-3 min-h-[44px] text-[0.8rem] font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                                        tab === t.id
                                            ? "border-accent text-text"
                                            : "border-transparent text-muted hover:text-text"
                                    }`}
                                >
                                    {t.label}
                                    <span className={`hidden sm:block text-[0.64rem] font-normal mt-0.5 ${tab === t.id ? "text-accent" : "text-muted-2"}`}>
                                        {t.hint}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Install */}
                        <div className="px-4 py-3 border-b border-border">
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-2 shrink-0">
                                    Install
                                </span>
                                <code className="flex-1 font-mono text-[0.76rem] text-text truncate min-w-0">
                                    {pkgMgr === "npm"  && `npm install ${activeTab.pkg}`}
                                    {pkgMgr === "pnpm" && `pnpm add ${activeTab.pkg}`}
                                    {pkgMgr === "yarn" && `yarn add ${activeTab.pkg}`}
                                </code>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    {(["npm", "pnpm", "yarn"] as const).map(pm => (
                                        <button
                                            key={pm}
                                            onClick={() => setPkgMgr(pm)}
                                            className={`font-mono text-[0.65rem] px-2 py-1.5 rounded transition-colors cursor-pointer min-h-[32px]
                                                ${pkgMgr === pm
                                                    ? "bg-accent/15 text-accent"
                                                    : "text-muted-2 hover:text-text"
                                                }`}
                                        >
                                            {pm}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Code */}
                        <div className="px-4 pt-4 pb-4 space-y-2">
                            <p className="text-[0.68rem] font-mono uppercase tracking-widest text-muted-2 mb-2">
                                Code
                            </p>
                            <CodeBlock
                                code={activeTab.code}
                                language={activeTab.lang}
                                filename={activeTab.filename}
                                badge={activeTab.badge}
                            />
                        </div>

                    </div>
                </div>

            </main>
        </div>
    );
}
