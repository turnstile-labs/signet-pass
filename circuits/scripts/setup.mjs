/**
 * setup.mjs
 *
 * Generates the Groth16 proving key and verification key, then syncs all
 * artifacts to the web app's public directory.
 *
 * Usage:
 *   node scripts/setup.mjs
 *
 * Steps:
 *   1. Download pot21_final.ptau (~2.3 GB, Hermez ceremony)
 *      if not already present in build/.
 *   2. snarkjs groth16 setup  → build/signet_email_0000.zkey
 *   3. snarkjs zkey beacon    → build/signet_email_final.zkey  (local randomness)
 *   4. snarkjs zkey export verificationkey → artifacts/verification_key.json
 *   5. Copy signet_email.wasm → artifacts/  (source of truth for the web app)
 *   6. Copy signet_email.wasm + signet_email_final.zkey → apps/protocol/public/artifacts/
 *
 * Estimated runtime: 30–90 minutes on Apple Silicon.
 *
 * For production: run a proper multi-party Phase 2 ceremony instead of the
 * single beacon contribution done here.
 */

import { existsSync, mkdirSync, copyFileSync, createWriteStream } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { get as httpsGet } from "https";
import { get as httpGet }  from "http";

const __dir      = dirname(fileURLToPath(import.meta.url));
const root       = resolve(__dir, "..");
const build      = resolve(root, "build");
const artifacts  = resolve(root, "artifacts");
const webArtifacts = resolve(root, "..", "apps", "protocol", "public", "artifacts");

const R1CS       = resolve(build, "signet_email.r1cs");
const WASM_BUILD = resolve(build, "signet_email_js/signet_email.wasm");
const PTAU       = resolve(build, "pot21_final.ptau");
const ZKEY_0     = resolve(build, "signet_email_0000.zkey");
const ZKEY_FINAL = resolve(build, "signet_email_final.zkey");
const VKEY       = resolve(artifacts, "verification_key.json");
const WASM_OUT   = resolve(artifacts, "signet_email.wasm");

// maxHeadersLength=640 (partial-SHA design) → ~550k constraints → well within 2^21 = 2,097,152
//
// Circuit redesign (partial-SHA for headers):
//   The canonical DKIM signed-block always ends with the DKIM-Signature line (RFC 6376).
//   We precompute SHA-256 through all headers that precede the DKIM-Sig, then pass only
//   the suffix (~300-450 bytes) into the circuit via Sha256BytesPartial. This supports
//   arbitrarily long header blocks (KuCoin 1600 bytes, EngageLab, etc.) without growing
//   the circuit. maxHeadersLength=640 (10 SHA-256 blocks) covers the DKIM-Sig line plus
//   at most 63 bytes of alignment before it.
//
// Constraint reduction vs previous design (maxHeadersLength=832, full header):
//   Previous: ~1,421,628 constraints → ~829 MB zkey
//   New:      ~550,000 constraints   → ~299 MB zkey
//   Benefit: ~2× smaller, ~2× faster proof generation, supports unlimited header lengths.
//
// Trade-off: email_recipient (Poseidon of To: address) removed. The To: header lives in
//   the precomputed prefix and cannot be extracted inside the circuit. One-wallet-one-
//   attestation is still enforced on-chain via proverETHAddress.
const PTAU_URL =
    "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_21.ptau";

mkdirSync(build,     { recursive: true });
mkdirSync(artifacts, { recursive: true });

// ── snarkjs helper ────────────────────────────────────────────────────────────
// Run snarkjs via `node --max-old-space-size=8192 cli.js …` so the groth16 setup
// phase doesn't OOM on the default Node heap limit (~4 GB).
function snarkjs(...args) {
    const cli = resolve(root, "node_modules/snarkjs/cli.js");
    console.log(`\n$ snarkjs ${args.join(" ")}`);
    const r = spawnSync(
        process.execPath,
        ["--max-old-space-size=8192", cli, ...args],
        { stdio: "inherit", maxBuffer: 1024 * 1024 * 512 },
    );
    if (r.status !== 0) {
        console.error("snarkjs failed");
        process.exit(1);
    }
}

// ── 1. Download ptau ──────────────────────────────────────────────────────────
if (!existsSync(PTAU)) {
    console.log(`\nDownloading ${PTAU_URL} (~2.3 GB)…`);
    await new Promise((resolve, reject) => {
        const file = createWriteStream(PTAU);
        const fn = PTAU_URL.startsWith("https") ? httpsGet : httpGet;

        function follow(url) {
            fn(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    follow(res.headers.location);
                    return;
                }
                const total = parseInt(res.headers["content-length"] ?? "0", 10);
                let received = 0;
                res.pipe(file);
                res.on("data", (chunk) => {
                    received += chunk.length;
                    if (total) {
                        process.stdout.write(
                            `\r  ${(received / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`
                        );
                    }
                });
                res.on("end", () => { process.stdout.write("\n"); resolve(); });
                res.on("error", reject);
            }).on("error", reject);
        }
        follow(PTAU_URL);
    });
    console.log("✓ ptau downloaded");
} else {
    console.log("✓ ptau already present, skipping download");
}

// ── 2. Groth16 phase-1 setup ──────────────────────────────────────────────────
if (!existsSync(ZKEY_0)) {
    console.log("\nRunning groth16 setup (phase 1)… this takes 20–60 min");
    snarkjs("groth16", "setup", R1CS, PTAU, ZKEY_0);
    console.log("✓ phase 1 complete");
} else {
    console.log("✓ signet_email_0000.zkey present, skipping phase 1");
}

// ── 3. Phase-2 beacon contribution ───────────────────────────────────────────
if (!existsSync(ZKEY_FINAL)) {
    console.log("\nContributing randomness (phase 2)…");
    // Using beacon for deterministic contribution in dev; replace with interactive
    // ceremony contributions for production.
    snarkjs("zkey", "beacon",
        ZKEY_0, ZKEY_FINAL,
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        "10"
    );
    console.log("✓ phase 2 complete");
} else {
    console.log("✓ signet_email_final.zkey present, skipping phase 2");
}

// ── 4. Export verification key ────────────────────────────────────────────────
console.log("\nExporting verification key…");
snarkjs("zkey", "export", "verificationkey", ZKEY_FINAL, VKEY);
console.log(`✓ Exported ${VKEY}`);

// ── 5. Copy wasm to circuits/artifacts/ ──────────────────────────────────────
copyFileSync(WASM_BUILD, WASM_OUT);
console.log(`✓ Copied signet_email.wasm → circuits/artifacts/`);

// ── 6. Sync artifacts to web app ─────────────────────────────────────────────
if (existsSync(webArtifacts)) {
    copyFileSync(WASM_OUT,   resolve(webArtifacts, "signet_email.wasm"));
    copyFileSync(ZKEY_FINAL, resolve(webArtifacts, "signet_email.zkey"));
    console.log(`✓ Synced artifacts → apps/protocol/public/artifacts/`);
} else {
    console.log(`⚠  apps/protocol/public/artifacts/ not found — skipping protocol sync`);
    console.log(`   Run manually: cp build/signet_email_final.zkey ../apps/protocol/public/artifacts/signet_email.zkey`);
}

console.log(`
✓ Setup complete!

Circuit: maxHeadersLength=640, partial-SHA header design.
  Supports unlimited header lengths (KuCoin, EngageLab, etc.) via precomputedSHA.
  Public signals: [pubkeyHash, email_timestamp, proverETHAddress] (no email_recipient).

Artifacts committed to git:
  circuits/artifacts/signet_email.wasm        — witness generator (~5-8 MB)
  circuits/artifacts/verification_key.json    — Groth16 verification key

Artifacts gitignored (large):
  circuits/build/signet_email_final.zkey      — proving key (~299 MB)
  apps/protocol/public/artifacts/signet_email.zkey — protocol app copy (synced above)

Next steps:
  1. Test:   node scripts/prove.mjs ../../fixtures/valid/coinbase.eml
  2. Verify: node scripts/verify.mjs
  3. Export Solidity verifier:
       npx snarkjs zkey export solidityverifier \\
         circuits/build/signet_email_final.zkey \\
         contracts/src/Groth16Verifier.sol
  4. Redeploy contracts:
       cd contracts && forge script script/RedeployVerifier.s.sol --broadcast --rpc-url base_sepolia
  5. Update contract addresses in packages/sdk/src/index.ts and other files.
`);
