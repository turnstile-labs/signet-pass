# Signet Pass

**You can fake a retina scan. Not a 5-year receipt.**

Signet Pass turns a ZK email proof into a permanent, reusable on-chain credential. Create a pass in one transaction, share the link — users verify their exchange account age in ~30 seconds, directly in the browser. Nothing leaves their device. No bots. No self-reported claims. No KYC.

**[pass.signet.xyz](https://pass.signet.xyz)**

---

## Why it works

Bot farms spin up thousands of fresh wallets in minutes. Social tasks are automated. CAPTCHAs are solved in bulk. Wallet age is meaningless when wallets are free.

Opening a KYC-gated exchange account years ago required a government ID, a live selfie, and days of verification. That timestamp is an unalterable fact — you cannot manufacture a 2019 Coinbase receipt retroactively. Signet uses that immutable history as the trust primitive.

| Method | What it proves | Farmable? |
|---|---|---|
| Biometrics (World ID) | Uniqueness today | Yes — retina proxies exist |
| Traditional KYC | Legal identity today | Yes — proxy passports exist |
| **Signet** | **Economic participation yesterday** | **No — you can't fake the past** |

---

## How it works

Every email from a major exchange is cryptographically signed by their mail servers using **DKIM**. Signet uses that signature to confirm, with mathematical certainty, that a specific exchange sent an email at an exact time — without reading its contents.

**For a user claiming their pass:**

1. **Export** an old exchange email as `.eml` — welcome, trade confirmation, login alert. Any email from Coinbase, Binance, Kraken, OKX, Bybit, Gemini, or others.
2. **Verify** — the browser checks the DKIM signature against the exchange's public key. No network call, no server.
3. **Prove** — a Groth16 ZK proof is generated locally in ~30 seconds. Only the account age is extracted. Nothing else leaves the device.
4. **Claim** — one transaction writes the attestation on-chain, permanently tied to the wallet. Reusable across every Signet-integrated project, forever.

**For a developer deploying a pass:**

1. Go to [pass.signet.xyz/developers](https://pass.signet.xyz/developers) and connect a wallet.
2. Set a cutoff date and optional exchange filter.
3. One transaction — your `SignetPass` contract is live.
4. Share the link. Users verify, you read the result with a single contract call.

---

## Integrate

```bash
npm install @signet/react
```

**Gate a component:**

```tsx
import { SignetPass } from "@signet/react"

<SignetPass contract="0xYOUR_PASS" wallet={address}>
  <ProtectedContent />
</SignetPass>
```

**Or use the hook:**

```tsx
import { usePass } from "@signet/react"

const { verified, loading } = usePass({ contract: "0xYOUR_PASS", wallet: address })
```

**Backend / API (TypeScript):**

```ts
import { createPublicClient, http } from "viem"
import { baseSepolia } from "viem/chains"
import { SIGNET_PASS_ABI } from "@signet/sdk"

const client = createPublicClient({ chain: baseSepolia, transport: http() })

const verified = await client.readContract({
  address: "0xYOUR_PASS",
  abi: SIGNET_PASS_ABI,
  functionName: "isVerified",
  args: [walletAddress],
})
```

One read call. Zero infrastructure. No vendor that can shut you down.

---

## Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| `AttestationCache` | `0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1` |
| `DKIMRegistry` | `0xd984F26057A990a4f4de5A36faF7968b818BAe46` |
| `SignetPassFactory` | `0x19F2d083BF21Bb7eB95893aDc28D0D9Cb61F22Bf` |

---

## Repository

| Path | Description |
|---|---|
| `apps/pass` | Web app — deploy, verify, dashboard, ZK artifact serving |
| `packages/sdk` | `@signet/sdk` — core TypeScript SDK |
| `packages/react` | `@signet/react` — React component + hook |
| `contracts/` | Solidity contracts (Foundry) |
| `circuits/` | Groth16 ZK circuit (`signet_email.circom`) |
| `scripts/` | DKIM registry seeding and monitoring |

---

## Local development

```bash
pnpm install
cp apps/pass/.env.local.example apps/pass/.env.local
pnpm dev          # → http://localhost:3000
```

**Run contract tests:**

```bash
cd contracts && forge test
```
