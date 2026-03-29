/**
 * compile.mjs
 *
 * Compiles signet_email.circom → build/signet_email.r1cs + build/signet_email_js/signet_email.wasm
 *
 * Usage:
 *   node scripts/compile.mjs
 *
 * Outputs (in circuits/build/):
 *   signet_email.r1cs                    — constraint system (input to snarkjs groth16 setup)
 *   signet_email_js/signet_email.wasm    — witness generator (used by snarkjs in browser/node)
 *   signet_email.sym                     — symbol table (for debugging)
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir  = dirname(fileURLToPath(import.meta.url));
const root   = resolve(__dir, "..");
const circom = resolve(root, "build/circom");      // pre-downloaded binary
const src    = resolve(root, "src/signet_email.circom");
const outDir = resolve(root, "build");
const nm     = resolve(root, "node_modules");

if (!existsSync(circom)) {
    console.error(`circom binary not found at ${circom}`);
    console.error("Download it with:");
    console.error("  curl -L https://github.com/iden3/circom/releases/download/v2.2.3/circom-macos-amd64 -o build/circom && chmod +x build/circom");
    process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Include paths: node_modules for @zk-email/* and circomlib
const includes = [
    `-l ${nm}`,                             // @zk-email/circuits, @zk-email/zk-regex-circom
    `-l ${nm}/circomlib/circuits`,           // circomlib primitives (Poseidon, etc.)
].join(" ");

const cmd = [
    circom,
    src,
    `--r1cs --wasm --sym`,
    `--output ${outDir}`,
    includes,
    `--O2`,  // optimise for proof size
].join(" ");

console.log("Compiling circuit…");
console.log(`  ${cmd}\n`);

const start = Date.now();
try {
    execSync(cmd, { stdio: "inherit" });
} catch (e) {
    console.error("\nCompilation failed.");
    process.exit(1);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n✓ Compiled in ${elapsed}s`);
console.log(`  build/signet_email.r1cs`);
console.log(`  build/signet_email_js/signet_email.wasm`);
console.log(`  build/signet_email.sym`);
console.log("\nNext: node scripts/setup.mjs");
