#!/usr/bin/env bash
# redeploy-after-circuit-change.sh
#
# Run this AFTER node circuits/scripts/setup.mjs completes.
# Exports the new Verifier.sol, redeploys all contracts, reseeds DKIM keys,
# and prints updated addresses to set in packages/sdk/src/index.ts.
#
# Usage:
#   PRIVATE_KEY=0x... bash scripts/redeploy-after-circuit-change.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PK="${PRIVATE_KEY:?PRIVATE_KEY env var required}"
RPC="https://sepolia.base.org"
OWNER="0x6dd412a8BE195E16d78C8BFdc41058Ec7c2cB91E"
METADATA_URI="ipfs://QmS7EnxsWBucEQg2uKzKTw8J4LWbafYsdenisVJcbnxgEx/metadata/{id}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         Signet Post-Circuit-Change Redeployment       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Export new Groth16Verifier.sol ────────────────────────────────────
echo "── Step 1: Exporting Groth16Verifier.sol ────────────────"
npx --prefix "$ROOT/circuits" snarkjs zkey export solidityverifier \
    "$ROOT/circuits/build/signet_email_final.zkey" \
    "$ROOT/contracts/src/Groth16Verifier.sol"
echo "✓ Groth16Verifier.sol updated"

# ── Step 2: Redeploy core contracts (Verifier + DKIMRegistry + AttestationCache)
echo ""
echo "── Step 2: Deploying core contracts ─────────────────────"
cd "$ROOT/contracts"
BASESCAN_API_KEY="${BASESCAN_API_KEY:-placeholder}" \
forge script script/Deploy.s.sol \
    --rpc-url "$RPC" \
    --private-key "$PK" \
    --broadcast \
    -vvvv 2>&1 | tee /tmp/signet-deploy-core.log

# Extract new addresses from the deployment JSON
CACHE_ADDR=$(cat "$ROOT/contracts/deployments/base_sepolia.json" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['NEXT_PUBLIC_ATTESTATION_CACHE'])")
DKIM_ADDR=$(cat "$ROOT/contracts/deployments/base_sepolia.json" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['NEXT_PUBLIC_DKIM_REGISTRY'])")
VERIFIER_ADDR=$(cat "$ROOT/contracts/deployments/base_sepolia.json" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['NEXT_PUBLIC_VERIFIER'])")

echo ""
echo "  Verifier:        $VERIFIER_ADDR"
echo "  DKIMRegistry:    $DKIM_ADDR"
echo "  AttestationCache:$CACHE_ADDR"

# ── Step 3: Redeploy RugSurvivorSBT ──────────────────────────────────────────
echo ""
echo "── Step 3: Deploying RugSurvivorSBT ─────────────────────"
cd "$ROOT/contracts-rug"
BASESCAN_API_KEY="${BASESCAN_API_KEY:-placeholder}" \
SIGNET_CACHE="$CACHE_ADDR" \
OWNER_ADDRESS="$OWNER" \
METADATA_URI="$METADATA_URI" \
forge script script/DeployRugSurvivorSBT.s.sol \
    --rpc-url "$RPC" \
    --private-key "$PK" \
    --broadcast \
    -vvvv 2>&1 | tee /tmp/signet-deploy-rug.log

SBT_ADDR=$(cat "$ROOT/contracts-rug/deployments/base_sepolia.json" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['NEXT_PUBLIC_RUG_SURVIVOR_SBT'])")

echo "  RugSurvivorSBT:  $SBT_ADDR"

# ── Step 4: Seed DKIM registry ────────────────────────────────────────────────
echo ""
echo "── Step 4: Seeding DKIM registry (46 keys) ─────────────"
cd "$ROOT"
PRIVATE_KEY="$PK" pnpm seed-dkim

# ── Step 5: Print addresses to update ────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Update packages/sdk/src/index.ts         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  SIGNET_ADDRESSES.baseSepolia:        \"$CACHE_ADDR\""
echo "  DKIM_REGISTRY_ADDRESS.baseSepolia:   \"$DKIM_ADDR\""
echo "  RUG_SURVIVOR_SBT_ADDRESS.baseSepolia:\"$SBT_ADDR\""
echo ""
echo "  Also update seed-dkim.ts DKIM_REGISTRY constant:"
echo "  base_sepolia: \"$DKIM_ADDR\""
echo ""
echo "✓ Redeployment complete. Update SDK addresses and commit."
