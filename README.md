# Signet Pass

> Prove once. Access everywhere.

Signet Pass turns a ZK email proof into a permanent, reusable on-chain credential. A founder deploys a pass contract in one transaction, shares a link, and users verify their exchange account age — no email content is ever revealed. The credential persists across every Signet-gated project.

**[pass.signet.xyz](https://pass.signet.xyz)**

---

## How it works

1. **Deploy** — create a `SignetPass` contract via the UI or factory. Configure exchange filter and account age cutoff.
2. **Share** — paste the generated link anywhere: Twitter, Discord, Notion.
3. **Verify** — users generate a ZK proof from a single email. The proof confirms account age without revealing any personal data.
4. **Access** — the wallet is marked verified on-chain, permanently. No re-verification needed.

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

## Quick start

```bash
pnpm install
cp apps/pass/.env.local.example apps/pass/.env.local
pnpm dev          # → http://localhost:3000
```

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

---

## Contracts

**Base Sepolia (testnet)**

| Contract | Address |
|---|---|
| `AttestationCache` | `0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1` |
| `DKIMRegistry` | `0xd984F26057A990a4f4de5A36faF7968b818BAe46` |
| `SignetPassFactory` | `0x19F2d083BF21Bb7eB95893aDc28D0D9Cb61F22Bf` |

Deploy a new pass via the factory or use the UI at [pass.signet.xyz/developers](https://pass.signet.xyz/developers).

**Local development**

```bash
cd contracts
forge test
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```
