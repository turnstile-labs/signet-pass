"use client";

// Adapted from apps/rug-registry/src/components/ProveStep.tsx.
// Differences: generic (no specific exchange), accepts optional allowedDomains filter.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { waitForCallsStatus } from "viem/experimental";
import { baseSepolia } from "wagmi/chains";
import { toHex } from "viem";
import {
    ATTESTATION_CACHE_ADDRESS,
    ATTESTATION_CACHE_ABI,
    getPublicClient,
} from "@/lib/wagmi";

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";

// ZK artifacts are hosted on the Signet protocol app (apps/protocol).
const ARTIFACT_BASE    = process.env.NEXT_PUBLIC_ARTIFACT_BASE_URL ?? "http://localhost:3000/artifacts";
const ARTIFACT_VERSION = "4";
const WASM_URL = `${ARTIFACT_BASE}/signet_email.wasm?v=${ARTIFACT_VERSION}`;
const ZKEY_URL = `${ARTIFACT_BASE}/signet_email.zkey?v=${ARTIFACT_VERSION}`;

const _alchemyKey   = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const PAYMASTER_URL = _alchemyKey ? `https://base-sepolia.g.alchemy.com/v2/${_alchemyKey}` : "";
const GITHUB_REPO   = "https://github.com/turnstile-labs/signet";

const MAX_HEADERS_SUFFIX = 640;

// All domains Signet can verify.
const SUPPORTED_DOMAINS = new Set([
    "coinbase.com", "info.coinbase.com",
    "binance.com", "mailersp2.binance.com", "ses.binance.com", "mailer3.binance.com", "post.binance.com",
    "kraken.com", "okx.com", "mailer2.okx.com", "notice3.okx.com", "bybit.com",
    "gemini.com", "robinhood.com", "crypto.com", "kucoin.com",
    "mtgox.com", "quadrigacx.com", "terra.money", "anchorprotocol.com",
    "celsius.network", "investvoyager.com", "vauld.com", "hodlnaut.com",
    "blockfi.com", "ftx.com", "ftx.us", "wazirx.com", "dmm.com",
]);

const REGISTERED_OFFLINE_KEYS = new Set([
    "google._domainkey.mtgox.com", "google._domainkey.quadrigacx.com",
    "default._domainkey.quadrigacx.com", "kuc._domainkey.kucoin.com",
    "s2._domainkey.kucoin.com", "mkt._domainkey.kucoin.com",
    "s1._domainkey.ftx.com", "s2._domainkey.ftx.com", "k3._domainkey.wazirx.com",
]);

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase = "idle" | "dkim_check" | "dkim_missing" | "verifying" | "loading" | "proving" | "attesting" | "done" | "error";

interface DkimCheckResult { selector: string; domain: string; dnsOk: boolean; rawSig: string; }

interface Props {
    /** If set, only emails from these domains (or subdomains) are accepted. */
    allowedDomains: string[];
    /** If set, emails with DKIM t= timestamp >= cutoff are rejected before ZK runs. */
    cutoff?: bigint;
    onAttested: () => void;
    onBack:     () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchBytes(url: string, onProgress?: (pct: number, rcv: number, tot: number) => void): Promise<Uint8Array> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load ${url} (${resp.status})`);
    const total = parseInt(resp.headers.get("content-length") ?? "0");
    const reader = resp.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length;
        if (total && onProgress) onProgress((received / total) * 100, received, total);
    }
    const out = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPartialHeaderInputs(dkimResult: any, sha256Pad: any, generatePartialSHA: any, Uint8ArrayToCharArray: any, toCircomBigIntBytes: any, proverETHAddress: string) {
    const headers   = dkimResult.headers as Uint8Array;
    const publicKey = dkimResult.publicKey as bigint;
    const signature = dkimResult.signature as bigint;
    const minPaddedLen = Math.ceil((headers.length + 9) / 64) * 64;
    const [paddedHeader, headerLen] = sha256Pad(headers, minPaddedLen);
    const { precomputedSha, bodyRemaining: suffix, bodyRemainingLength: suffixLen } =
        generatePartialSHA({ body: paddedHeader, bodyLength: headerLen, selectorString: "dkim-signature:", maxRemainingBodyLength: MAX_HEADERS_SUFFIX });
    const timestampIndex = findTimestampIndex(Array.from(suffix).map(String));
    return {
        emailHeader: Uint8ArrayToCharArray(suffix), emailHeaderLength: String(suffixLen),
        precomputedSHA: Uint8ArrayToCharArray(precomputedSha),
        pubkey: toCircomBigIntBytes(publicKey), signature: toCircomBigIntBytes(signature),
        timestampIndex: String(timestampIndex), proverETHAddress,
    };
}

function findTimestampIndex(headerInts: string[]): number {
    const buf = new Uint8Array(headerInts.map(Number));
    for (const pat of [[59, 32, 116, 61], [59, 116, 61]]) {
        for (let i = 0; i < buf.length - pat.length; i++) {
            if (pat.every((b, j) => buf[i + j] === b)) {
                const digitStart = i + pat.length;
                if (buf[digitStart] >= 48 && buf[digitStart] <= 57) return digitStart;
            }
        }
    }
    throw new Error("Could not find DKIM timestamp (t=) in email header.");
}

function extractDkimMeta(raw: string): { domain: string; selector: string; rawSig: string } | null {
    const unfolded = raw.replace(/\r?\n([ \t])/g, " ");
    const allLines = unfolded.split(/\r?\n/).filter(l => /^DKIM-Signature:/i.test(l));
    if (allLines.length === 0) return null;
    const preferred = allLines.find(line => {
        const d = line.match(/\bd=([^\s;,]+)/i)?.[1]?.toLowerCase();
        return d && SUPPORTED_DOMAINS.has(d);
    }) ?? allLines[0];
    const d = preferred.match(/\bd=([^\s;,]+)/i)?.[1];
    const s = preferred.match(/\bs=([^\s;,]+)/i)?.[1];
    if (!d || !s) return null;
    return { domain: d.toLowerCase(), selector: s.toLowerCase(), rawSig: preferred.trim() };
}

async function checkDkimDns(selector: string, domain: string): Promise<boolean> {
    const name = `${selector}._domainkey.${domain}`;
    for (const url of [
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    ]) {
        try {
            const res = await fetch(url, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(4000) });
            if (!res.ok) continue;
            const json = await res.json() as { Status: number; Answer?: { type: number }[] };
            if (json.Status === 0 && json.Answer?.some(a => a.type === 16)) return true;
        } catch { /* try next */ }
    }
    return false;
}

function extractRevert(raw: string): string {
    if (raw.includes("WalletAlreadyAttested"))  return "WalletAlreadyAttested";
    if (raw.includes("WalletMismatch"))         return `WalletMismatch — proof was generated for a different address.`;
    if (raw.includes("InvalidProof"))           return "InvalidProof — hard-refresh and re-prove.";
    if (raw.includes("UnknownDKIMKey"))         return "DKIM_KEY_UNREGISTERED";
    if (raw.includes("User rejected") || raw.includes("user rejected")) return "Transaction rejected.";
    if (raw.toLowerCase().includes("insufficient funds")) return "INSUFFICIENT_GAS";
    const revertStr = raw.match(/reverted with reason string '([^']+)'/)?.[1];
    if (revertStr) return revertStr;
    return raw.split("\n").find(l => l.trim() && !l.startsWith("    at ") && !l.includes("Error: ")) ?? raw.split("\n")[0];
}

function CopyableCode({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="relative group">
            <pre className="font-mono text-[0.62rem] text-muted-2 bg-bg border border-border rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{text}</pre>
            <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="absolute top-2 right-2 font-mono text-[0.58rem] text-muted-2 hover:text-accent transition-colors px-1.5 py-0.5 rounded bg-surface border border-border cursor-pointer">
                {copied ? "copied ✓" : "copy"}
            </button>
        </div>
    );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProveStep({ allowedDomains, cutoff, onAttested, onBack }: Props) {
    const { address }            = useAccount();
    const { data: walletClient } = useWalletClient({ chainId: baseSepolia.id });
    const { switchChainAsync }   = useSwitchChain();
    const { data: capabilities }  = useCapabilities();
    const { writeContractsAsync } = useWriteContracts();

    const [phase,         setPhase]         = useState<Phase>("idle");
    const [status,        setStatus]        = useState("");
    const [progress,      setProgress]      = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [txError,       setTxError]       = useState("");
    const [dkimCheck,     setDkimCheck]     = useState<DkimCheckResult | null>(null);
    const [dragOver,      setDragOver]      = useState(false);

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
    const wasmRef                  = useRef<Uint8Array | null>(null);
    const zkeyRef                  = useRef<Uint8Array | null>(null);
    const walletRef                = useRef(address ?? "");
    const rawEmailRef              = useRef<string>("");
    const runIdRef                 = useRef(0);
    const pendingProofRef          = useRef<{ proof: object; sigs: string[] } | null>(null);

    walletRef.current = address ?? "";

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [snarkjsMod, helpersMod, dkimMod]: any[] = await Promise.all([
                    import("snarkjs"),
                    import("@zk-email/helpers"),
                    import("@zk-email/helpers/dist/dkim" as never),
                ]);
                if (cancelled) return;
                groth16Ref.current               = snarkjsMod.groth16;
                verifyDKIMRef.current            = dkimMod.verifyDKIMSignature;
                sha256PadRef.current             = helpersMod.sha256Pad;
                generatePartialSHARef.current    = helpersMod.generatePartialSHA;
                Uint8ArrayToCharArrayRef.current = helpersMod.Uint8ArrayToCharArray;
                toCircomBigIntBytesRef.current   = helpersMod.toCircomBigIntBytes;
                libsReady.current                = true;
            } catch (e) { console.error("Failed to load proving libraries:", e); }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!wasmRef.current) { const b = await fetchBytes(WASM_URL); if (!cancelled) wasmRef.current = b; }
                if (!zkeyRef.current) { const b = await fetchBytes(ZKEY_URL); if (!cancelled) zkeyRef.current = b; }
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Submit attestation ─────────────────────────────────────────────────────

    async function submitAttestation(proof: object, sigs: string[]) {
        try {
            if (!walletClient) throw new Error("Wallet not connected");
            const proofAddrBig  = BigInt(sigs[2]);
            const connectedAddr = address ?? "";
            if (proofAddrBig !== BigInt(connectedAddr)) {
                const proofHex = toHex(proofAddrBig, { size: 20 });
                throw new Error(`WalletMismatch — proof for ${proofHex} but wallet is ${connectedAddr}`);
            }
            await switchChainAsync({ chainId: baseSepolia.id });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = proof as any;
            const args = [
                [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])],
                [[BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])], [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])]],
                [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])],
                [BigInt(sigs[0]), BigInt(sigs[1]), BigInt(sigs[2])],
            ] as const;
            try {
                await getPublicClient().simulateContract({
                    address: ATTESTATION_CACHE_ADDRESS, abi: ATTESTATION_CACHE_ABI,
                    functionName: "attest", args, account: connectedAddr as `0x${string}`,
                });
            } catch (simErr) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cause = (simErr as any)?.cause;
                const errorName = cause?.data?.errorName ?? cause?.reason ?? "";
                const simMsg = simErr instanceof Error ? simErr.message : String(simErr);
                throw new Error(errorName ? `${errorName} — ${simMsg}` : simMsg);
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chainCaps    = (capabilities as any)?.[baseSepolia.id];
            const usePaymaster = !!(chainCaps?.paymasterService?.supported && PAYMASTER_URL);
            let hash: `0x${string}`;
            if (usePaymaster) {
                const callsResult = await writeContractsAsync({
                    contracts: [{ address: ATTESTATION_CACHE_ADDRESS, abi: ATTESTATION_CACHE_ABI, functionName: "attest", args }],
                    capabilities: { paymasterService: { url: PAYMASTER_URL } },
                });
                const callsId = typeof callsResult === "string" ? callsResult : callsResult.id;
                const result = await waitForCallsStatus(walletClient, { id: callsId, timeout: 120_000, pollingInterval: 2_000, throwOnFailure: true });
                hash = result?.receipts?.[0]?.transactionHash as `0x${string}`;
                if (!hash) throw new Error("No receipt hash.");
            } else {
                const balance = await getPublicClient().getBalance({ address: connectedAddr as `0x${string}` });
                if (balance < 10_000_000_000_000n) throw new Error("INSUFFICIENT_GAS");
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                hash = await (walletClient.writeContract as any)({
                    address: ATTESTATION_CACHE_ADDRESS, abi: ATTESTATION_CACHE_ABI,
                    functionName: "attest", args, account: connectedAddr as `0x${string}`,
                });
            }
            await getPublicClient().waitForTransactionReceipt({ hash });
            setPhase("done");
            setTimeout(() => onAttested(), 1200);
        } catch (e: unknown) {
            const raw    = e instanceof Error ? e.message : String(e);
            const reason = extractRevert(raw);
            if (reason === "WalletAlreadyAttested") {
                setPhase("done");
                setTimeout(() => onAttested(), 800);
            } else if (reason === "DKIM_KEY_UNREGISTERED") {
                const check = dkimCheck;
                setTxError(`UNREGISTERED|${check?.selector ?? "?"}|${check?.domain ?? "?"}|${check?.rawSig ?? ""}`);
                setPhase("error");
            } else {
                setTxError(reason);
                setPhase("error");
            }
        }
    }

    // ── Proof pipeline ─────────────────────────────────────────────────────────

    const runProof = useCallback(async (raw: string) => {
        if (!libsReady.current) { setStatus("Initialising…"); return; }
        const myRunId = ++runIdRef.current;
        const isCancelled = () => runIdRef.current !== myRunId;
        setPhase("verifying"); setStatus("Verifying DKIM signature…"); setTxError("");
        try {
            const dkimResult = await verifyDKIMRef.current(Buffer.from(raw), "", true, false, true);
            if (isCancelled()) return;
            const inputs = buildPartialHeaderInputs(
                dkimResult, sha256PadRef.current, generatePartialSHARef.current,
                Uint8ArrayToCharArrayRef.current, toCircomBigIntBytesRef.current,
                walletRef.current || "0",
            );
            if (isCancelled()) return;
            setPhase("loading"); setStatus("Loading ZK artifacts…");
            if (!wasmRef.current) { wasmRef.current = await fetchBytes(WASM_URL); }
            if (isCancelled()) return;
            if (!zkeyRef.current) {
                zkeyRef.current = await fetchBytes(ZKEY_URL, (pct, rcv, tot) => {
                    setProgress(pct);
                    setProgressLabel(`${(rcv / 1e6).toFixed(0)} / ${(tot / 1e6).toFixed(0)} MB`);
                });
            } else {
                setProgress(100); setProgressLabel("cached");
            }
            if (isCancelled()) return;
            setPhase("proving"); setStatus("Verifying account age…");
            const { proof, publicSignals } = await groth16Ref.current.fullProve(inputs, wasmRef.current, zkeyRef.current);
            if (isCancelled()) return;
            pendingProofRef.current = { proof, sigs: publicSignals as string[] };
            setPhase("attesting"); setStatus("Submitting proof on-chain…"); setTxError("");
            await submitAttestation(proof, publicSignals as string[]);
        } catch (err) {
            if (isCancelled()) return;
            console.error(err);
            setPhase("error"); setStatus("");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletClient]);

    const runDkimCheck = useCallback(async (raw: string) => {
        const meta = extractDkimMeta(raw);
        if (!meta) { runProof(raw); return; }
        if (!SUPPORTED_DOMAINS.has(meta.domain)) {
            setPhase("error"); setTxError("UNSUPPORTED_DOMAIN"); setDkimCheck({ ...meta, dnsOk: false }); return;
        }
        // Exchange filter: if allowedDomains provided, ensure email matches one of them
        if (allowedDomains.length > 0) {
            const matches = allowedDomains.some(d => meta.domain === d || meta.domain.endsWith(`.${d}`));
            if (!matches) {
                setPhase("error");
                setTxError(`WRONG_EXCHANGE|${meta.domain}|${allowedDomains.join(",")}`);
                setDkimCheck({ ...meta, dnsOk: false });
                return;
            }
        }

        // Fast-path: check DKIM t= timestamp against pass cutoff before running ZK (~60s)
        if (cutoff !== undefined) {
            const tsMatch = meta.rawSig.match(/\bt=(\d+)/i);
            if (tsMatch) {
                const emailTs = BigInt(tsMatch[1]);
                if (emailTs >= cutoff) {
                    setPhase("error");
                    setTxError(`EMAIL_TOO_RECENT|${tsMatch[1]}|${cutoff.toString()}`);
                    setDkimCheck({ ...meta, dnsOk: false });
                    return;
                }
            }
        }

        setPhase("dkim_check"); setDkimCheck(null);
        const dnsKey = `${meta.selector}._domainkey.${meta.domain}`;
        const dnsOk  = REGISTERED_OFFLINE_KEYS.has(dnsKey) || await checkDkimDns(meta.selector, meta.domain);
        const result: DkimCheckResult = { ...meta, dnsOk };
        setDkimCheck(result);
        if (!dnsOk) setPhase("dkim_missing");
        else runProof(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedDomains]);

    const handleFile = useCallback(async (file: File) => {
        const raw = (await file.text())
            .replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
            .replace(/^([a-z][a-z0-9-]*):/gim, (_, n: string) => n.replace(/(?:^|-)\w/g, (c: string) => c.toUpperCase()) + ":");
        rawEmailRef.current = raw;
        runDkimCheck(raw);
    }, [runDkimCheck]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file?.name.endsWith(".eml")) handleFile(file);
    }, [handleFile]);

    const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = "";
    }, [handleFile]);

    function handleCancel() {
        runIdRef.current++;
        setPhase("idle"); setStatus(""); setTxError(""); setProgress(0); setProgressLabel("");
    }

    const isRunning = ["verifying", "loading", "proving", "attesting"].includes(phase);
    const domainLabel = allowedDomains.length === 0
        ? "any supported exchange"
        : allowedDomains.length === 1
            ? allowedDomains[0]
            : `${allowedDomains.slice(0, 2).join(", ")}${allowedDomains.length > 2 ? " or others" : ""}`;

    function runningLabel(p: string): string {
        if (p === "loading")   return "Downloading verification files…";
        if (p === "attesting") return "Claiming your pass…";
        return "Verifying your email…";
    }

    const cutoffFormatted = cutoff
        ? new Date(Number(cutoff) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "";

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">

            {/* Dev bypass */}
            {phase === "idle" && DEV_BYPASS && (
                <button onClick={() => { setPhase("done"); setTimeout(() => onAttested(), 600); }}
                    className="w-full rounded-xl border border-dashed border-amber/40 bg-amber/5 px-4 py-2.5 text-[0.8rem] font-mono text-amber hover:bg-amber/10 transition-colors cursor-pointer">
                    ⚡ Dev bypass
                </button>
            )}

            {/* Drop zone */}
            {phase === "idle" && (
                <div className="space-y-3">
                    {/* Instructions */}
                    <div className="rounded-xl border border-border bg-bg divide-y divide-border overflow-hidden">
                        <div className="px-4 py-3">
                            <p className="text-[0.78rem] font-medium text-text mb-0.5">Find an old email from {domainLabel}</p>
                            <p className="text-[0.72rem] text-muted leading-relaxed">
                                Welcome email, deposit confirmation, or trade receipt — anything old works.
                                Save it as <code className="font-mono text-text">.eml</code> and drop it below.
                                Your email never leaves your browser.
                            </p>
                        </div>
                        {[
                            { client: "Gmail",      steps: ["Open email", "⋮ menu", "Download message (.eml)"] },
                            { client: "Outlook",    steps: ["Open email", "File", "Save as → .eml"]            },
                            { client: "Apple Mail", steps: ["Open email", "Drag to desktop"]                   },
                        ].map(({ client, steps }) => (
                            <div key={client} className="flex items-center gap-3 px-4 py-2">
                                <span className="text-[0.7rem] font-medium text-text w-[4.5rem] flex-shrink-0">{client}</span>
                                <div className="flex items-center gap-1 flex-wrap">
                                    {steps.map((s, i) => (
                                        <span key={i} className="flex items-center gap-1">
                                            {i > 0 && <span className="text-muted-2 text-[0.6rem]">›</span>}
                                            <span className="text-[0.7rem] text-muted">{s}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Drop target */}
                    <div
                        className={`relative border-[1.5px] border-dashed rounded-2xl py-10 transition-colors cursor-pointer
                            ${dragOver ? "border-accent bg-accent/[0.06]" : "border-border hover:border-accent/60 hover:bg-accent/[0.025]"}`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                    >
                        <input type="file" accept=".eml" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={onInput} />
                        <div className="text-center pointer-events-none">
                            <div className="text-3xl mb-3">📩</div>
                            <div className="text-[0.95rem] font-medium text-text mb-1">
                                Drop <code className="font-mono text-accent">.eml</code> here
                            </div>
                            <div className="text-[0.75rem] text-muted">
                                or <span className="text-accent underline underline-offset-2">browse to select</span>
                            </div>
                        </div>
                    </div>

                    <button onClick={onBack}
                        className="block text-[0.72rem] text-muted-2 hover:text-muted transition-colors cursor-pointer">
                        ← Back
                    </button>
                </div>
            )}

            {/* Email check */}
            {phase === "dkim_check" && (
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-bg">
                    <div className="w-4 h-4 flex-shrink-0 relative">
                        <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
                        <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
                    </div>
                    <div>
                        <p className="text-[0.82rem] text-text font-medium">Checking your email…</p>
                        <p className="text-[0.7rem] text-muted mt-0.5">One moment</p>
                    </div>
                </div>
            )}

            {/* Email key not yet supported — simplified for users */}
            {phase === "dkim_missing" && dkimCheck && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-amber/25 bg-amber/5 px-5 py-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <span className="text-amber flex-shrink-0 mt-0.5">⚠</span>
                            <div>
                                <p className="text-[0.85rem] font-semibold text-text">This email can&apos;t be verified yet</p>
                                <p className="text-[0.78rem] text-muted mt-1 leading-relaxed">
                                    The signing key for <span className="font-medium text-text">{dkimCheck.domain}</span> isn&apos;t
                                    registered yet. Try a different email or a different exchange.
                                </p>
                            </div>
                        </div>
                        <div className="border-t border-amber/15 pt-3">
                            <button onClick={() => runProof(rawEmailRef.current)}
                                className="text-[0.72rem] text-muted hover:text-text transition-colors cursor-pointer">
                                Try anyway →
                            </button>
                        </div>
                    </div>
                    <button onClick={() => { setPhase("idle"); setDkimCheck(null); }}
                        className="text-[0.72rem] text-muted-2 hover:text-muted transition-colors cursor-pointer">
                        ← Try a different email
                    </button>
                </div>
            )}

            {/* Running state — single clean status card */}
            {isRunning && (
                <div className="space-y-2">
                    <div className="flex items-center gap-3 px-4 py-4 rounded-xl border border-border bg-bg">
                        <div className="w-4 h-4 flex-shrink-0 relative">
                            <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
                            <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[0.85rem] text-text font-medium leading-snug">
                                {runningLabel(phase)}
                            </p>
                            {phase === "loading" && progressLabel && progressLabel !== "cached" && (
                                <p className="text-[0.7rem] text-muted mt-0.5">{progressLabel} · one-time download</p>
                            )}
                            {phase === "proving" && (
                                <p className="text-[0.7rem] text-muted mt-0.5">About 60 seconds · runs in your browser</p>
                            )}
                        </div>
                        <button onClick={handleCancel}
                            className="text-[0.7rem] text-muted-2 hover:text-muted transition-colors cursor-pointer flex-shrink-0">
                            Cancel
                        </button>
                    </div>
                    {phase === "loading" && (
                        <div className="h-[2px] bg-surface rounded-full overflow-hidden">
                            <div className="h-full bg-accent transition-[width] duration-300 ease-out"
                                style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                    )}
                </div>
            )}

            {/* Generic error (not a named error type) */}
            {phase === "error" && !txError.startsWith("UNREGISTERED") && !txError.startsWith("WRONG_EXCHANGE") && txError !== "INSUFFICIENT_GAS" && txError !== "UNSUPPORTED_DOMAIN" && !txError.startsWith("EMAIL_TOO_RECENT") && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-red/25 bg-red/5 px-5 py-4">
                        <p className="text-[0.82rem] font-semibold text-red mb-1.5">Something went wrong.</p>
                        <p className="font-mono text-[0.72rem] text-muted leading-relaxed break-words">
                            {status || "An unexpected error occurred."}
                        </p>
                    </div>
                    <button onClick={() => { setPhase("idle"); setTxError(""); }}
                        className="w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-[0.82rem] font-medium text-accent hover:bg-accent/20 transition-colors cursor-pointer">
                        Try again
                    </button>
                </div>
            )}

            {/* Error: unsupported domain */}
            {phase === "error" && txError === "UNSUPPORTED_DOMAIN" && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-border bg-bg px-5 py-4 space-y-2">
                        <p className="text-[0.85rem] font-semibold text-text">Exchange not supported</p>
                        <p className="text-[0.78rem] text-muted leading-relaxed">
                            This email isn&apos;t from a supported exchange.
                            Use an email from Coinbase, Binance, Kraken, OKX, or another supported exchange.
                        </p>
                    </div>
                    <button onClick={() => { setPhase("idle"); setTxError(""); setDkimCheck(null); }}
                        className="text-[0.72rem] text-muted-2 hover:text-muted transition-colors cursor-pointer">
                        ← Try a different email
                    </button>
                </div>
            )}

            {/* Error: wrong exchange */}
            {phase === "error" && txError.startsWith("WRONG_EXCHANGE|") && (() => {
                const [,, wantRaw] = txError.split("|");
                const wantList = wantRaw.split(",").slice(0, 3).join(", ");
                return (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-amber/25 bg-amber/5 px-5 py-4 space-y-2">
                            <p className="text-[0.85rem] font-semibold text-text">Exchange not accepted</p>
                            <p className="text-[0.78rem] text-muted leading-relaxed">
                                This pass only accepts accounts from{" "}
                                <span className="font-medium text-text">{wantList}</span>.
                                Use an old email from one of those exchanges.
                            </p>
                        </div>
                        <button onClick={() => { setPhase("idle"); setTxError(""); setDkimCheck(null); }}
                            className="text-[0.72rem] text-muted-2 hover:text-muted transition-colors cursor-pointer">
                            ← Try a different email
                        </button>
                    </div>
                );
            })()}

            {/* Error: email too recent — caught before ZK runs */}
            {phase === "error" && txError.startsWith("EMAIL_TOO_RECENT|") && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-amber/25 bg-amber/5 px-5 py-4 space-y-2">
                        <p className="text-[0.85rem] font-semibold text-text">This email is too recent</p>
                        <p className="text-[0.78rem] text-muted leading-relaxed">
                            This pass requires an account opened before{" "}
                            <span className="font-medium text-text">{cutoffFormatted}</span>.
                            Use an older email from a different account or exchange.
                        </p>
                    </div>
                    <button onClick={() => { setPhase("idle"); setTxError(""); setDkimCheck(null); }}
                        className="text-[0.72rem] text-muted-2 hover:text-muted transition-colors cursor-pointer">
                        ← Try a different email
                    </button>
                </div>
            )}

            {/* Error: insufficient gas */}
            {phase === "error" && txError === "INSUFFICIENT_GAS" && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-amber/25 bg-amber/5 px-5 py-4 space-y-2">
                        <p className="text-[0.85rem] font-semibold text-amber-400">Need Base Sepolia ETH</p>
                        <p className="text-[0.75rem] text-muted leading-relaxed">
                            Your wallet needs a small amount of testnet ETH to pay gas.
                        </p>
                        <a href={`https://portal.cdp.coinbase.com/products/faucet${address ? `?address=${address}` : ""}`}
                           target="_blank" rel="noreferrer"
                           className="block text-[0.75rem] text-accent hover:underline">
                            Get free testnet ETH ↗
                        </a>
                        <p className="text-[0.7rem] text-muted-2">Or use Coinbase Wallet — transactions are gas-free.</p>
                    </div>
                    {pendingProofRef.current && (
                        <button
                            onClick={() => {
                                const p = pendingProofRef.current!;
                                setTxError(""); setPhase("attesting"); setStatus("Submitting…");
                                submitAttestation(p.proof, p.sigs);
                            }}
                            className="w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-[0.82rem] font-medium text-accent hover:bg-accent/20 transition-colors cursor-pointer">
                            I have ETH — retry
                        </button>
                    )}
                </div>
            )}

            {/* Error: DKIM key not registered on-chain */}
            {phase === "error" && txError.startsWith("UNREGISTERED") && (() => {
                const [, selector, domain, rawSig] = txError.split("|");
                return (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-red/25 bg-red/5 px-5 py-4 space-y-3">
                            <p className="text-[0.85rem] font-semibold text-red">Key not in registry</p>
                            <p className="text-[0.75rem] text-muted leading-relaxed">
                                Your proof was valid, but{" "}
                                <code className="font-mono text-[0.68rem] text-muted-2">
                                    {selector}._domainkey.{domain}
                                </code>{" "}
                                isn&apos;t registered on-chain yet.
                            </p>
                            {rawSig && (
                                <div className="border-t border-red/15 pt-2.5 space-y-2">
                                    <p className="text-[0.7rem] font-medium text-red">Share this header to get it registered:</p>
                                    <CopyableCode text={rawSig} />
                                </div>
                            )}
                        </div>
                        <a href={`${GITHUB_REPO}/issues/new?title=${encodeURIComponent(`Register DKIM key — ${selector}._domainkey.${domain}`)}&labels=dkim-key`}
                           target="_blank" rel="noopener noreferrer"
                           className="block w-full rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-center text-[0.82rem] font-medium text-accent hover:bg-accent/20 transition-colors">
                            Open GitHub issue ↗
                        </a>
                    </div>
                );
            })()}

            {/* Done */}
            {phase === "done" && (
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-green/25 bg-green/5">
                    <span className="text-green text-sm">✓</span>
                    <div>
                        <p className="text-[0.82rem] font-semibold text-green">All set</p>
                        <p className="text-[0.7rem] text-muted mt-0.5">Verifying your pass…</p>
                    </div>
                </div>
            )}
        </div>
    );
}
