/**
 * prove.mjs
 *
 * Generates a Groth16 proof from an .eml file using the partial-SHA circuit.
 *
 * Usage:
 *   node scripts/prove.mjs [path/to/email.eml] [proverAddress]
 *
 * Defaults:
 *   email   = ../../fixtures/valid/coinbase.eml
 *   address = 0x000000000000000000000000000000000000dEaD
 *
 * Outputs:
 *   build/proof.json          — the Groth16 proof (pi_a, pi_b, pi_c)
 *   build/public_signals.json — the public inputs array
 *
 * Public signal layout (outputs first, public inputs after):
 *   [0]  pubkeyHash       — Poseidon hash of DKIM RSA public key
 *   [1]  email_timestamp  — Unix timestamp from DKIM t= tag (cryptographically verified)
 *   [2]  proverETHAddress — wallet address bound to this proof
 *
 * Circuit design (partial-SHA header):
 *   The DKIM-Signature line is always last in the canonical signed block (RFC 6376).
 *   We precompute SHA-256 through all headers that precede it, then pass only the
 *   DKIM-Sig suffix (~300-450 bytes) into the circuit via Sha256BytesPartial.
 *   This supports arbitrary header lengths — KuCoin 1600-byte blocks, EngageLab, etc.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir  = dirname(fileURLToPath(import.meta.url));
const root   = resolve(__dir, "..");

const emlPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(root, "../../fixtures/valid/coinbase.eml");

const proverAddress = process.argv[3] ?? "0x000000000000000000000000000000000000dEaD";

const WASM  = resolve(root, "build/signet_email_js/signet_email.wasm");
const ZKEY  = resolve(root, "build/signet_email_final.zkey");

const MAX_HEADERS_SUFFIX = 640; // maxHeadersLength in new circuit

if (!existsSync(WASM))  { console.error(`WASM not found: ${WASM}\nRun: node scripts/compile.mjs`);  process.exit(1); }
if (!existsSync(ZKEY))  { console.error(`zkey not found: ${ZKEY}\nRun: node scripts/setup.mjs`);    process.exit(1); }
if (!existsSync(emlPath)) { console.error(`EML not found: ${emlPath}`); process.exit(1); }

const snarkjs = await import(resolve(root, "node_modules/snarkjs/build/main.cjs"));
const helpersPath = resolve(root, "node_modules/@zk-email/helpers/dist/index.js");
const {
    sha256Pad,
    generatePartialSHA,
    Uint8ArrayToCharArray,
    toCircomBigIntBytes,
} = await import(helpersPath);

const dkimPath = resolve(root, "node_modules/@zk-email/helpers/dist/dkim/index.js");
const { verifyDKIMSignature } = await import(dkimPath);

console.log(`Email:   ${emlPath}`);
console.log(`Address: ${proverAddress}`);

// ── 1. DKIM verification ──────────────────────────────────────────────────────
console.log("\n[1/3] Verifying DKIM signature…");
const rawEmail = readFileSync(emlPath);

const dkimResult = await verifyDKIMSignature(
    rawEmail,
    "",    // auto-detect domain
    true,  // enableSanitization
    false, // fallbackToZKEmailDNSArchive
    true,  // skipBodyHash ← fixes v6.4.2 bug
);
console.log(`  domain:   ${dkimResult.signingDomain ?? "(auto)"}`);
console.log(`  selector: ${dkimResult.selector ?? "(auto)"}`);

// ── 2. Build partial-SHA circuit inputs ───────────────────────────────────────
console.log("\n[2/3] Building partial-SHA circuit inputs…");

const headers   = dkimResult.headers;   // Buffer — canonical signed block
const publicKey = dkimResult.publicKey; // BigInt — RSA modulus
const signature = dkimResult.signature; // BigInt — RSA signature

console.log(`  Full canonical block length: ${headers.length} bytes`);

// SHA256-pad the full canonical block.
const minPaddedLen = Math.ceil((headers.length + 9) / 64) * 64;
const [paddedHeader, headerLen] = sha256Pad(headers, minPaddedLen);

// Split at the 64-byte boundary immediately before the DKIM-Signature line.
const { precomputedSha, bodyRemaining: suffix, bodyRemainingLength: suffixLen } =
    generatePartialSHA({
        body:                   paddedHeader,
        bodyLength:             headerLen,
        selectorString:         "dkim-signature:",
        maxRemainingBodyLength: MAX_HEADERS_SUFFIX,
    });

console.log(`  Suffix (DKIM-Sig) length:   ${suffixLen} bytes (${suffix.length} padded)`);
console.log(`  precomputedSHA[0..3]:       [${Array.from(precomputedSha).slice(0, 4).join(", ")}, …]`);

// Find timestamp index within the suffix.
const timestampIndex = findTimestampIndex(suffix);
const tsBytes = suffix.slice(timestampIndex, timestampIndex + 10);
const tsStr   = Buffer.from(tsBytes).toString("ascii").replace(/\0.*/, "");
console.log(`  timestampIndex: ${timestampIndex}  → "${tsStr}" → ${new Date(Number(tsStr) * 1000).toISOString()}`);

const addrBigInt = BigInt(proverAddress);

const inputs = {
    emailHeader:       Uint8ArrayToCharArray(suffix),
    emailHeaderLength: String(suffixLen),
    precomputedSHA:    Uint8ArrayToCharArray(precomputedSha),
    pubkey:            toCircomBigIntBytes(publicKey),
    signature:         toCircomBigIntBytes(signature),
    timestampIndex:    String(timestampIndex),
    proverETHAddress:  addrBigInt.toString(),
};

// ── 3. Prove ──────────────────────────────────────────────────────────────────
console.log("\n[3/3] Generating Groth16 proof (may take a few minutes)…");
const start = Date.now();

const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, WASM, ZKEY);

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`  ✓ Proof generated in ${elapsed}s`);

// ── 4. Save and display results ───────────────────────────────────────────────
writeFileSync(resolve(root, "build/proof.json"),          JSON.stringify(proof, null, 2));
writeFileSync(resolve(root, "build/public_signals.json"), JSON.stringify(publicSignals, null, 2));

console.log("\nPublic signals:");
const labels = ["pubkeyHash", "email_timestamp", "proverETHAddress"];
publicSignals.forEach((v, i) => {
    const label = labels[i] ?? `[${i}]`;
    let extra = "";
    if (label === "email_timestamp") {
        const ts = Number(v);
        extra = ` → ${new Date(ts * 1000).toISOString().split("T")[0]}`;
    }
    console.log(`  [${i}] ${label.padEnd(20)} ${v}${extra}`);
});

console.log(`\nProof saved to    build/proof.json`);
console.log(`Signals saved to  build/public_signals.json`);
console.log("\nNext: node scripts/verify.mjs");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find the byte offset of the first digit of the DKIM t= timestamp in the
 * suffix bytes. The DKIM-Sig always contains "; t=<digits>" or ";t=<digits>".
 */
function findTimestampIndex(suffixBytes) {
    const patterns = [Buffer.from("; t="), Buffer.from(";t=")];
    for (const pattern of patterns) {
        for (let i = 0; i < suffixBytes.length - pattern.length; i++) {
            if (pattern.every((b, j) => suffixBytes[i + j] === b)) {
                const digitStart = i + pattern.length;
                if (suffixBytes[digitStart] >= 48 && suffixBytes[digitStart] <= 57) {
                    return digitStart;
                }
            }
        }
    }
    throw new Error("DKIM t= timestamp not found in canonical header suffix");
}
