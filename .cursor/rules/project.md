# Signet Pass — Project Context

## What this is

**Signet** is a ZK email attestation protocol. It lets a wallet cryptographically prove it controls an old exchange account (Coinbase, Binance, Kraken, etc.) without revealing any email content. The proof is generated client-side in the browser using a Groth16 ZK circuit over the DKIM signature of any old exchange email.

**Signet Pass** is the first product built on the protocol. A founder deploys a `SignetPass` contract (one transaction), shares a link, and users click it to prove their account age and claim an on-chain pass. The pass is reusable — proven once, it works for every Signet-gated project forever.

The product was previously called "Signet Waitlist". All "waitlist" naming has been removed from user-facing code. The term "pass" is used everywhere. Contract names (`SignetWaitlist`, `SignetWaitlistFactory`) remain as-is for now since they're deployed on-chain.

## Monorepo structure

```
apps/
  protocol/ — Signet protocol app (Next.js 14, :3000)
              /prove — ZK proof generation UI
              /attestation — look up any wallet's attestation
              /developers — protocol documentation
  pass/     — Signet Pass product (Next.js 14, :3003)
              / — marketing landing page
              /developers — deploy a pass + code snippets
              /verify — user-facing verification widget (card)
              /how-it-works — product explainer
packages/
  sdk/      — @signet/sdk — core TypeScript primitives (checkPass, PASS_ABI)
  react/    — @signet/react — SignetPass component + usePass hook
contracts/  — Foundry project — core protocol + pass contracts
  src/
    AttestationCache.sol    — core: one attestation per wallet
    DKIMRegistry.sol        — core: ownable pubkey hash registry
    SignetGated.sol         — base contract for integrators
    Verifier.sol            — Groth16 verifier (generated)
    examples/
      SignetPass.sol         — access pass with cutoff + exchange filter
      SignetPassFactory.sol  — one-call deployment factory
  test/
    SignetPass.t.sol         — 21 tests (pass + factory)
  script/
    Deploy.s.sol             — deploys full protocol stack
    DeployPass.s.sol         — deploys SignetPassFactory + initial pass
circuits/   — Groth16 ZK circuit (signet_email.circom)
scripts/    — DKIM seeding + monitoring tools
```

## Tech stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS 3
- **Wallet**: wagmi 2, viem 2, ConnectKit
- **Chain**: Base Sepolia (testnet), Base Mainnet (not yet)
- **ZK**: snarkjs, @zk-email/helpers, Groth16 circuit
- **Contracts**: Solidity 0.8.24, Foundry
- **Monorepo**: pnpm workspaces
- **Package manager**: pnpm 10

## Deployed contracts (Base Sepolia)

| Contract | Address |
|---|---|
| `Groth16Verifier` | `0xb8C2b2402F1847258Ae59ACcb2A7dEbd994e4eB7` |
| `DKIMRegistry` | `0xd984F26057A990a4f4de5A36faF7968b818BAe46` |
| `AttestationCache` | `0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1` |
| `SignetPassFactory` | `0x19F2d083BF21Bb7eB95893aDc28D0D9Cb61F22Bf` |

## Key decisions and conventions

### Naming
- Product noun: **pass** (not waitlist, not gate, not list)
- Never use "waitlist", "join", "spot", "sybil-resistant" in user-facing copy
- Action verbs: "prove", "verify", "get your pass", "deploy a pass"
- Error names in contracts (`AlreadyVerified`, `SignetWrongExchange`, etc.) are kept as-is

### Architecture
- The app is **exclusively for founders/developers**. There is no end-user landing page — users arrive via a shared `/verify?contract=0x…&name=…` link
- The `/verify` page is a self-contained card widget with no navigation chrome
- `ThemeToggle` lives inside the `VerifyFlow` card (not a nav bar)
- The verify card is being built for eventual mobile/embed use

### ZK flow
1. User drops a `.eml` file from any supported exchange
2. ProveStep extracts the DKIM-Signature header, checks `t=` timestamp against the pass cutoff **before** running ZK (fast-fail, saves 60s)
3. If timestamp is valid, snarkjs generates a Groth16 proof client-side (~60s)
4. Proof is submitted to `AttestationCache.attest()` on Base Sepolia
5. After attestation, user calls `SignetPass.verify()` to claim the pass on-chain

### Supported exchanges
Coinbase, Binance, Kraken, OKX, Bybit, Gemini, Robinhood, Crypto.com, KuCoin — each with multiple DKIM pubkey hashes (primary + alternate selectors). See `apps/pass/src/lib/wagmi.ts → SUPPORTED_EXCHANGES`.

### Developer page flow
1. Connect wallet
2. Set project name + optional advanced settings (cutoff date, exchange filter)
3. Deploy pass via factory (one tx)
4. Share link auto-generated
5. Step 2: code snippet (React / Hook / TypeScript) with address auto-filled

### SDK packages
- `@signet/sdk`: `checkPass(options)`, `PASS_ABI`, `SIGNET_ADDRESSES`
- `@signet/react`: `<SignetPass contract wallet>`, `usePass({ contract, wallet })`
- TypeScript path uses raw viem, no SDK needed

### Roadmap (decided, not built yet)
- **Now**: crypto-native, contract-based gates
- **V2**: hosted verification with REST callback + signed JWT (Web2 compatibility)
- **V3**: managed deployment — no wallet required for founders
- **CSV export**: planned for community managers (paused, implement later)

## Environment variables

### apps/pass
```
NEXT_PUBLIC_SIGNET_URL=https://signet.xyz
NEXT_PUBLIC_ARTIFACT_BASE_URL=https://signet.xyz/artifacts
NEXT_PUBLIC_PASS_URL=https://pass.signet.xyz
NEXT_PUBLIC_FACTORY_ADDRESS=0x19F2d083BF21Bb7eB95893aDc28D0D9Cb61F22Bf
NEXT_PUBLIC_ALCHEMY_API_KEY=
NEXT_PUBLIC_WC_PROJECT_ID=
```

### contracts
```
PRIVATE_KEY=         # deployer key (never commit)
SNAPSHOT_CUTOFF=1704067200
BASESCAN_API_KEY=
```

## Running locally

```bash
pnpm install
pnpm dev:all      # protocol (:3000) + pass (:3003) in parallel
pnpm dev          # protocol only
pnpm dev:pass     # pass only
```

apps/pass needs apps/protocol running for ZK artifacts (`/artifacts/signet_email.wasm` + `.zkey`).
