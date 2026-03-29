#!/usr/bin/env tsx
/**
 * monitor-dkim.ts
 *
 * Automated DKIM key rotation monitor for the Signet protocol.
 *
 * Runs daily (via GitHub Actions cron) and:
 *   1. Resolves current DNS TXT records for all known exchange selectors
 *   2. Computes the Poseidon pubkeyHash the same way the ZK circuit does
 *   3. Checks whether each hash is already registered on-chain
 *   4. Registers any new / rotated keys in a single setKeys() transaction
 *   5. Probes predictive selectors (s3, scph0326, …) to catch rotations early
 *   6. Updates dkim-manifest.json with current status of every known key
 *   7. Creates GitHub issues for new keys or DNS failures
 *   8. Auto-closes resolved issues — but only when DNS is live again or a key
 *      was just registered. Permanently-dead selectors (archive, hardcoded)
 *      are never auto-closed; they require manual resolution with a real email.
 *
 * Usage:
 *   pnpm monitor-dkim              # live run
 *   pnpm monitor-dkim --dry-run    # preview, no writes
 *   pnpm monitor-dkim --network base  # mainnet
 *
 * Required env vars (live run):
 *   PRIVATE_KEY             hex private key of the DKIMRegistry owner
 *   GITHUB_TOKEN            GitHub token for creating issues (auto-set in Actions)
 *   GITHUB_REPOSITORY       owner/repo string (auto-set in Actions, e.g. "turnstile-labs/signet")
 *   RPC_URL                 custom RPC (optional — falls back to public Base nodes)
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicKey } from "node:crypto";
import { buildPoseidon } from "circomlibjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
    EXCHANGE_SELECTORS,
    ARCHIVE_SOURCE_KEYS,
    HARDCODED_KEYS,
    PREDICTIVE_PATTERNS,
    type SelectorEntry,
} from "./dkim-data.js";

// ── ZK circuit constants ───────────────────────────────────────────────────────

const CIRCOM_N = 121;
const CIRCOM_K = 17;

// ── Protocol constants ────────────────────────────────────────────────────────

const DKIM_REGISTRY: Record<"base_sepolia" | "base", `0x${string}`> = {
    base_sepolia: "0xd984F26057A990a4f4de5A36faF7968b818BAe46",
    base:         "0x0000000000000000000000000000000000000000",
};

const DKIM_REGISTRY_ABI = parseAbi([
    "function isValid(uint256 pubkeyHash) view returns (bool)",
    "function setKey(uint256 pubkeyHash, bool valid) nonpayable",
    "function setKeys(uint256[] hashes, bool valid) nonpayable",
]);

const MANIFEST_PATH = resolve(process.cwd(), "dkim-manifest.json");

// ── Poseidon helpers ──────────────────────────────────────────────────────────

let _poseidon: Awaited<ReturnType<typeof buildPoseidon>> | null = null;

async function getPoseidon() {
    if (!_poseidon) _poseidon = await buildPoseidon();
    return _poseidon;
}

async function poseidonLargeCircuit(chunks: bigint[], n: number): Promise<bigint> {
    const poseidon  = await getPoseidon();
    const k         = chunks.length;
    const halfSize  = Math.floor(k / 2) + (k % 2);
    const twoToN    = 1n << BigInt(n);
    const merged: bigint[] = [];
    for (let i = 0; i < halfSize; i++) {
        if (i === halfSize - 1 && k % 2 === 1) {
            merged.push(chunks[k - 1]);
        } else {
            merged.push(chunks[2 * i] + twoToN * chunks[2 * i + 1]);
        }
    }
    const hash = poseidon(merged);
    return poseidon.F.toObject(hash) as bigint;
}

function bigIntToChunks(value: bigint, n: number, k: number): bigint[] {
    const mask   = (1n << BigInt(n)) - 1n;
    const chunks: bigint[] = [];
    for (let i = 0; i < k; i++) {
        chunks.push((value >> BigInt(i * n)) & mask);
    }
    return chunks;
}

async function computePubkeyHash(modulus: bigint): Promise<bigint> {
    const chunks = bigIntToChunks(modulus, CIRCOM_N, CIRCOM_K);
    return poseidonLargeCircuit(chunks, CIRCOM_N);
}

// ── DNS-over-HTTPS ─────────────────────────────────────────────────────────────

async function fetchDkimTxt(selector: string, domain: string): Promise<string | null> {
    const name = `${selector}._domainkey.${domain}`;
    const resolvers = [
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    ];
    for (const url of resolvers) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "application/dns-json" },
                signal:  AbortSignal.timeout(4000),
            });
            if (!res.ok) continue;
            const json = await res.json() as { Status: number; Answer?: { type: number; data: string }[] };
            if (json.Status !== 0 || !json.Answer) continue;
            const txt = json.Answer
                .filter((a) => a.type === 16)
                .map((a) => a.data.replace(/"/g, "").replace(/\s+/g, ""))
                .join("");
            if (txt) return txt;
        } catch {
            // try next resolver
        }
    }
    return null;
}

// ── RSA modulus extraction ────────────────────────────────────────────────────

function extractRsaModulus(dkimTxt: string): bigint | null {
    if (!dkimTxt.includes("p=")) return null;
    const kTag = dkimTxt.match(/k=(\w+)/)?.[1] ?? "rsa";
    if (kTag !== "rsa") return null;
    const pTag = dkimTxt.match(/p=([A-Za-z0-9+/=]+)/)?.[1];
    if (!pTag) return null;
    try {
        const pem = [
            "-----BEGIN PUBLIC KEY-----",
            ...(pTag.match(/.{1,64}/g) ?? []),
            "-----END PUBLIC KEY-----",
        ].join("\n");
        const key = createPublicKey({ key: pem, format: "pem", type: "spki" });
        const jwk = key.export({ format: "jwk" }) as { kty: string; n?: string };
        if (jwk.kty !== "RSA" || !jwk.n) return null;
        const nBuf = Buffer.from(jwk.n, "base64url");
        return BigInt("0x" + nBuf.toString("hex"));
    } catch {
        return null;
    }
}

// ── GitHub Issues ──────────────────────────────────────────────────────────────

interface GitHubIssue {
    number:   number;
    title:    string;
    html_url: string;
    state:    string;
}

/** Find open dkim-monitor issues whose title contains a given selector key string. */
async function findOpenIssues(dnsKey: string): Promise<GitHubIssue[]> {
    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPOSITORY;
    if (!token || !repo) return [];

    try {
        // Search open issues labelled dkim-monitor containing the exact selector string
        const q   = encodeURIComponent(`repo:${repo} is:issue is:open label:dkim-monitor "${dnsKey}"`);
        const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=10`, {
            headers: {
                Authorization:          `Bearer ${token}`,
                Accept:                 "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];
        const data = await res.json() as { items: GitHubIssue[] };
        return data.items ?? [];
    } catch {
        return [];
    }
}

/** Close a GitHub issue with an explanatory comment. */
async function closeGitHubIssue(issueNumber: number, comment: string): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPOSITORY;
    if (!token || !repo) return;

    try {
        // Post closing comment
        await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`, {
            method:  "POST",
            headers: {
                Authorization:          `Bearer ${token}`,
                Accept:                 "application/vnd.github+json",
                "Content-Type":         "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body:   JSON.stringify({ body: comment }),
            signal: AbortSignal.timeout(10000),
        });

        // Close the issue
        await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
            method:  "PATCH",
            headers: {
                Authorization:          `Bearer ${token}`,
                Accept:                 "application/vnd.github+json",
                "Content-Type":         "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body:   JSON.stringify({ state: "closed", state_reason: "completed" }),
            signal: AbortSignal.timeout(10000),
        });

        console.log(`  [github] issue #${issueNumber} closed`);
    } catch (e) {
        console.warn(`  [github] failed to close issue #${issueNumber}:`, e);
    }
}

async function createGitHubIssue(title: string, body: string, labels: string[]): Promise<string | null> {
    const token = process.env.GITHUB_TOKEN;
    const repo  = process.env.GITHUB_REPOSITORY; // "owner/repo"
    if (!token || !repo) {
        console.log(`  [github] GITHUB_TOKEN / GITHUB_REPOSITORY not set — skipping issue creation.`);
        return null;
    }

    try {
        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method:  "POST",
            headers: {
                Authorization:  `Bearer ${token}`,
                Accept:         "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body:   JSON.stringify({ title, body, labels }),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            const err = await res.text();
            console.warn(`  [github] issue creation failed (${res.status}): ${err}`);
            return null;
        }

        const issue = await res.json() as { number: number; html_url: string };
        console.log(`  [github] issue #${issue.number} created: ${issue.html_url}`);
        return issue.html_url;
    } catch (e) {
        console.warn("  [github] issue creation error:", e);
        return null;
    }
}

// ── Manifest ──────────────────────────────────────────────────────────────────

interface ManifestEntry {
    exchange:   string;
    domain:     string;
    selector:   string;
    pubkeyHash: string;
    source:     "dns" | "archive" | "hardcoded" | "predictive";
    dnsLive:    boolean;
    firstSeen:  string;
    lastChecked: string;
    note?:      string;
}

interface Manifest {
    version:     number;
    generatedAt: string;
    network:     string;
    registry:    string;
    keys:        ManifestEntry[];
}

function loadManifest(): Manifest {
    if (existsSync(MANIFEST_PATH)) {
        try {
            return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
        } catch {
            // corrupt manifest — start fresh
        }
    }
    return { version: 1, generatedAt: "", network: "", registry: "", keys: [] };
}

function upsertManifestEntry(manifest: Manifest, entry: Omit<ManifestEntry, "firstSeen"> & { firstSeen?: string }) {
    const key = `${entry.selector}._domainkey.${entry.domain}`;
    const idx = manifest.keys.findIndex(
        (e) => `${e.selector}._domainkey.${e.domain}` === key && e.pubkeyHash === entry.pubkeyHash,
    );
    const now = new Date().toISOString();
    if (idx === -1) {
        manifest.keys.push({ ...entry, firstSeen: entry.firstSeen ?? now, lastChecked: now });
    } else {
        manifest.keys[idx] = {
            ...manifest.keys[idx],
            ...entry,
            firstSeen:   manifest.keys[idx].firstSeen,
            lastChecked: now,
        };
    }
}

function saveManifest(manifest: Manifest) {
    manifest.generatedAt = new Date().toISOString();
    manifest.keys.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.selector.localeCompare(b.selector));
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface CheckResult {
    exchange:    string;
    selector:    string;
    domain:      string;
    hash:        bigint | null;
    source:      ManifestEntry["source"];
    dnsLive:     boolean;
    registered:  boolean;
    isNew:       boolean;
    note?:       string;
}

async function main() {
    const args       = process.argv.slice(2);
    const isDryRun   = args.includes("--dry-run");
    const networkIdx = args.indexOf("--network");
    const networkArg =
        args.find((a) => a.startsWith("--network="))?.split("=")[1]
        ?? (networkIdx !== -1 ? args[networkIdx + 1] : undefined)
        ?? "base_sepolia";

    if (networkArg !== "base_sepolia" && networkArg !== "base") {
        console.error(`Unknown network: ${networkArg}. Use base_sepolia or base.`);
        process.exit(1);
    }

    const network  = networkArg as "base_sepolia" | "base";
    const chain    = network === "base" ? base : baseSepolia;
    const rpcUrl   = process.env.RPC_URL
        ?? (network === "base" ? "https://mainnet.base.org" : "https://sepolia.base.org");
    const registry = DKIM_REGISTRY[network];

    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║      Signet DKIM Key Rotation Monitor     ║`);
    console.log(`╚══════════════════════════════════════════╝`);
    console.log(`  Network:   ${network} (chain ${chain.id})`);
    console.log(`  Registry:  ${registry}`);
    console.log(`  Mode:      ${isDryRun ? "DRY RUN — no on-chain writes" : "LIVE"}\n`);

    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    let walletClient: ReturnType<typeof createWalletClient> | null = null;
    if (!isDryRun) {
        const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
        if (!pk) {
            console.error(
                "  Error: PRIVATE_KEY env var required for live runs.\n" +
                "  Use --dry-run to preview without writing, or set PRIVATE_KEY.",
            );
            process.exit(1);
        }
        const account = privateKeyToAccount(pk);
        walletClient  = createWalletClient({ chain, account, transport: http(rpcUrl) });
        console.log(`  Signer:    ${account.address}\n`);
    }

    process.stdout.write("  Initialising Poseidon…");
    await getPoseidon();
    console.log(" done\n");

    const manifest = loadManifest();
    manifest.network  = network;
    manifest.registry = registry;

    const results: CheckResult[] = [];
    const dnsFailures: { exchange: string; selector: string; domain: string; reason: string }[] = [];

    // ── Hardcoded keys ──────────────────────────────────────────────────────
    console.log("── Hardcoded keys ───────────────────────────────────────\n");
    for (const entry of HARDCODED_KEYS) {
        const dnsName = `${entry.selector}._domainkey.${entry.domain}`;
        process.stdout.write(`  ${entry.exchange} (${dnsName}) [hardcoded]… `);

        const registered = await publicClient.readContract({
            address:      registry,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "isValid",
            args:         [entry.hash],
        }) as boolean;

        console.log(`${registered ? "registered ✓" : "NEW"} — ${entry.hash}`);

        results.push({ ...entry, source: "hardcoded", dnsLive: false, registered, isNew: !registered });
        upsertManifestEntry(manifest, {
            exchange:   entry.exchange,
            domain:     entry.domain,
            selector:   entry.selector,
            pubkeyHash: entry.hash.toString(),
            source:     "hardcoded",
            dnsLive:    false,
        });
    }

    // ── Archive source keys ─────────────────────────────────────────────────
    console.log("\n── Archive source keys ──────────────────────────────────\n");
    for (const entry of ARCHIVE_SOURCE_KEYS) {
        const dnsName = `${entry.selector}._domainkey.${entry.domain}`;
        process.stdout.write(`  ${entry.exchange} (${dnsName}) [archive]… `);

        const modulus = extractRsaModulus(`k=rsa; p=${entry.pubkeyB64}`);
        if (!modulus) {
            console.log("SKIP — pubkey parse failed");
            results.push({ ...entry, hash: null, source: "archive", dnsLive: false, registered: false, isNew: false, note: "pubkey parse failed" });
            continue;
        }

        const hash       = await computePubkeyHash(modulus);
        const registered = await publicClient.readContract({
            address:      registry,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "isValid",
            args:         [hash],
        }) as boolean;

        console.log(`${registered ? "registered ✓" : "NEW"} — ${hash}`);
        results.push({ ...entry, hash, source: "archive", dnsLive: false, registered, isNew: !registered, note: entry.note });
        upsertManifestEntry(manifest, {
            exchange:   entry.exchange,
            domain:     entry.domain,
            selector:   entry.selector,
            pubkeyHash: hash.toString(),
            source:     "archive",
            dnsLive:    false,
            note:       entry.note,
        });
    }

    // ── DNS selectors ───────────────────────────────────────────────────────
    console.log("\n── DNS selectors ────────────────────────────────────────\n");
    for (const entry of EXCHANGE_SELECTORS) {
        const dnsName = `${entry.selector}._domainkey.${entry.domain}`;
        process.stdout.write(`  ${entry.exchange} (${dnsName})… `);

        let txt: string | null;
        try {
            txt = await fetchDkimTxt(entry.selector, entry.domain);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            console.log(`DNS ERROR — ${reason}`);
            dnsFailures.push({ ...entry, reason });
            results.push({ ...entry, hash: null, source: "dns", dnsLive: false, registered: false, isNew: false, note: `DNS error: ${reason}` });
            continue;
        }

        if (!txt) {
            console.log("NOT FOUND");
            dnsFailures.push({ ...entry, reason: "NXDOMAIN" });
            results.push({ ...entry, hash: null, source: "dns", dnsLive: false, registered: false, isNew: false, note: "DNS not found" });
            continue;
        }

        const modulus = extractRsaModulus(txt);
        if (!modulus) {
            const hint = txt.startsWith("v=spf") ? "SPF record" : "not RSA / revoked / Ed25519";
            console.log(`SKIP — ${hint}`);
            results.push({ ...entry, hash: null, source: "dns", dnsLive: true, registered: false, isNew: false, note: hint });
            continue;
        }

        const hash       = await computePubkeyHash(modulus);
        const registered = await publicClient.readContract({
            address:      registry,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "isValid",
            args:         [hash],
        }) as boolean;

        console.log(`${registered ? "registered ✓" : "NEW"} — ${hash}`);
        results.push({ ...entry, hash, source: "dns", dnsLive: true, registered, isNew: !registered });
        upsertManifestEntry(manifest, {
            exchange:   entry.exchange,
            domain:     entry.domain,
            selector:   entry.selector,
            pubkeyHash: hash.toString(),
            source:     "dns",
            dnsLive:    true,
        });
    }

    // ── Predictive selector checks ──────────────────────────────────────────
    console.log("\n── Predictive selector checks ───────────────────────────\n");

    for (const pattern of PREDICTIVE_PATTERNS) {
        const knownSelectors = EXCHANGE_SELECTORS
            .filter((e) => e.domain === pattern.domain)
            .map((e) => e.selector);

        const candidates = pattern.generate(knownSelectors);

        for (const sel of candidates) {
            // Skip if already known
            if (knownSelectors.includes(sel)) continue;

            const dnsName = `${sel}._domainkey.${pattern.domain}`;
            process.stdout.write(`  ${pattern.exchange} (${dnsName}) [predictive]… `);

            const txt = await fetchDkimTxt(sel, pattern.domain);
            if (!txt) { console.log("not found"); continue; }

            const modulus = extractRsaModulus(txt);
            if (!modulus) { console.log("SKIP — not RSA"); continue; }

            const hash       = await computePubkeyHash(modulus);
            const registered = await publicClient.readContract({
                address:      registry,
                abi:          DKIM_REGISTRY_ABI,
                functionName: "isValid",
                args:         [hash],
            }) as boolean;

            const discovered: SelectorEntry = { exchange: pattern.exchange, selector: sel, domain: pattern.domain };
            console.log(`${registered ? "registered ✓" : "DISCOVERED"} — ${hash}`);
            results.push({ ...discovered, hash, source: "predictive", dnsLive: true, registered, isNew: !registered });
            upsertManifestEntry(manifest, {
                exchange:   pattern.exchange,
                domain:     pattern.domain,
                selector:   sel,
                pubkeyHash: hash.toString(),
                source:     "predictive",
                dnsLive:    true,
                note:       `predictively discovered by monitor`,
            });
        }
    }

    // ── Summary ────────────────────────────────────────────────────────────────

    const newKeys   = results.filter((r) => r.hash !== null && r.isNew);
    const registered = results.filter((r) => r.registered);
    const skipped   = results.filter((r) => r.hash === null);

    console.log(`\n── Summary ──────────────────────────────────────────────`);
    console.log(`  Already registered:  ${registered.length}`);
    console.log(`  New keys to add:     ${newKeys.length}`);
    console.log(`  Not found / skipped: ${skipped.length}`);
    console.log(`  DNS failures:        ${dnsFailures.length}`);

    if (newKeys.length > 0) {
        console.log("\n  New keys:");
        for (const k of newKeys) {
            console.log(`    [${k.source}] ${k.exchange} — ${k.selector}._domainkey.${k.domain}`);
            console.log(`      hash: ${k.hash}`);
        }
    }

    // ── GitHub issue: DNS failures ───────────────────────────────────────────
    if (dnsFailures.length > 0) {
        const failLines = dnsFailures.map(
            (f) => `- \`${f.selector}._domainkey.${f.domain}\` — ${f.reason}`,
        ).join("\n");
        await createGitHubIssue(
            `⚠️ DKIM DNS failures detected (${new Date().toISOString().slice(0, 10)})`,
            `The DKIM monitor detected DNS resolution failures for the following selectors.\n\n` +
            `These may indicate key rotation, domain lapse, or a transient DNS outage.\n\n` +
            `**Affected selectors:**\n${failLines}\n\n` +
            `**Action required:** Verify each selector manually and register any new keys via \`pnpm seed-dkim\`.\n\n` +
            `> Generated by the DKIM monitor cron job on ${new Date().toISOString()}`,
            ["dkim-monitor", "dns-failure"],
        );
    }

    // ── Register on-chain ────────────────────────────────────────────────────

    if (newKeys.length === 0) {
        console.log("\n  Registry is up to date — nothing to register.\n");
    } else if (isDryRun) {
        console.log(`\n  [DRY RUN] Would register ${newKeys.length} key(s). Re-run without --dry-run to write.\n`);
    } else {
        console.log("\n── Registering new keys on-chain ────────────────────────\n");

        const hashes = newKeys.map((k) => k.hash as bigint);

        const txHash = await walletClient!.writeContract({
            address:      registry,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "setKeys",
            args:         [hashes, true],
        });

        console.log(`  Tx submitted:  ${txHash}`);
        process.stdout.write("  Confirming…");

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === "success") {
            console.log(` ✓ block ${receipt.blockNumber}`);
            const scanBase = network === "base"
                ? "https://basescan.org/tx/"
                : "https://sepolia.basescan.org/tx/";
            const txUrl = `${scanBase}${txHash}`;
            console.log(`\n  ${hashes.length} key(s) registered.\n  ${txUrl}\n`);

            // GitHub issue: new keys registered
            const keyLines = newKeys.map(
                (k) => `- **${k.exchange}** \`${k.selector}._domainkey.${k.domain}\`\n  hash: \`${k.hash}\`\n  source: ${k.source}`,
            ).join("\n");
            await createGitHubIssue(
                `🔑 New DKIM key(s) registered (${new Date().toISOString().slice(0, 10)})`,
                `The DKIM monitor detected and registered ${newKeys.length} new key(s).\n\n` +
                `**Keys registered:**\n${keyLines}\n\n` +
                `**Transaction:** [${txHash.slice(0, 10)}…](${txUrl})\n` +
                `**Network:** ${network}\n\n` +
                `> Generated by the DKIM monitor cron job on ${new Date().toISOString()}`,
                ["dkim-monitor", "key-rotation"],
            );

            // Auto-close any open DNS-failure issues for selectors that were
            // just registered. The key is now on-chain — the issue is resolved.
            console.log("\n── Auto-closing resolved DNS-failure issues ─────────────\n");
            for (const k of newKeys) {
                const dnsKey = `${k.selector}._domainkey.${k.domain}`;
                const open   = await findOpenIssues(dnsKey);
                for (const issue of open) {
                    if (!issue.title.toLowerCase().includes("dns")) continue; // only close dns-failure issues
                    await closeGitHubIssue(
                        issue.number,
                        `✅ Resolved automatically by the DKIM monitor.\n\n` +
                        `The key \`${dnsKey}\` was registered on-chain in transaction [${txHash.slice(0, 10)}…](${txUrl}).\n\n` +
                        `> Closed by monitor run ${new Date().toISOString()}`,
                    );
                }
            }
        } else {
            console.error("\n  Transaction reverted.\n");
            await createGitHubIssue(
                `🚨 DKIM registration transaction reverted`,
                `The DKIM monitor attempted to register new keys but the transaction reverted.\n\n` +
                `**Transaction:** ${txHash}\n**Network:** ${network}\n\n` +
                `**Action required:** Check the deployer wallet balance and registry contract state, then re-run manually with \`pnpm monitor-dkim\`.\n\n` +
                `> Generated by the DKIM monitor cron job on ${new Date().toISOString()}`,
                ["dkim-monitor", "error"],
            );
            process.exit(1);
        }
    }

    // ── Auto-close resolved DNS issues on clean runs ─────────────────────────
    //
    // For each selector that resolved cleanly in DNS this run, close any open
    // dns-failure issue for it. Condition: DNS is live NOW — meaning the outage
    // has cleared or the key came back. DNS-permanently-dead selectors (archive,
    // hardcoded) never appear in dnsOkKeys so their issues are never touched.
    if (!isDryRun && dnsFailures.length === 0) {
        const dnsOkKeys = results
            .filter((r) => r.source === "dns" && r.dnsLive)
            .map((r) => `${r.selector}._domainkey.${r.domain}`);

        if (dnsOkKeys.length > 0) {
            console.log("\n── Auto-closing stale DNS-failure issues ────────────────\n");
            for (const dnsKey of dnsOkKeys) {
                const open = await findOpenIssues(dnsKey);
                for (const issue of open) {
                    if (!issue.title.toLowerCase().includes("dns")) continue;
                    await closeGitHubIssue(
                        issue.number,
                        `✅ DNS is resolving cleanly for \`${dnsKey}\` as of this monitor run.\n\n` +
                        `The previous failure appears to have been transient or the key has been restored.\n\n` +
                        `> Closed by monitor run ${new Date().toISOString()}`,
                    );
                }
            }
        }
    }

    // ── Save manifest ────────────────────────────────────────────────────────
    if (!isDryRun) {
        saveManifest(manifest);
        console.log(`  Manifest updated: ${MANIFEST_PATH}\n`);
    } else {
        console.log(`  [DRY RUN] Manifest not written.\n`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
