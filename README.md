# Signet Pass

Verified access passes powered by ZK email proofs.

A founder deploys a `SignetPass` contract in one transaction, shares a link, and users click it to prove their exchange account age — no email content is ever revealed. The on-chain pass is permanent and reusable across every Signet-gated project.

→ **[pass.signet.xyz](https://pass.signet.xyz)** · Protocol: [signet.xyz](https://signet.xyz)

---

## Monorepo

| Path | Description |
|---|---|
| `apps/web` | Signet protocol app — ZK prover, attestation explorer, docs |
| `apps/pass` | Signet Pass product — deploy, verify, integrate |
| `packages/sdk` | `@signet/sdk` — core TypeScript SDK |
| `packages/react` | `@signet/react` — React component + hook |
| `contracts/` | Solidity contracts (Foundry) |
| `circuits/` | Groth16 ZK circuit (`signet_email.circom`) |
| `scripts/` | DKIM registry seeding + monitoring |

## Quick start

```bash
pnpm install
pnpm dev:all          # web (:3000) + pass (:3003)
```

Copy `apps/pass/.env.local.example` → `apps/pass/.env.local` and fill in your keys.

## Integrate

Install the React package:

```bash
npm install @signet/react
```

Gate any component:

```tsx
import { SignetPass } from "@signet/react"

<SignetPass contract="0xYOUR_PASS" wallet={address}>
  <YourApp />
</SignetPass>
```

Or use the raw hook:

```tsx
import { usePass } from "@signet/react"

const { verified, loading } = usePass({ contract: "0x…", wallet: address })
```

## Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| `AttestationCache` | `0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1` |
| `DKIMRegistry` | `0xd984F26057A990a4f4de5A36faF7968b818BAe46` |
| `SignetPassFactory` | `0x19F2d083BF21Bb7eB95893aDc28D0D9Cb61F22Bf` |

Deploy a new pass via the factory — or use the UI at [pass.signet.xyz/developers](https://pass.signet.xyz/developers).

## Contracts (local)

```bash
cd contracts
forge test
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```
