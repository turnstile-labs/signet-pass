"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useWalletClient, useSwitchChain } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { waitForCallsStatus } from "viem/experimental";
import { ConnectKitButton } from "connectkit";
import { baseSepolia } from "wagmi/chains";
import {
    ATTESTATION_CACHE_ADDRESS,
    ATTESTATION_CACHE_ABI,
    getPublicClient,
} from "@/lib/wagmi";

// ── Artifact URLs ─────────────────────────────────────────────────────────────
// Version string must be bumped whenever the circuit is recompiled so the
// browser never loads a stale cached zkey/wasm (old files cause OOM or
// InvalidProof because the on-chain verifier rejects proofs from old zkeys).
const ARTIFACT_VERSION = "4"; // v4: partial-SHA circuit, maxHeadersLength=640

// ── Gas sponsorship ───────────────────────────────────────────────────────────
// When NEXT_PUBLIC_ALCHEMY_API_KEY is set, Coinbase Smart Wallet users get
// gasless transactions via Alchemy Gas Manager (EIP-5792 paymasterService).
// EOA wallets (MetaMask, Rabby, WalletConnect) always pay their own gas —
// which is negligible on Base Sepolia (~$0.00).
const _alchemyKey   = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const PAYMASTER_URL = _alchemyKey
    ? `https://base-sepolia.g.alchemy.com/v2/${_alchemyKey}`
    : "";
const WASM_URL = `/artifacts/signet_email.wasm?v=${ARTIFACT_VERSION}`;
const ZKEY_URL = `/artifacts/signet_email.zkey?v=${ARTIFACT_VERSION}`;

// ── GitHub & supported-domain constants ───────────────────────────────────────
const GITHUB_REPO = "https://github.com/turnstile-labs/signet";

// Every base domain for which at least one DKIM key is registered on-chain.
// An UnknownDKIMKey hit against a domain NOT in this set means the exchange
// itself is unsupported — not that a key rotated.
const SUPPORTED_DOMAINS = new Set([
    // Live exchanges
    "coinbase.com", "info.coinbase.com",
    "binance.com", "mailersp2.binance.com", "ses.binance.com", "mailer3.binance.com", "post.binance.com",
    "kraken.com",
    "okx.com", "mailer2.okx.com", "notice3.okx.com",
    "bybit.com",
    "gemini.com",
    "robinhood.com",
    "crypto.com",
    "kucoin.com",
    // Defunct exchanges
    "mtgox.com", "quadrigacx.com", "terra.money", "anchorprotocol.com",
    "celsius.network", "investvoyager.com", "vauld.com", "hodlnaut.com",
    "blockfi.com", "ftx.com", "ftx.us", "wazirx.com", "dmm.com",
]);

// Selectors whose DNS records have gone dark (domain lapsed, company collapsed,
// or key rotated) but whose pubkeyHash IS registered on-chain. When DNS fails
// for one of these we skip the "DNS miss" warning and proceed straight to proving,
// because the circuit will still verify against the on-chain hash.
// Format: "<selector>._domainkey.<domain>"
const REGISTERED_OFFLINE_KEYS = new Set([
    // Mt. Gox — DNS dead since ~2019; hash hardcoded on-chain
    "google._domainkey.mtgox.com",
    // QuadrigaCX — intermittent DNS post-bankruptcy
    "google._domainkey.quadrigacx.com",
    "default._domainkey.quadrigacx.com",
    // KuCoin retired selectors (DNS removed Sep 2025)
    "kuc._domainkey.kucoin.com",
    "s2._domainkey.kucoin.com",
    "mkt._domainkey.kucoin.com",
    // FTX pre-rotation keys (current DNS points to new key; old hash still on-chain)
    // Users with pre-Jan-2026 FTX emails can still prove.
    "s1._domainkey.ftx.com",
    "s2._domainkey.ftx.com",
    // WazirX k3 pre-rotation (DNS updated Nov 2024; old hash still on-chain)
    "k3._domainkey.wazirx.com",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "dkim_check" | "dkim_missing" | "verifying" | "loading" | "proving" | "done" | "error";

interface State {
    phase:          Phase;
    fileName:       string;
    status:         string;
    progress:       number;
    progressLabel:  string;
    pubkeyHash:     string;
    emailTimestamp: string;
    proofJson:      string;
    elapsed:        string;
    publicSignals:  string[];
    logLines:       string[];
}

const INITIAL: State = {
    phase: "idle", fileName: "", status: "", progress: 0,
    progressLabel: "", pubkeyHash: "",
    emailTimestamp: "", proofJson: "", elapsed: "", publicSignals: [],
    logLines: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchBytes(
    url: string,
    onProgress?: (pct: number, rcv: number, tot: number) => void
): Promise<Uint8Array> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load ${url} (${resp.status})`);
    const total  = parseInt(resp.headers.get("content-length") ?? "0");
    const reader = resp.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total && onProgress) onProgress((received / total) * 100, received, total);
    }
    const out = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
}

// MAX_HEADERS_SUFFIX: the maxHeadersLength of the new partial-SHA circuit.
// The circuit only receives the DKIM-Signature line (always last in the canonical
// signed block per RFC 6376) plus up to 63 bytes of SHA-256 alignment.
// 640 bytes = 10 SHA-256 blocks, comfortably fits any DKIM-Sig line.
const MAX_HEADERS_SUFFIX = 640;

/**
 * Build circuit inputs using partial-SHA header hashing.
 *
 * The DKIM-Signature line is always the last header in the canonical signed
 * block (RFC 6376 §5.4). We precompute SHA-256 through all headers that
 * precede it, then pass only the suffix (DKIM-Sig line, ~300-450 bytes) into
 * the circuit. This allows any header length — KuCoin 1600-byte blocks, long
 * EngageLab headers, etc. — without growing the circuit.
 *
 * The timestampIndex returned is relative to the start of the suffix buffer,
 * not the full canonical block.
 */
function buildPartialHeaderInputs(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dkimResult:            any,
    sha256Pad:             (msg: Uint8Array, maxLen: number) => [Uint8Array, number],
    generatePartialSHA:    (opts: { body: Uint8Array; bodyLength: number; selectorString: string; maxRemainingBodyLength: number }) => { precomputedSha: Uint8Array; bodyRemaining: Uint8Array; bodyRemainingLength: number },
    Uint8ArrayToCharArray: (a: Uint8Array) => string[],
    toCircomBigIntBytes:   (n: bigint) => string[],
    proverETHAddress:      string,
) {
    const headers   = dkimResult.headers   as Uint8Array;
    const publicKey = dkimResult.publicKey as bigint;
    const signature = dkimResult.signature as bigint;

    // SHA256-pad the full canonical signed block (length must be multiple of 64).
    const minPaddedLen = Math.ceil((headers.length + 9) / 64) * 64;
    const [paddedHeader, headerLen] = sha256Pad(headers, minPaddedLen);

    // Split at the 64-byte boundary just before the DKIM-Signature line.
    // The suffix includes the DKIM-Sig (with b= blanked) and the SHA256 length padding.
    const { precomputedSha, bodyRemaining: suffix, bodyRemainingLength: suffixLen } =
        generatePartialSHA({
            body:                   paddedHeader,
            bodyLength:             headerLen,
            selectorString:         "dkim-signature:",
            maxRemainingBodyLength: MAX_HEADERS_SUFFIX,
        });

    // Locate t= timestamp within the suffix (index relative to suffix, not full header).
    const timestampIndex = findTimestampIndex(Array.from(suffix).map(String));

    return {
        emailHeader:       Uint8ArrayToCharArray(suffix),
        emailHeaderLength: String(suffixLen),
        precomputedSHA:    Uint8ArrayToCharArray(precomputedSha),
        pubkey:            toCircomBigIntBytes(publicKey),
        signature:         toCircomBigIntBytes(signature),
        timestampIndex:    String(timestampIndex),
        proverETHAddress,
    };
}

function extractDkimMeta(raw: string): { domain: string; selector: string; rawSig: string } | null {
    // Unfold header continuation lines so multi-line DKIM-Signature values are readable.
    const unfolded = raw.replace(/\r?\n([ \t])/g, " ");
    // Collect all DKIM-Signature blocks.
    const allLines = unfolded.split(/\r?\n/).filter(l => /^DKIM-Signature:/i.test(l));
    if (allLines.length === 0) return null;

    // Prefer a sig whose d= domain is in our supported set (e.g. emails routed via
    // Cloudflare have a cloudflare-email.net sig first, but also a ses.binance.com sig).
    const preferred = allLines.find(line => {
        const d = line.match(/\bd=([^\s;,]+)/i)?.[1]?.toLowerCase();
        return d && SUPPORTED_DOMAINS.has(d);
    }) ?? allLines[0];

    const d = preferred.match(/\bd=([^\s;,]+)/i)?.[1];
    const s = preferred.match(/\bs=([^\s;,]+)/i)?.[1];
    if (!d || !s) return null;
    return { domain: d.toLowerCase(), selector: s.toLowerCase(), rawSig: preferred.trim() };
}

function logDkimMiss(selector: string, domain: string, stage: "dns_miss" | "on_chain_miss") {
    const token = process.env.NEXT_PUBLIC_GITHUB_DKIM_PAT;
    const repo  = process.env.NEXT_PUBLIC_GITHUB_REPOSITORY;
    if (!token || !repo) return;

    const dnsKey = `${selector}._domainkey.${domain}`;
    const label  = stage === "dns_miss" ? "DNS not found" : "Proof valid — not on-chain";
    const ts     = new Date().toISOString();

    fetch(`https://api.github.com/repos/${repo}/issues`, {
        method:  "POST",
        headers: {
            Authorization:          `Bearer ${token}`,
            Accept:                 "application/vnd.github+json",
            "Content-Type":         "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
            title:  `🔑 UnknownDKIMKey — ${label}: \`${dnsKey}\``,
            body:
                `A user attempted to prove an email but the DKIM key was not recognised.\n\n` +
                `**Selector:** \`${dnsKey}\`\n` +
                `**Stage:** ${stage}\n` +
                `**Time:** ${ts}\n\n` +
                `**Action required:**\n` +
                `1. Check if \`${domain}\` is a supported exchange domain.\n` +
                `2. If yes, resolve the current DNS key and register it:\n` +
                `   \`pnpm seed-dkim:dry\` → inspect output → \`pnpm seed-dkim\`\n` +
                `3. If the domain is unsupported, add it to the \`SUPPORTED_DOMAINS\` blocklist.`,
            labels: ["dkim-monitor", stage === "dns_miss" ? "dns-failure" : "key-rotation"],
        }),
    }).catch(() => { /* non-fatal — best-effort telemetry */ });
}

async function checkDkimDns(selector: string, domain: string): Promise<boolean> {
    const name = `${selector}._domainkey.${domain}`;
    for (const url of [
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    ]) {
        try {
            const res  = await fetch(url, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(4000) });
            if (!res.ok) continue;
            const json = await res.json() as { Status: number; Answer?: { type: number }[] };
            if (json.Status === 0 && json.Answer?.some(a => a.type === 16)) return true;
        } catch { /* try next resolver */ }
    }
    return false;
}

function findTimestampIndex(headerInts: string[]): number {
    const buf = new Uint8Array(headerInts.map(Number));
    const patterns: number[][] = [
        [59, 32, 116, 61],
        [59, 116, 61],
    ];
    for (const pat of patterns) {
        for (let i = 0; i < buf.length - pat.length; i++) {
            let match = true;
            for (let j = 0; j < pat.length; j++) {
                if (buf[i + j] !== pat[j]) { match = false; break; }
            }
            if (match) {
                const digitStart = i + pat.length;
                if (buf[digitStart] >= 48 && buf[digitStart] <= 57) return digitStart;
            }
        }
    }
    throw new Error("Could not find DKIM timestamp (t=) in email header.");
}

function formatDate(iso: string): string {
    if (!iso) return "";
    const [year, month, day] = iso.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
}

function shortenHex(hex: string, chars = 6): string {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

/**
 * Wait for an EIP-5792 smart wallet batch to be confirmed, then return the
 * first receipt's transaction hash.
 *
 * Delegates to viem's waitForCallsStatus which handles:
 *   - Numeric status codes (100 pending, 200 confirmed, 300+ failed)
 *   - Coinbase Smart Wallet's "fallback magic identifier" — when the wallet
 *     can't truly batch it encodes the plain tx hash inside the callsId and
 *     resolves it via eth_getTransactionReceipt, bypassing wallet_getCallsStatus
 *     entirely. Our previous manual poll broke on this case.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForSmartWalletTx(callsId: string, walletClient: any, timeoutMs = 120_000): Promise<`0x${string}`> {
    const result = await waitForCallsStatus(walletClient, {
        id: callsId,
        timeout: timeoutMs,
        pollingInterval: 2_000,
        throwOnFailure: true,
    });
    const txHash = result?.receipts?.[0]?.transactionHash;
    if (!txHash) throw new Error("Smart wallet transaction confirmed but no receipt hash found.");
    return txHash;
}

function extractRevert(raw: string): string {
    // Pre-flight errors from submitProof already contain full context — pass through.
    if (raw === "INSUFFICIENT_GAS")             return "INSUFFICIENT_GAS";
    if (raw.startsWith("WalletMismatch —"))     return raw;
    if (raw.includes("WalletAlreadyAttested"))  return "WalletAlreadyAttested — this wallet already has an on-chain attestation.";
    if (raw.includes("WalletMismatch"))         return "WalletMismatch — proof was generated for a different address. Reset and re-prove with this wallet connected.";
    if (raw.includes("InvalidProof"))           return "InvalidProof — ZK proof verification failed on-chain. Hard-refresh the page (Cmd+Shift+R), then re-prove.";
    if (raw.includes("UnknownDKIMKey"))         return "DKIM_KEY_UNREGISTERED";
    if (raw.includes("AlreadyAttested"))        return "AlreadyAttested — this proof has already been used to register a different wallet.";
    if (raw.includes("SignetEmailTooRecent"))   return "EmailTooRecent — this email's timestamp is after the snapshot cutoff.";
    if (raw.includes("User rejected") || raw.includes("user rejected")) return "Transaction rejected.";
    if (raw.toLowerCase().includes("insufficient funds"))               return "INSUFFICIENT_GAS";
    const revertStr = raw.match(/reverted with reason string '([^']+)'/)?.[1];
    if (revertStr) return revertStr;
    const customErr = raw.match(/The following reason was thrown: (.+)/)?.[1]?.trim();
    if (customErr) return customErr;
    return raw.split("\n").find(l => l.trim() && !l.startsWith("    at ") && !l.includes("Error: ")) ?? raw.split("\n")[0];
}

// ── Copy icon ─────────────────────────────────────────────────────────────────

function CopyIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor"
             strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4.5" y="4.5" width="7" height="7" rx="1" />
            <path d="M1.5 8.5V2a.5.5 0 0 1 .5-.5H8" />
        </svg>
    );
}

// ── Copy hook ─────────────────────────────────────────────────────────────────

function useCopy() {
    const [copied, setCopied] = useState<string | null>(null);
    const copy = useCallback((text: string, key: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 1500);
        }).catch(() => {});
    }, []);
    return { copy, copied };
}

// ── StepCard ──────────────────────────────────────────────────────────────────

type StepStatus = "locked" | "active" | "done";

function StepCard({
    num, title, status, summary, isLast = false, children,
}: {
    num:      number;
    title:    string;
    status:   StepStatus;
    summary?: React.ReactNode;
    isLast?:  boolean;
    children?: React.ReactNode;
}) {
    const showContent = status === "active" || (isLast && status !== "locked");

    return (
        <div className="flex gap-4">
            {/* ── Left rail: circle + connector ── */}
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 28 }}>
                <div className={`prove-step-dot ${
                    status === "done"   ? "prove-step-done"
                    : status === "active" ? "prove-step-active"
                    : "prove-step-locked"
                }`}>
                    {status === "done" ? "✓" : num}
                </div>
                {!isLast && (
                    <div className={`prove-step-rail ${status === "done" ? "prove-step-rail-done" : ""}`} />
                )}
            </div>

            {/* ── Right: title + content ── */}
            <div className={`flex-1 min-w-0 ${isLast ? "pb-2" : "pb-7"}`}>
                {/* Title row */}
                <div className="flex items-center gap-2 min-h-[28px]">
                    <span className={`text-sm font-medium leading-none transition-colors ${
                        status === "done"   ? "text-muted"
                        : status === "active" ? "text-text"
                        : "text-muted-2"
                    }`}>
                        {title}
                    </span>
                    {status === "done" && summary && (
                        <>
                            <span className="text-border-h text-xs">·</span>
                            <span className="font-mono text-[0.72rem] text-muted-2 truncate">
                                {summary}
                            </span>
                        </>
                    )}
                </div>

                {/* Content — shown when active, or always for last step (unless locked) */}
                {showContent && (
                    <div className="mt-4">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Copy ──────────────────────────────────────────────────────────────────────

const COPY = {
    eyebrow:      "Proof of OG",
    h1:           <>Prove you were here.<br />Before everyone else.</>,
    subtitle:     "Your exchange account is a timestamp that can't be faked — it required real ID and existed before any airdrop snapshot. Drop an old exchange email and your browser proves its age privately in ~30 seconds. No email leaves your device. Verified once, valid for every protocol using Signet.",
    step1Title:   "Connect your wallet",
    step1Body:    "Connect the wallet you want your proof tied to. Your address is baked into the ZK proof — only this wallet gets the on-chain attestation.",
    step2Hint:    "Find any old email from your exchange — a welcome, deposit confirmation, or trade receipt. The older the better. Save it as a .eml file and drop it below.",
    dropExchanges:"Coinbase · Binance · Kraken · OKX · Bybit · Gemini · Crypto.com · KuCoin · Robinhood",
    successHeader:"✓ OG status confirmed — you're on-chain.",
    successSub:   "Your proof is permanent. Every protocol that integrates Signet can verify it with a single read call — no re-proving, no re-uploading.",
} as const;

// ── Main component ────────────────────────────────────────────────────────────

interface ProveClientProps {
    returnUrl?:     string | null;
    prefillWallet?: string | null;
}

export function ProveClient({ returnUrl, prefillWallet }: ProveClientProps = {}) {
    const ctxCopy = COPY;
    const [state, setState] = useState<State>(INITIAL);
    const patch = (p: Partial<State>) => setState(prev => ({ ...prev, ...p }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groth16Ref               = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifyDKIMRef            = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sha256PadRef             = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generatePartialSHARef    = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Uint8ArrayToCharArrayRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toCircomBigIntBytesRef   = useRef<any>(null);
    const libsReady                = useRef(false);

    const wasmBytesRef     = useRef<Uint8Array | null>(null);
    const zkeyBytesRef     = useRef<Uint8Array | null>(null);
    const walletAddressRef = useRef<string>("");
    const logEndRef        = useRef<HTMLDivElement | null>(null);

    // Cancellation: each run gets an ID; cancel = increment runIdRef so the
    // in-flight fullProve discards its result when it eventually resolves.
    // bgProvingRef tracks whether fullProve is still executing so we can block
    // a second simultaneous proof (two concurrent provers → OOM).
    const runIdRef    = useRef(0);
    const bgProvingRef = useRef(false);
    const [bgProving, setBgProving] = useState(false);

    // ── Wagmi ─────────────────────────────────────────────────────────────────
    const { address, isConnected } = useAccount();
    const { disconnect }           = useDisconnect();
    const { data: walletClient }   = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }     = useSwitchChain();
    const { copy, copied }         = useCopy();

    walletAddressRef.current = address ?? "";

    // EIP-5792 capability detection + gasless write hook
    const { data: capabilities }  = useCapabilities();
    const { writeContractsAsync } = useWriteContracts();

    // Auto-scroll terminal
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [state.logLines]);

    // Load proving libraries
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Use the two-step API so we can pass skipBodyHash=true to
                // verifyDKIMSignature. generateEmailVerifierInputs (v6.4.2) has
                // a bug where it never forwards ignoreBodyHashCheck to the
                // underlying DKIM verifier, causing "body hash did not verify"
                // errors even when ignoreBodyHashCheck: true is passed.
                // verifyDKIMSignature lives in the dkim submodule (not re-exported
                // from the root); generateEmailVerifierInputsFromDKIMResult IS in
                // the root JS but lacks root-level .d.ts, so we import both via any.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [snarkjsMod, helpersMod, dkimMod]: any[] = await Promise.all([
                    import("snarkjs"),
                    import("@zk-email/helpers"),
                    import("@zk-email/helpers/dist/dkim" as any),
                ]);
                if (cancelled) return;
                groth16Ref.current               = snarkjsMod.groth16;
                verifyDKIMRef.current            = dkimMod.verifyDKIMSignature;
                sha256PadRef.current             = helpersMod.sha256Pad;
                generatePartialSHARef.current    = helpersMod.generatePartialSHA;
                Uint8ArrayToCharArrayRef.current = helpersMod.Uint8ArrayToCharArray;
                toCircomBigIntBytesRef.current   = helpersMod.toCircomBigIntBytes;
                libsReady.current                = true;
            } catch (e) {
                console.error("Failed to load proving libraries:", e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Pre-warm artifact download
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!wasmBytesRef.current) {
                    const bytes = await fetchBytes(WASM_URL);
                    if (!cancelled) wasmBytesRef.current = bytes;
                }
                if (!zkeyBytesRef.current) {
                    const bytes = await fetchBytes(ZKEY_URL);
                    if (!cancelled) zkeyBytesRef.current = bytes;
                }
            } catch { /* silent — handleFile retries on demand */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Prove flow ────────────────────────────────────────────────────────────

    const runProof = useCallback(async (raw: string, fileName: string) => {
        if (!libsReady.current) {
            patch({ status: "Still initialising, please wait a moment…" });
            return;
        }

        // Capture run ID at the very start so cancel works at any phase.
        const myRunId = ++runIdRef.current;
        const isCancelled = () => runIdRef.current !== myRunId;

        patch({ ...INITIAL, phase: "verifying", fileName, status: "Verifying DKIM signature…" });

        try {
            // Step 1: verify DKIM with skipBodyHash=true (circuit uses ignoreBodyHashCheck)
            const dkimResult = await verifyDKIMRef.current(
                Buffer.from(raw),
                "",    // auto-detect domain from DKIM-Signature header
                true,  // enableSanitization
                false, // fallbackToZKEmailDNSArchive
                true,  // skipBodyHash ← fixes the body hash pre-check bug in v6.4.2
            );
            if (isCancelled()) return;

            // Step 2: build partial-SHA circuit inputs.
            // Precomputes SHA-256 through all headers before the DKIM-Signature
            // line, so the circuit only processes the small suffix (~300-450 bytes).
            // This allows arbitrary header lengths (KuCoin, EngageLab, etc.).
            const inputs = buildPartialHeaderInputs(
                dkimResult,
                sha256PadRef.current,
                generatePartialSHARef.current,
                Uint8ArrayToCharArrayRef.current,
                toCircomBigIntBytesRef.current,
                walletAddressRef.current || "0",
            );

            patch({ phase: "loading", status: "Loading ZK artifacts…" });

            if (!wasmBytesRef.current) {
                wasmBytesRef.current = await fetchBytes(WASM_URL);
                if (isCancelled()) return;
            }
            if (!zkeyBytesRef.current) {
                zkeyBytesRef.current = await fetchBytes(ZKEY_URL, (pct, rcv, tot) =>
                    patch({
                        progress:      pct,
                        progressLabel: `${(rcv / 1e6).toFixed(0)} / ${(tot / 1e6).toFixed(0)} MB`,
                    })
                );
                if (isCancelled()) return;
            } else {
                patch({ progress: 100, progressLabel: "cached" });
            }
            const wasmBytes = wasmBytesRef.current;
            const zkeyBytes = zkeyBytesRef.current;

            patch({ phase: "proving", progress: 100, status: "Generating proof…", logLines: [] });

            bgProvingRef.current = true;
            setBgProving(true);

            const logs: string[] = [];
            const logger = {
                debug: (msg: string) => { logs.push(msg); setState(prev => ({ ...prev, logLines: [...logs] })); },
                info:  (msg: string) => { logs.push(msg); setState(prev => ({ ...prev, logLines: [...logs] })); },
                warn:  (msg: string) => { logs.push(`warn: ${msg}`); setState(prev => ({ ...prev, logLines: [...logs] })); },
                error: (msg: string) => { logs.push(`error: ${msg}`); setState(prev => ({ ...prev, logLines: [...logs] })); },
            };

            try {
                const t0 = performance.now();
                const { proof, publicSignals } =
                    await groth16Ref.current.fullProve(inputs, wasmBytes, zkeyBytes, logger);
                const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

                if (isCancelled()) return;

                // New signal layout (no email_recipient):
                // [0] pubkeyHash, [1] email_timestamp, [2] proverETHAddress
                const ts = Number(publicSignals[1]);
                const emailTimestamp = isNaN(ts) || ts === 0
                    ? ""
                    : new Date(ts * 1000).toISOString().split("T")[0];

                patch({
                    phase:         "done",
                    elapsed,
                    pubkeyHash:    publicSignals[0] as string,
                    emailTimestamp,
                    proofJson:     JSON.stringify(proof, null, 2),
                    publicSignals: publicSignals as string[],
                    status:        `Proof generated in ${elapsed}s`,
                });
            } catch (innerErr) {
                if (isCancelled()) return;
                const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
                console.error(innerErr);
                patch({ phase: "error", status: msg });
            } finally {
                bgProvingRef.current = false;
                setBgProving(false);
            }

        } catch (err) {
            if (isCancelled()) return;
            const msg = err instanceof Error ? err.message : String(err);
            console.error(err);
            patch({ phase: "error", status: msg });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCancel = useCallback(() => {
        runIdRef.current++; // invalidate in-flight run
        patch({ ...INITIAL, phase: "idle" });
    }, []);

    const handleFile = useCallback(async (file: File) => {
        if (!libsReady.current) {
            patch({ status: "Still initialising, please wait a moment…" });
            return;
        }
        if (bgProvingRef.current) {
            patch({ status: "Previous computation still finishing — please wait a moment…" });
            return;
        }

        const raw = (await file.text())
            .replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
            .replace(/^([a-z][a-z0-9-]*):/gim,
                (_, n: string) => n.replace(/(?:^|-)\w/g, (c: string) => c.toUpperCase()) + ":");

        const meta = extractDkimMeta(raw);
        setDkimMeta(meta);
        pendingRawRef.current = raw;

        if (!meta) {
            // No DKIM header found — proceed, will fail with a clear error later
            runProof(raw, file.name);
            return;
        }

        // Reject unsupported domains immediately — no key will ever be in the registry.
        if (!SUPPORTED_DOMAINS.has(meta.domain)) {
            patch({ ...INITIAL, phase: "error", status: "UNSUPPORTED_DOMAIN", fileName: file.name });
            return;
        }

        patch({ ...INITIAL, phase: "dkim_check", fileName: file.name, status: "Checking DKIM key…" });

        const dnsKey = `${meta.selector}._domainkey.${meta.domain}`;
        const dnsOk  = REGISTERED_OFFLINE_KEYS.has(dnsKey) || await checkDkimDns(meta.selector, meta.domain);

        if (!dnsOk) {
            logDkimMiss(meta.selector, meta.domain, "dns_miss");
            patch({ phase: "dkim_missing", status: "Key not found in DNS" });
        } else {
            runProof(raw, file.name);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runProof]);

    // ── Tx state ──────────────────────────────────────────────────────────────
    const [txHash,         setTxHash]         = useState<string>("");
    const [isTxPending,    setIsTxPending]    = useState(false);
    const [isTxConfirmed,  setIsTxConfirmed]  = useState(false);
    const [isSimConfirmed, setIsSimConfirmed] = useState(false);
    const [simTxHash,      setSimTxHash]      = useState<string>("");
    const [isDryRun,       setIsDryRun]       = useState(false);
    const [txError,        setTxError]        = useState<string>("");
    const [dkimMeta,       setDkimMeta]       = useState<{ domain: string; selector: string; rawSig: string } | null>(null);
    const pendingRawRef = useRef<string>("");

    // prefillWallet: skip to done if already attested
    useEffect(() => {
        if (!prefillWallet) return;
        (async () => {
            try {
                const { getPublicClient: gpc } = await import("@/lib/wagmi");
                const { ATTESTATION_CACHE_ADDRESS: addr, ATTESTATION_CACHE_ABI: abi } = await import("@/lib/wagmi");
                const has = await gpc().readContract({
                    address:      addr,
                    abi,
                    functionName: "hasAttestation",
                    args:         [prefillWallet as `0x${string}`],
                });
                if (has) patch({ phase: "done", status: "Wallet already attested on-chain." });
            } catch { /* ignore */ }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillWallet]);

    const handleReset = useCallback(() => {
        setState(INITIAL);
        setTxHash(""); setIsTxConfirmed(false);
        setIsSimConfirmed(false); setSimTxHash("");
        setIsDryRun(false); setTxError(""); setDkimMeta(null);
        pendingRawRef.current = "";
    }, []);

    const handleDisconnect = useCallback(() => {
        disconnect();
        setTxHash(""); setIsSimConfirmed(false); setSimTxHash("");
        setIsTxConfirmed(false); setIsDryRun(false); setTxError("");
    }, [disconnect]);

    const pubkeyHashRef = useRef<string>("");
    pubkeyHashRef.current = state.pubkeyHash;

    const submitProof = useCallback(async (proof: object, sigs: string[], dryRun = false) => {
        setTxError("");
        setIsTxPending(true);
        setIsDryRun(dryRun);
        try {
            if (!walletClient) throw new Error("Wallet not connected");
            await switchChainAsync({ chainId: baseSepolia.id });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = proof as any;

            // Pre-flight: verify the address embedded in the proof matches the connected wallet.
            // New signal layout: [0]=pubkeyHash, [1]=email_timestamp, [2]=proverETHAddress
            const proofAddrBig   = BigInt(sigs[2]);
            const connectedAddr  = address as `0x${string}`;
            const connectedBig   = BigInt(connectedAddr);
            if (proofAddrBig !== connectedBig) {
                const proofAddrHex = `0x${proofAddrBig.toString(16).padStart(40, "0")}`;
                throw new Error(
                    `WalletMismatch — proof was generated for ${proofAddrHex} but your connected wallet is ${connectedAddr}. ` +
                    `Switch to that account in MetaMask, or click Reset and re-prove with this wallet.`
                );
            }

            const txArgs = [
                [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])],
                [
                    [BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])],
                    [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])],
                ],
                [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])],
                [BigInt(sigs[0]), BigInt(sigs[1]), BigInt(sigs[2])],
            ] as const;

            // Simulate the transaction before sending to MetaMask.  If the contract will
            // revert, viem decodes the custom error name and we surface it immediately —
            // avoiding a MetaMask popup with a greyed-out Confirm button.
            try {
                await getPublicClient().simulateContract({
                    address:      ATTESTATION_CACHE_ADDRESS,
                    abi:          ATTESTATION_CACHE_ABI,
                    functionName: dryRun ? "dryRunAttest" : "attest",
                    args:         txArgs,
                    account:      connectedAddr,
                });
            } catch (simErr) {
                // viem stores the decoded custom error name in .cause.data.errorName,
                // NOT in .message (which is just the generic "contract reverted" string).
                // Prepend the error name so extractRevert() can pattern-match it.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cause     = (simErr as any)?.cause;
                const errorName = cause?.data?.errorName ?? cause?.reason ?? "";
                const simMsg    = simErr instanceof Error ? simErr.message : String(simErr);
                throw new Error(errorName ? `${errorName} — ${simMsg}` : simMsg);
            }

            // ── Tx submission: smart wallet (gasless) or EOA (user pays) ───────
            // Coinbase Smart Wallet exposes paymasterService capability (EIP-5792).
            // EOA wallets (MetaMask, Rabby) fall through to the standard path.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chainCaps   = (capabilities as any)?.[baseSepolia.id];
            const usePaymaster = !!(chainCaps?.paymasterService?.supported && PAYMASTER_URL);

            let hash: `0x${string}`;
            if (usePaymaster) {
                // EIP-5792 path — gas sponsored by Alchemy Gas Manager policy.
                const callsResult = await writeContractsAsync({
                    contracts: [{
                        address:      ATTESTATION_CACHE_ADDRESS,
                        abi:          ATTESTATION_CACHE_ABI,
                        functionName: dryRun ? "dryRunAttest" : "attest",
                        args:         txArgs,
                    }],
                    capabilities: {
                        paymasterService: { url: PAYMASTER_URL },
                    },
                });
                // writeContractsAsync returns { id: string } in viem 2.x (not a plain string)
                const callsId = typeof callsResult === "string" ? callsResult : callsResult.id;
                hash = await waitForSmartWalletTx(callsId, walletClient);
            } else {
                // EOA path — check balance before opening MetaMask so the user
                // sees a faucet link instead of a greyed-out MetaMask popup.
                const balance = await getPublicClient().getBalance({ address: connectedAddr });
                if (balance < 10_000_000_000_000n) throw new Error("INSUFFICIENT_GAS"); // < 0.00001 ETH

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                hash = await (walletClient.writeContract as any)({
                    address:      ATTESTATION_CACHE_ADDRESS,
                    abi:          ATTESTATION_CACHE_ABI,
                    functionName: dryRun ? "dryRunAttest" : "attest",
                    args:         txArgs,
                    account:      connectedAddr,
                }) as `0x${string}`;
            }
            await getPublicClient().waitForTransactionReceipt({ hash });
            if (dryRun) {
                setIsSimConfirmed(true);
                setSimTxHash(hash);
            } else {
                setTxHash(hash);
                setIsTxConfirmed(true);
                if (returnUrl) setTimeout(() => { window.location.href = returnUrl; }, 1500);
            }
        } catch (e) {
            const raw = e instanceof Error ? e.message : String(e);
            const reason = extractRevert(raw);
            if (reason === "DKIM_KEY_UNREGISTERED") {
                const domain   = dkimMeta?.domain   ?? "unknown";
                const selector = dkimMeta?.selector ?? "unknown";
                logDkimMiss(selector, domain, "on_chain_miss");
                setTxError(`DKIM_KEY_UNREGISTERED|${domain}|${selector}`);
            } else {
                setTxError(reason);
            }
        } finally {
            setIsTxPending(false);
        }
    }, [walletClient, switchChainAsync, dkimMeta, returnUrl, address, capabilities, writeContractsAsync]);

    const [dragOver, setDragOver] = useState(false);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file?.name.endsWith(".eml")) handleFile(file);
    }, [handleFile]);

    const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = "";
    }, [handleFile]);

    // ── Derived ───────────────────────────────────────────────────────────────

    const { phase, status, progress, progressLabel, pubkeyHash,
            emailTimestamp, proofJson, elapsed, publicSignals, logLines } = state;

    // Auto-simulate when proof is ready and wallet is available
    useEffect(() => {
        if (phase !== "done" || !proofJson || !publicSignals.length) return;
        if (isTxPending || isTxConfirmed || isSimConfirmed) return;
        if (!walletClient) return;
        submitProof(JSON.parse(proofJson), publicSignals, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, proofJson, walletClient]);

    const isRunning = ["dkim_check", "verifying", "loading", "proving"].includes(phase);
    const isDone    = phase === "done";
    const isError   = phase === "error";
    const isConfirmed = isTxConfirmed || isSimConfirmed;

    // ── Step statuses ─────────────────────────────────────────────────────────

    const step1Status: StepStatus = isConnected ? "done" : "active";

    const step2Status: StepStatus =
        !isConnected                                                  ? "locked"
        : (isRunning || isDone || isError || phase === "dkim_missing") ? "done"
        : "active";

    // Step 3: Generate proof — done once proof is ready, error shown inside
    const step3Status: StepStatus =
        !isConnected || phase === "idle"  ? "locked"
        : isDone                          ? "done"
        : "active";

    // Step 4: Record on-chain — active while proof ready & not yet confirmed
    const step4Status: StepStatus =
        !isDone        ? "locked"
        : isConfirmed  ? "done"
        : "active";

    // Step 5: Results — unlocks only after tx is confirmed
    const step5Status: StepStatus =
        !isConfirmed ? "locked" : "active";

    // Step 4 summary: short tx hash once confirmed
    const step4Summary =
        isConfirmed && (txHash || simTxHash)
            ? `${(txHash || simTxHash).slice(0, 10)}…${(txHash || simTxHash).slice(-6)} · confirmed`
            : undefined;

    // Step 2 summary: domain + date when available, else filename
    const step2Summary =
        dkimMeta?.domain
            ? emailTimestamp
                ? `${dkimMeta.domain} · ${formatDate(emailTimestamp)}`
                : dkimMeta.domain
            : state.fileName || undefined;

    // Step 3 summary: domain · date · proof time
    const step3Summary =
        elapsed
            ? dkimMeta?.domain
                ? emailTimestamp
                    ? `${dkimMeta.domain} · ${formatDate(emailTimestamp)} · ${elapsed}s`
                    : `${dkimMeta.domain} · ${elapsed}s`
                : `${elapsed}s`
            : undefined;

    // ── Inline step tracker (inside step 3) ───────────────────────────────────

    const proofSteps = [
        { label: "DKIM",      ph: "verifying" as Phase },
        { label: "Artifacts", ph: "loading"   as Phase },
        { label: "Proof",     ph: "proving"   as Phase },
        { label: "Done",      ph: "done"      as Phase },
    ];
    const phaseOrder: Phase[] = ["idle", "verifying", "loading", "proving", "done", "error"];

    const proofStepStatus = (sPh: Phase): "" | "active" | "done" | "error" => {
        if (phase === "done")  return "done";
        if (phase === "error") {
            const si = phaseOrder.indexOf(sPh);
            const ci = phaseOrder.indexOf(
                (["verifying", "loading", "proving"] as Phase[]).findLast(
                    p => phaseOrder.indexOf(p) <= 3
                ) ?? "verifying"
            );
            if (si < ci)  return "done";
            if (si === ci) return "error";
            return "";
        }
        const si = phaseOrder.indexOf(sPh);
        const ci = phaseOrder.indexOf(phase);
        if (ci > si)   return "done";
        if (ci === si) return "active";
        return "";
    };

    const protocolHost = returnUrl
        ? (() => { try { return new URL(returnUrl).hostname; } catch { return null; } })()
        : null;

    const contractShort = `${ATTESTATION_CACHE_ADDRESS.slice(0,6)}…${ATTESTATION_CACHE_ADDRESS.slice(-4)}`;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div>
            {/* ── Context banner ────────────────────────────────────────────── */}
            {protocolHost && (
                <div className="mb-8 px-4 py-3 rounded-xl border border-accent/25 bg-accent/5
                                flex items-center gap-3">
                    <span className="text-accent text-base flex-shrink-0">⬡</span>
                    <div>
                        <p className="text-[0.78rem] font-medium text-text">
                            Verifying eligibility for <span className="text-accent">{protocolHost}</span>
                        </p>
                        <p className="text-[0.72rem] text-muted">
                            You&apos;ll be redirected back to claim once your account is verified.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Page heading ─────────────────────────────────────────────── */}
            <div className="mb-8">
                <p className="text-[0.68rem] font-mono uppercase tracking-widest text-muted-2 mb-1.5">
                    {ctxCopy.eyebrow}
                </p>
                <h1 className="text-[2.4rem] font-bold tracking-tight text-white leading-[1.1] mb-3">
                    {ctxCopy.h1}
                </h1>
                <p className="text-[0.85rem] text-muted leading-relaxed">
                    {ctxCopy.subtitle}
                </p>
            </div>

            {/* ── Steps ────────────────────────────────────────────────────── */}
            <div>

                {/* ── Step 1: Connect wallet ──────────────────────────────── */}
                <StepCard
                    num={1}
                    title={ctxCopy.step1Title}
                    status={step1Status}
                    summary={
                        isConnected && address
                            ? `${address.slice(0,6)}…${address.slice(-4)}`
                            : undefined
                    }
                >
                    <p className="text-[0.82rem] text-muted leading-relaxed mb-5">
                        {ctxCopy.step1Body}
                    </p>
                    <ConnectKitButton.Custom>
                        {({ show }) => (
                            <button
                                onClick={show}
                                className="w-full rounded-xl px-4 py-3 text-sm font-medium
                                    bg-surface-2 border border-border-h text-text
                                    hover:border-accent/50 hover:text-accent transition-colors cursor-pointer"
                            >
                                Connect wallet
                            </button>
                        )}
                    </ConnectKitButton.Custom>
                </StepCard>

                {/* ── Step 2: Select .eml file ─────────────────────────────── */}
                <StepCard
                    num={2}
                    title="Export & select .eml"
                    status={step2Status}
                    summary={step2Summary}
                >
                    {/* Export hint */}
                    <div className="rounded-xl border border-border bg-surface divide-y divide-border mb-4 overflow-hidden">
                        <div className="px-4 py-2.5">
                            <p className="text-[0.72rem] text-muted">
                                {ctxCopy.step2Hint.replace(". Save it as a .eml file and drop it below.", "")}{" "}
                                Save it as a <code className="font-mono text-text">.eml</code> file and drop it below.
                            </p>
                        </div>
                        {[
                            { client: "Gmail",      steps: ["Open email", "⋮ menu", "Download message (.eml)"] },
                            { client: "Outlook",    steps: ["Open email", "File", "Save as → .eml format"]     },
                            { client: "Apple Mail", steps: ["Open email", "Drag message to desktop"]           },
                        ].map(({ client, steps }) => (
                            <div key={client} className="flex items-center gap-3 px-4 py-2.5">
                                <span className="text-[0.72rem] font-medium text-text w-20 flex-shrink-0">
                                    {client}
                                </span>
                                <div className="flex items-center gap-1 flex-wrap">
                                    {steps.map((s, i) => (
                                        <span key={i} className="flex items-center gap-1">
                                            {i > 0 && <span className="text-muted-2 text-[0.65rem]">→</span>}
                                            <span className="text-[0.72rem] text-muted">{s}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Drop zone — hidden when DKIM check is running or showing result */}
                    {!["dkim_check", "dkim_missing"].includes(phase) && (
                    <div
                        className={`relative border-[1.5px] border-dashed rounded-2xl p-10
                            transition-colors cursor-pointer
                            ${dragOver
                                ? "border-accent bg-accent/[0.05]"
                                : "border-border hover:border-accent/60 hover:bg-accent/[0.025]"
                            }`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                    >
                        <input
                            type="file" accept=".eml"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={onInput}
                        />
                        <div className="text-center pointer-events-none">
                            <div className="text-3xl mb-3 select-none">📂</div>
                            <div className="text-base font-medium text-text mb-1">
                                Drop <code className="font-mono text-accent text-[0.9rem]">.eml</code> file here
                            </div>
                            <div className="text-[0.78rem] text-muted mb-2">
                                or <span className="text-accent underline underline-offset-2">browse to select</span>
                            </div>
                            <div className="text-[0.72rem] text-muted-2">
                                {ctxCopy.dropExchanges}
                            </div>
                            <div className="text-[0.68rem] text-muted-2 mt-1">
                                Verified locally · file never leaves your device
                            </div>
                        </div>
                    </div>
                    )}

                    {/* DKIM check in progress */}
                    {phase === "dkim_check" && (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface mt-4">
                            <div className="w-4 h-4 flex-shrink-0 relative">
                                <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
                                <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
                            </div>
                            <div>
                                <p className="text-[0.82rem] text-text font-medium">Checking DKIM key</p>
                                {dkimMeta && (
                                    <p className="font-mono text-[0.68rem] text-muted-2 mt-0.5">
                                        {dkimMeta.selector}._domainkey.{dkimMeta.domain}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* DKIM key not in DNS — bounty mechanic */}
                    {phase === "dkim_missing" && dkimMeta && (
                        <div className="space-y-3 mt-4">
                            <div className="rounded-xl border border-amber/25 bg-amber/5 px-5 py-4 space-y-3">
                                <div className="flex items-start gap-3">
                                    <span className="text-amber text-lg flex-shrink-0 mt-0.5">⚠</span>
                                    <div>
                                        <p className="text-[0.88rem] font-semibold text-text">Key not found in DNS</p>
                                        <p className="text-[0.78rem] text-muted mt-1 leading-relaxed">
                                            The signing key for{" "}
                                            <code className="font-mono text-muted-2">{dkimMeta.selector}._domainkey.{dkimMeta.domain}</code>{" "}
                                            doesn&apos;t resolve — likely a third-party email provider (e.g. Mimecast, SES).
                                            The key may not be in the registry yet.
                                        </p>
                                    </div>
                                </div>
                                <div className="pt-1 border-t border-amber/15 space-y-2">
                                    <p className="text-[0.72rem] font-medium text-amber">Help get this key registered</p>
                                    <div className="font-mono text-[0.62rem] text-muted-2 bg-bg border border-border
                                                    rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed relative group">
                                        {dkimMeta.rawSig}
                                        <button
                                            onClick={() => navigator.clipboard.writeText(dkimMeta.rawSig)}
                                            className="absolute top-2 right-2 font-mono text-[0.58rem] text-muted-2
                                                       hover:text-accent px-1.5 py-0.5 rounded bg-surface border border-border"
                                        >
                                            copy
                                        </button>
                                    </div>
                                    <a
                                        href={`${GITHUB_REPO}/issues/new?title=${encodeURIComponent(`Register DKIM key — ${dkimMeta.selector}._domainkey.${dkimMeta.domain}`)}&body=${encodeURIComponent(`Selector: \`${dkimMeta.selector}._domainkey.${dkimMeta.domain}\`\n\n${dkimMeta.rawSig}\n\nPlease register this key.`)}&labels=dkim-key`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block text-[0.74rem] text-amber hover:underline"
                                    >
                                        Open GitHub issue to register it ↗
                                    </a>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <button onClick={handleReset} className="text-[0.75rem] text-muted-2 hover:text-muted transition-colors">
                                    Try a different email
                                </button>
                                <button
                                    onClick={() => runProof(pendingRawRef.current, state.fileName)}
                                    className="text-[0.75rem] text-muted hover:text-text transition-colors"
                                >
                                    Try anyway →
                                </button>
                            </div>
                        </div>
                    )}
                </StepCard>

                {/* ── Step 3: Generate proof ──────────────────────────────── */}
                <StepCard
                    num={3}
                    title="Prove account age"
                    status={step3Status}
                    summary={step3Summary}
                >
                    <div className="space-y-4">
                        {/* Inline proof step tracker */}
                        <div className="flex items-start">
                            {proofSteps.map((s, i) => {
                                const ss = proofStepStatus(s.ph);
                                return (
                                    <div key={s.ph} className="contents">
                                        <div className={`flex flex-col items-center flex-1 ${
                                            ss === "active" ? "step-active"
                                            : ss === "done" ? "step-done"
                                            : ss === "error" ? "step-error" : ""
                                        }`}>
                                            <div className="step-dot">
                                                {ss === "done"  ? "✓" :
                                                 ss === "error" ? "✗" : i + 1}
                                            </div>
                                            <div className="step-name">{s.label}</div>
                                        </div>
                                        {i < proofSteps.length - 1 && (
                                            <div className={`connector ${ss === "done" ? "connector-done" : ""}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Current phase status */}
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl
                                        border border-border bg-surface">
                            {isRunning && (
                                <div className="w-4 h-4 flex-shrink-0 relative">
                                    <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
                                    <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-[0.82rem] text-text font-medium">
                                    {phase === "dkim_check" ? "Checking DKIM key"
                                     : phase === "verifying" ? "Verifying DKIM signature"
                                     : phase === "loading"   ? "Loading ZK artifacts"
                                     : phase === "proving"   ? "Generating proof"
                                     : isError               ? "Error"
                                     : "Proof generated"}
                                </div>
                                {phase === "loading" && (
                                    <div className="text-[0.72rem] text-muted mt-0.5">
                                        {progressLabel
                                            ? `${progressLabel}${progressLabel === "cached" ? "" : " · one-time download"}`
                                            : "~299 MB · one-time download · stays in your browser"}
                                    </div>
                                )}
                                {phase === "proving" && (
                                    <div className="text-[0.72rem] text-muted mt-0.5">
                                        Running Groth16 in your browser · ~15–60s
                                    </div>
                                )}
                                {isError && (
                                    <div className="text-[0.72rem] text-red mt-0.5 break-words">
                                        {status === "UNSUPPORTED_DOMAIN" ? "Exchange not supported"
                                       : status}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Unsupported domain card */}
                        {isError && status === "UNSUPPORTED_DOMAIN" && dkimMeta && (
                            <div className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 space-y-1.5">
                                <p className="text-[0.78rem] font-medium text-red/80">Exchange not supported</p>
                                <p className="text-[0.75rem] text-muted leading-relaxed">
                                    <span className="text-text font-mono">{dkimMeta.domain}</span> is not a supported exchange.
                                    Signet only accepts emails from crypto exchanges with registered DKIM keys.
                                </p>
                                <a
                                    className="inline-block text-[0.72rem] text-accent underline underline-offset-2"
                                    href={`${GITHUB_REPO}/issues/new?title=${encodeURIComponent(`Add exchange — ${dkimMeta.domain}`)}&body=${encodeURIComponent(`Domain: \`${dkimMeta.domain}\`\nSelector: \`${dkimMeta.selector}\`\n\nPlease add support for this exchange.`)}&labels=new-exchange`}
                                    target="_blank" rel="noreferrer"
                                >
                                    Request support for this exchange ↗
                                </a>
                            </div>
                        )}


                        {/* Progress bar (loading phase) */}
                        {phase === "loading" && (
                            <div className="h-[2px] bg-surface rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-accent transition-[width] duration-300 ease-out"
                                    style={{ width: `${Math.min(100, progress)}%` }}
                                />
                            </div>
                        )}

                        {/* Terminal — snarkjs circuit output */}
                        {phase === "proving" && logLines.length > 0 && (
                            <div className="font-mono text-[0.65rem] bg-bg rounded-lg border border-border
                                            px-3 py-2.5 h-28 overflow-y-auto overscroll-contain leading-relaxed">
                                {logLines.map((line, i) => (
                                    <div key={i} className="text-muted-2">{line}</div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        )}

                        {/* Background-computing notice — after cancel, while fullProve still runs */}
                        {phase === "idle" && bgProving && (
                            <p className="text-[0.72rem] text-muted">
                                Previous computation finishing in the background — drop a new file once it clears.
                            </p>
                        )}
                    </div>
                </StepCard>

                {/* ── Step 4: Record on-chain ─────────────────────────────── */}
                <StepCard
                    num={4}
                    title="Record on-chain"
                    status={step4Status}
                    summary={step4Summary}
                >
                    <div className="space-y-3">
                        {/* Tx status row — hidden once an error is set */}
                        {!txError && (
                            isTxPending ? (
                                <div className="flex items-center gap-3 px-4 py-3 rounded-xl
                                                border border-border bg-surface">
                                    <div className="w-4 h-4 flex-shrink-0 relative">
                                        <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
                                        <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
                                    </div>
                                    <span className="text-[0.78rem] text-muted">Confirming on-chain…</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 px-4 py-3 rounded-xl
                                                border border-border bg-surface">
                                    <div className="w-4 h-4 flex-shrink-0 relative">
                                        <div className="absolute inset-0 border-2 border-border-h rounded-full" />
                                        <div className="absolute inset-0 border-t-2 border-muted-2 rounded-full animate-spin" />
                                    </div>
                                    <span className="text-[0.78rem] text-muted">Waiting for wallet…</span>
                                </div>
                            )
                        )}

                        {/* Tx error */}
                        {txError && (() => {
                            if (txError.startsWith("DKIM_KEY_UNREGISTERED")) {
                                const parts    = txError.split("|");
                                const domain   = parts[1] ?? dkimMeta?.domain   ?? "unknown";
                                const selector = parts[2] ?? dkimMeta?.selector ?? "unknown";
                                const isSupported = SUPPORTED_DOMAINS.has(domain);
                                const issueTitle = isSupported
                                    ? `Register rotated DKIM key — ${selector}._domainkey.${domain}`
                                    : `Add exchange support — ${domain}`;
                                const issueBody = isSupported
                                    ? `The DKIM key for selector \`${selector}._domainkey.${domain}\` is not yet in the on-chain registry.\n\npubkeyHash: \`${pubkeyHashRef.current}\`\n\nPlease register this key.`
                                    : `Requesting support for **${domain}** as a new verifiable exchange.\n\nThis domain is not currently in the Signet registry. Adding it would allow users to prove account ownership via emails from ${domain}.`;
                                const githubUrl = `${GITHUB_REPO}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}&labels=${isSupported ? "dkim-key" : "new-exchange"}`;
                                return (
                                    <div className="space-y-3">
                                        <div className="rounded-xl border border-red/30 bg-red/5 px-4 py-3 space-y-2">
                                            <p className="font-mono text-[0.78rem] font-medium text-red">UnknownDKIMKey</p>
                                            <p className="text-[0.75rem] text-muted leading-relaxed">
                                                {isSupported
                                                    ? "This email was signed with a key not yet in the registry — likely a provider key rotation."
                                                    : `${domain} is not a supported exchange. Only KYC-gated crypto exchanges are eligible.`
                                                }
                                            </p>
                                            <div className="font-mono text-[0.7rem] text-muted-2 space-y-0.5">
                                                <p>domain: <span className="text-text">{domain}</span></p>
                                                {isSupported && <p>selector: <span className="text-text">{selector}</span></p>}
                                            </div>
                                        </div>
                                        <a
                                            href={githubUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5
                                                       text-center text-[0.82rem] font-medium text-accent hover:bg-accent/20 transition-colors"
                                        >
                                            {isSupported ? "Request key registration ↗" : "Request exchange support ↗"}
                                        </a>
                                    </div>
                                );
                            }
                            if (txError === "INSUFFICIENT_GAS") {
                                const addrParam = address ? `?address=${address}` : "";
                                return (
                                    <div className="space-y-3">
                                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 space-y-2">
                                            <p className="text-[0.82rem] font-medium text-amber-400">Base Sepolia ETH needed</p>
                                            <p className="text-[0.75rem] text-muted leading-relaxed">
                                                Your wallet needs a small amount of Base Sepolia testnet ETH to pay transaction fees.
                                            </p>
                                            <a href={`https://portal.cdp.coinbase.com/products/faucet${addrParam}`} target="_blank" rel="noreferrer"
                                               className="text-[0.75rem] text-accent hover:text-accent-2 transition-colors">
                                                Get free testnet ETH ↗
                                            </a>
                                            <p className="text-[0.72rem] text-muted-2">
                                                Or use <strong className="text-text">Coinbase Wallet</strong> — transactions are gas-free.
                                            </p>
                                        </div>
                                        {proofJson && publicSignals.length > 0 && (
                                            <button
                                                onClick={() => submitProof(JSON.parse(proofJson), publicSignals, false)}
                                                className="w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5
                                                           text-[0.82rem] font-medium text-accent hover:bg-accent/20 transition-colors"
                                            >
                                                I have ETH — retry
                                            </button>
                                        )}
                                    </div>
                                );
                            }
                            return (
                                <div className="rounded-xl border border-red/30 bg-red/5 px-4 py-2.5">
                                    <span className="font-mono text-[0.75rem] text-red">{txError}</span>
                                </div>
                            );
                        })()}
                    </div>
                </StepCard>

                {/* ── Step 5: Results ─────────────────────────────────────── */}
                <StepCard
                    num={5}
                    title="Claim ready"
                    status={step5Status}
                    isLast
                >
                    <div className="space-y-3">
                        {/* Single result card */}
                        <div className="rounded-xl border border-green/20 bg-surface overflow-hidden">
                            {/* Header */}
                            <div className="px-5 py-4 border-b border-border">
                                <p className="text-sm font-semibold text-green mb-1">
                                    {ctxCopy.successHeader}
                                </p>
                                {emailTimestamp && (
                                    <p className="text-[0.82rem] text-text">
                                        {dkimMeta?.domain ?? "exchange"}{" "}
                                        <span className="text-muted">· account since {formatDate(emailTimestamp)}</span>
                                    </p>
                                )}
                                {ctxCopy.successSub && !returnUrl && (
                                    <p className="text-[0.72rem] text-muted mt-1">
                                        {ctxCopy.successSub}
                                    </p>
                                )}
                            </div>

                            {/* Data rows */}
                            <div className="divide-y divide-border">
                                {/* Tx hash */}
                                {(txHash || simTxHash) && (
                                    <div className="px-5 py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="result-label mb-0.5">Transaction</p>
                                            <a
                                                href={`https://sepolia.basescan.org/tx/${txHash || simTxHash}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="font-mono text-[0.78rem] text-muted hover:text-accent transition-colors"
                                            >
                                                {(txHash || simTxHash).slice(0, 10)}…{(txHash || simTxHash).slice(-8)} ↗
                                            </a>
                                        </div>
                                        <button
                                            onClick={() => copy(txHash || simTxHash, "txhash")}
                                            className={`flex-shrink-0 transition-colors
                                                ${copied === "txhash" ? "text-green" : "text-muted-2 hover:text-accent"}`}
                                            title="Copy tx hash"
                                        >
                                            {copied === "txhash" ? <span className="text-[0.68rem]">✓</span> : <CopyIcon />}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Stats for nerds accordion */}
                            <details className="group border-t border-border">
                                <summary className="flex items-center gap-2 px-5 py-3 cursor-pointer
                                                    text-[0.72rem] text-muted-2 hover:text-muted transition-colors
                                                    list-none [&::-webkit-details-marker]:hidden">
                                    <span className="text-[0.55rem] group-open:rotate-90 transition-transform inline-block">▶</span>
                                    Stats for nerds
                                </summary>
                                <div className="px-5 pb-4 space-y-3 border-t border-border">
                                    {dkimMeta && (
                                        <div className="pt-3">
                                            <p className="result-label mb-1">DKIM key</p>
                                            <p className="font-mono text-[0.72rem] text-muted">
                                                {dkimMeta.domain}{" · "}<span className="text-muted-2">{dkimMeta.selector}</span>
                                            </p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="result-label mb-1">pubkeyHash</p>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-mono text-[0.72rem] text-muted truncate">{pubkeyHash}</p>
                                            <button
                                                onClick={() => copy(pubkeyHash, "pubkey")}
                                                className={`flex-shrink-0 transition-colors
                                                    ${copied === "pubkey" ? "text-green" : "text-muted-2 hover:text-accent"}`}
                                            >
                                                {copied === "pubkey" ? <span className="text-[0.68rem]">✓</span> : <CopyIcon />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="result-label mb-1">Contract</p>
                                        <div className="flex items-center gap-1.5">
                                            <a
                                                href={`https://sepolia.basescan.org/address/${ATTESTATION_CACHE_ADDRESS}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="font-mono text-[0.72rem] text-muted hover:text-accent transition-colors"
                                            >
                                                AttestationCache {contractShort} ↗
                                            </a>
                                            <button
                                                onClick={() => copy(ATTESTATION_CACHE_ADDRESS, "contract")}
                                                className={`transition-colors
                                                    ${copied === "contract" ? "text-green" : "text-muted-2 hover:text-accent"}`}
                                            >
                                                {copied === "contract" ? <span className="text-[0.68rem]">✓</span> : <CopyIcon />}
                                            </button>
                                        </div>
                                    </div>
                                    {elapsed && (
                                        <div>
                                            <p className="result-label mb-1">Proof time</p>
                                            <p className="font-mono text-[0.72rem] text-muted">{elapsed}s · Groth16</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="result-label mb-1.5">Raw proof (pi_a / pi_b / pi_c)</p>
                                        <pre className="proof-pre rounded-lg border border-border">{proofJson}</pre>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>
                </StepCard>
            </div>

            {/* ── Footer actions ────────────────────────────────────────────── */}
            <div className="mt-8 flex items-center justify-between text-[0.72rem]">
                {/* Left: Cancel while proving, Disconnect/reset otherwise */}
                {(phase === "loading" || phase === "proving") ? (
                    <button
                        onClick={handleCancel}
                        className="text-muted-2 hover:text-text transition-colors"
                    >
                        Cancel
                    </button>
                ) : isConnected && !isRunning && !isTxPending ? (
                    <button
                        onClick={isConfirmed || isDone ? handleReset : handleDisconnect}
                        className="text-muted-2 hover:text-text transition-colors"
                    >
                        {isConfirmed ? "Start over" : isDone ? "Try another email" : "Disconnect"}
                    </button>
                ) : (
                    <span />
                )}

                {/* Right: Try again on error */}
                {isError && (
                    <button
                        onClick={handleReset}
                        className="text-accent hover:text-accent-2 font-medium transition-colors"
                    >
                        Try again
                    </button>
                )}
            </div>
        </div>
    );
}
