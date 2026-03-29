#!/usr/bin/env tsx
/**
 * seed-dkim.ts
 *
 * Queries DNS-over-HTTPS for known exchange DKIM selectors, computes each
 * key's Poseidon pubkeyHash the same way the ZK circuit does, and registers
 * any previously unknown hashes in the on-chain DKIMRegistry.
 *
 * Usage:
 *   # Preview — fetch DNS, compute hashes, print what would change; no writes
 *   pnpm seed-dkim:dry
 *
 *   # Live run against Base Sepolia (default)
 *   PRIVATE_KEY=0x... pnpm seed-dkim
 *
 *   # Live run against Base Mainnet
 *   PRIVATE_KEY=0x... pnpm seed-dkim -- --network base
 *
 * Environment variables:
 *   PRIVATE_KEY   hex private key of the DKIMRegistry owner (required for live runs)
 *   RPC_URL       custom RPC endpoint (optional — falls back to public Base nodes)
 *
 * === How pubkeyHash is computed ===
 *
 * The ZK circuit runs:
 *   PoseidonLarge(bitsPerChunk=121, chunkSize=17)(rsaModulusChunks)
 *
 * PoseidonLarge merges consecutive chunk pairs to stay within the Poseidon
 * 16-input limit:
 *   halfSize = ceil(17 / 2) = 9
 *   merged[i] = chunk[2i] + 2^121 * chunk[2i+1]   (i = 0..7)
 *   merged[8] = chunk[16]                           (unpaired last chunk)
 *   pubkeyHash = Poseidon(9)(merged)
 *
 * Both 1024-bit and 2048-bit RSA keys are supported — the chunking always
 * produces 17 values (upper chunks are 0 for smaller keys).
 *
 * === Adding new selectors ===
 *
 * Append entries to EXCHANGE_SELECTORS below. The selector and domain come
 * from the DKIM-Signature header in any email from that exchange:
 *   s=<selector>; d=<domain>
 *
 * Selectors backed by Amazon SES rotate; add them by running:
 *   pnpm seed-dkim:dry --selector <sel> --domain <domain>  (not yet implemented)
 * or extract the pubkeyHash from a real proof's pubSignals[0] and register
 * it manually via cast:
 *   cast send <REGISTRY> "setKey(uint256,bool)" <hash> true --account <keystore>
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicKey } from "node:crypto";
import { buildPoseidon } from "circomlibjs";

// ── ZK circuit constants ───────────────────────────────────────────────────────

const CIRCOM_N = 121; // bits per chunk
const CIRCOM_K = 17;  // number of chunks  (n * k = 2057 > 2048)

// ── Protocol constants ────────────────────────────────────────────────────────

const DKIM_REGISTRY: Record<"base_sepolia" | "base", `0x${string}`> = {
    base_sepolia: "0xd984F26057A990a4f4de5A36faF7968b818BAe46",
    base:         "0x0000000000000000000000000000000000000000", // update after mainnet deploy
};

const DKIM_REGISTRY_ABI = parseAbi([
    "function isValid(uint256 pubkeyHash) view returns (bool)",
    "function setKey(uint256 pubkeyHash, bool valid) nonpayable",
    "function setKeys(uint256[] hashes, bool valid) nonpayable",
]);

// ── Exchange DKIM selectors ───────────────────────────────────────────────────
//
// Selectors sourced from:
//   1. DNS-over-HTTPS queries at seed time (EXCHANGE_SELECTORS)
//   2. ZK Email archive (archive.zk.email) for rotated historical keys (ARCHIVE_SOURCE_KEYS)
//   3. Manual verification for DNS-dead domains (HARDCODED_KEYS)
//
// ZK Email archive surveyed 2026-03-09 (defunct exchanges):
//   - FTX: s1/s2 rotated Jan 2026 (old keys needed for pre-rotation emails)
//   - FTX: mx, mte1 selectors discovered (non-google providers)
//   - Celsius: google key is 1024-bit; zendesk1/zendesk2 are 2048-bit alternatives
//   - Vauld: all known keys are 1024-bit (no 2048-bit path yet)
//   - Anchor: google key is 1024-bit (no 2048-bit alternative found)
//   - BlockFi/Voyager: HubSpot hs1/hs2 rotate frequently — pre-collapse keys unknown
//   - DMM Bitcoin: google._domainkey.dmm.com is 2048-bit and DNS-live; k2/k3 are
//     Mailchimp CNAME (shared infra) — excluded like Zendesk keys
//
// ZK Email archive surveyed 2026-03-09 (live Signet exchanges):
//   - Coinbase: google is 1024-bit (current); 2048-bit record is cbam.coinbase.com
//     subdomain — not relevant for regular user emails
//   - Binance: all 2048-bit selectors (gxhqvjfn7nxg..., u4svutkjs5..., i46u...) on
//     binance.com → CloudFront/SendGrid shared — excluded.
//     BUT mailersp2.binance.com scph0122 is a DIRECT TXT record (Binance-owned, not
//     shared) — 1024-bit, same caveat as Celsius/Anchor. Registered.
//   - Bybit: s1/s2/fwcmo.../z7nojmt... → SendGrid/Amazon SES shared — excluded
//   - Gemini: s1 → SendGrid shared — excluded
//   - Robinhood: s1 → SendGrid shared — excluded
//   - Crypto.com: s1 → SendGrid shared — excluded
//   - KuCoin: selector1 = Microsoft 365 (expsg.onmicrosoft.com) — KuCoin-specific ✓
//             kuc/s2/mkt = retired KuCoin-specific keys (DNS removed ~Aug-Sep 2025) ✓
//
// NOTE: Amazon SES selectors (random UUIDs) cannot be discovered via DNS alone.
// Extract pubSignals[0] from a real proof and register manually via cast:
//   cast send <REGISTRY> "setKey(uint256,bool)" <hash> true --account <keystore>
//
// After adding a new hash to DKIMRegistry, also register it in RugSurvivorSBT via:
//   cast send <SBT> "addValidHash(uint256,uint256)" <tokenId> <hash> --account <keystore>
// The SBT now uses a validHashes[tokenId][hash] → bool mapping (not 1:1 domainHashes),
// so multiple selectors per exchange are fully supported.

interface SelectorEntry {
    exchange: string;
    selector: string;
    domain:   string;
}

const EXCHANGE_SELECTORS: SelectorEntry[] = [
    // ── Live exchanges — Google Workspace DKIM (stable; these rarely rotate) ──
    { exchange: "Coinbase",   selector: "google", domain: "coinbase.com"        },
    { exchange: "Binance",    selector: "google",   domain: "binance.com"              },
    // mailersp2.binance.com — Binance marketing/notification subdomain.
    // scph0122 is a direct TXT record (Binance-owned, not shared SendGrid like
    // scph0122._domainkey.binance.com which CNAMEs to CloudFront/SendGrid shared).
    // 1024-bit RSA — same caveat as Celsius/Anchor/Vauld; account required to receive.
    // info.coinbase.com — Coinbase transactional notifications via AWS SES, Coinbase-specific subdomain.
    // Selector xmk7xv4dzq3ad3l3wrpegkiqkegm4nst confirmed live 2026-03-17 via DNS.
    { exchange: "Coinbase",   selector: "xmk7xv4dzq3ad3l3wrpegkiqkegm4nst", domain: "info.coinbase.com" },
    { exchange: "Binance",    selector: "scph0122",                          domain: "mailersp2.binance.com" },
    // ses.binance.com — Binance account security notifications (2048-bit AWS SES, Binance-specific).
    // Selector gxhqvjfn7nxg45wwesxakydswcc4dbhb confirmed live 2026-03-17 via DNS.
    { exchange: "Binance",    selector: "gxhqvjfn7nxg45wwesxakydswcc4dbhb", domain: "ses.binance.com" },
    // mailer3.binance.com — Binance promo/competition mailer (1024-bit, DNS live 2026-03).
    { exchange: "Binance",    selector: "mail",                               domain: "mailer3.binance.com" },
    // post.binance.com — Binance transactional mailer (1024-bit, selector 20170925085502pm live 2026-03).
    // Note: emails signed with a=rsa-sha1 are circuit-incompatible; rsa-sha256 emails can be proved.
    { exchange: "Binance",    selector: "20170925085502pm",                   domain: "post.binance.com" },
    { exchange: "Kraken",     selector: "google", domain: "kraken.com"          },
    { exchange: "Kraken",     selector: "krs",    domain: "kraken.com"          },  // Kraken transactional subdomain (1024-bit)
    { exchange: "OKX",        selector: "google", domain: "okx.com"             },
    { exchange: "Bybit",      selector: "google", domain: "bybit.com"           },
    { exchange: "Gemini",     selector: "google", domain: "gemini.com"          },
    { exchange: "Robinhood",  selector: "google", domain: "robinhood.com"       },
    { exchange: "Crypto.com", selector: "google", domain: "crypto.com"          },
    { exchange: "KuCoin",     selector: "google",       domain: "kucoin.com"    },
    { exchange: "KuCoin",     selector: "selector1",    domain: "kucoin.com"    },  // Microsoft 365 (expsg.onmicrosoft.com) — KuCoin-specific
    { exchange: "KuCoin",     selector: "engagelabmail", domain: "kucoin.com"   },  // EngageLab transactional (1024-bit, DNS live 2026-03)
    { exchange: "OKX",        selector: "s1",        domain: "okx.com"          },

    // ── Defunct — Google Workspace (2048-bit, DNS confirmed live 2026-03) ──
    { exchange: "FTX",        selector: "google", domain: "ftx.com"             },
    { exchange: "FTX US",     selector: "google", domain: "ftx.us"              },
    { exchange: "Voyager",    selector: "google", domain: "investvoyager.com"   },
    { exchange: "BlockFi",    selector: "google", domain: "blockfi.com"         },
    { exchange: "Terra/Luna", selector: "google", domain: "terra.money"         },
    { exchange: "Hodlnaut",   selector: "google", domain: "hodlnaut.com"        },
    { exchange: "WazirX",     selector: "google", domain: "wazirx.com"          },
    // QuadrigaCX — both google and default selectors share the same 2048-bit RSA key
    { exchange: "QuadrigaCX", selector: "default", domain: "quadrigacx.com"     },  // DNS live 2026-03; same key as google
    // Mt. Gox — HARDCODED_KEYS for legacy google hash; SES selectors (1024-bit) not yet registerable

    // ── Defunct — 1024-bit Google keys (registered for completeness; ──────────
    //    circuit compatibility unverified — may need 1024-bit circuit variant)
    { exchange: "Celsius",    selector: "google", domain: "celsius.network"     },
    { exchange: "Vauld",      selector: "google", domain: "vauld.com"           },
    { exchange: "Anchor",     selector: "google", domain: "anchorprotocol.com"  },

    // ── FTX — additional selectors (ZK Email archive, 2026-03-09) ────────────
    //    s1/s2 are the most likely user-facing selectors (account + transaction
    //    emails). mx is likely Mimecast. mte1 is a custom transactional sender.
    //    NOTE: s1 and s2 rotated Jan 2026 — current DNS value is the NEW key.
    //    Pre-rotation emails (2022-2025) need the OLD key → ARCHIVE_SOURCE_KEYS.
    { exchange: "FTX",        selector: "s1",     domain: "ftx.com"             },  // current (Jan 2026+)
    { exchange: "FTX",        selector: "s2",     domain: "ftx.com"             },  // current (Jan 2026+)
    { exchange: "FTX",        selector: "mx",     domain: "ftx.com"             },  // Mimecast / MX provider
    { exchange: "FTX",        selector: "mte1",   domain: "ftx.com"             },  // custom transactional

    // ── FTX US — additional selectors ────────────────────────────────────────
    { exchange: "FTX US",     selector: "s1",     domain: "ftx.us"              },  // stable, seen 2024-2026

    // ── Terra / Luna — SES-style selectors ───────────────────────────────────
    { exchange: "Terra/Luna", selector: "s1",     domain: "terra.money"         },
    { exchange: "Terra/Luna", selector: "s2",     domain: "terra.money"         },

    // ── BlockFi — additional selectors ───────────────────────────────────────
    //    s1 is a stable SES-style key. hs1/hs2 (HubSpot) rotate frequently —
    //    collapse-era versions (Nov 2022 – Jan 2024) are in ARCHIVE_SOURCE_KEYS.
    { exchange: "BlockFi",    selector: "s1",     domain: "blockfi.com"         },

    // ── Voyager — additional selectors ───────────────────────────────────────
    { exchange: "Voyager",    selector: "s1",     domain: "investvoyager.com"   },
    { exchange: "Voyager",    selector: "s2",     domain: "investvoyager.com"   },
    // zendesk1/zendesk2 intentionally excluded — Zendesk uses shared DKIM
    // infrastructure: the same RSA key signs emails for ALL Zendesk customers.
    // Adding the hash to DKIMRegistry is harmless; adding it to SBT.validHashes
    // is not — a user with a Voyager Zendesk email could claim a Celsius badge
    // (and vice versa) because the pubkeyHash is identical across all exchanges.

    // ── Celsius — google key is 1024-bit; no provable 2048-bit account key yet ─
    // zendesk1/zendesk2 excluded for same shared-key reason as Voyager above.

    // ── Hodlnaut — google key registered above; zendesk keys excluded ────────

    // ── WazirX — additional selectors ────────────────────────────────────────
    //    k2 is stable. k3 rotated Nov 2024 — old version in ARCHIVE_SOURCE_KEYS.
    //    zendesk1/zendesk2 excluded (shared Zendesk key — see Voyager note above).
    { exchange: "WazirX",     selector: "k2",     domain: "wazirx.com"          },
    { exchange: "WazirX",     selector: "k3",     domain: "wazirx.com"          },  // current (Nov 2024+)
    { exchange: "WazirX",     selector: "s1",     domain: "wazirx.com"          },
    { exchange: "WazirX",     selector: "w1",     domain: "wazirx.com"          },

    // ── DMM Bitcoin — collapsed Dec 2024 (hacked May 2024 by Lazarus Group) ──
    //    User emails are signed under the parent dmm.com Google Workspace key.
    //    k2/k3 selectors CNAME to dkim2.mcsv.net / dkim3.mcsv.net (Mailchimp
    //    shared infrastructure) — excluded for the same reason as Zendesk keys.
    { exchange: "DMM Bitcoin", selector: "google", domain: "dmm.com"            },

    // Add more entries here as you discover selectors from real emails.
];

// ── Archive source keys ───────────────────────────────────────────────────────
//
// Historical DKIM keys from the ZK Email archive (archive.zk.email) that have
// since been rotated in DNS. The `p=` base64 value is taken directly from the
// archive response and hashed the same way as live DNS keys.
//
// These cover emails signed BEFORE the rotation date. Users with older emails
// (which is the common case for collapse-era proofs) need these keys registered.

interface ArchiveEntry {
    exchange:  string;
    selector:  string;
    domain:    string;
    note:      string;
    pubkeyB64: string;   // raw p= value (base64, no whitespace)
}

const ARCHIVE_SOURCE_KEYS: ArchiveEntry[] = [
    // FTX s1 — active until ~Oct 2025, covers 2022-2025 account emails
    {
        exchange:  "FTX",
        selector:  "s1",
        domain:    "ftx.com",
        note:      "pre-Jan-2026 rotation (lastSeenAt 2025-10-23 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy4pf1wqoFu4UJe3dvc0b+VfY7h53jsHhUnloFSx48T1slZFWEHdLS/+ejs5gRNH1gWFUMrFTQYrjB/9eC0veaVcX2f8YG7Xn3Et5zTYMlnXfOavEAi7hBBZtTb4FmkQesBRTNXN1LXPRwwBn0RyvdMCvLESuSw3e87JqgVe3xtHdKEduWZ8Lr90sjb7IuOI1Qjlyfz4oIyb4JicjYRBx+vFE+e5kCtfuMDJXq97Mo4elgDsiFi23WzDCqfgcGm5pO/m19+P9JQljkwmBZZj7zL/dW9oPtyI/KaB5EE21+Z2bmJ+YmhhptX0oW0PfRQwqk8zWyygFzIKvv7oAVF7EuQIDAQAB",
    },
    // FTX s2 — active until ~Oct 2025, covers 2022-2025 account emails
    {
        exchange:  "FTX",
        selector:  "s2",
        domain:    "ftx.com",
        note:      "pre-Jan-2026 rotation (lastSeenAt 2025-10-23 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt0Vk7hOl9sfHIXAKhb3/Z2W+OjSSxPksQYrMsLWCPksbFvZlsj93YvsBSSzmJ7JnTsmM6tZhNGhWMhQQzC9dQ1ZHx5ALzAjLXMzqEcu8tL6qe5CN6k6gKgzhiRrDyBQ/zKjaoWeIQspF7TwB8ntPnHmIUTCnqsjpdGHx9iU+Bxo+oSs+Ebj/l46cgtEVqGDQY3dQnsVnl43Vd31zvsLEiul2S0JYUMOLRPbbFqVPUqkyQc9kXfak92NSWbP0oS/LTkr5kd2alVA5B13o8LT3VqdSsUN89956vBAxNDfLkJQVZBl436BNAbmu8M9eLz5MpUtL6XjiJ2f9H0J3wNAl/QIDAQAB",
    },
    // WazirX k3 — first version, active Apr 2024 – Nov 2024
    {
        exchange:  "WazirX",
        selector:  "k3",
        domain:    "wazirx.com",
        note:      "pre-Nov-2024 rotation (lastSeenAt 2024-04-26 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyp0FeijdfInQMrpNaPsImitO70gIGOrm5JaPAEGW3mgFWQqXKcwX3BueAh8K1/9eGudmaIMTEmQ9dZJP22qWDWIGAlhHH91CYENT5zU0T+jXSjUfOjPtiEgHXEIXpPD6mTJm1qMUhcnZs15+m+sUL4LanrdCmVRXJF0i7YDkSRvnqgROi6/aoDx5fQpcHNPTowkg2RLWSrS5JiXNPxk80Rz+p0LmqzB9MCZTov5nliZqlotCRtyhPMlLl0rV9a726nhUi11DKgpLiduBHfJ/BxEvGDs+BzKDGwLSUMJeWQ/axjzT3IVg9CsKuwGieT/Z3Haa82OuiJPvTf8lFWguLwIDAQAB",
    },
    // KuCoin kuc — custom KuCoin sending key, retired ~Sep 2025
    {
        exchange:  "KuCoin",
        selector:  "kuc",
        domain:    "kucoin.com",
        note:      "retired ~Sep 2025 (lastSeenAt 2025-09-22 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtzJek254oHmHCxsfdycuMrzdTU/4yeyg/MMKAirlbx1AQy1gq699DPWujcF+X+sc75MYWxei804etV6LzDE4Grsohe/k31n7E045Y4kCcFMrnUbD5b6eRaIP2cOxn430uhE044SI8T1JdLCg3Y18479fCfu88uFdVBdgrXUClXGX6xdjOjLCJiwNmoIS7CyhmQHIodwS9193K0vMqhT6gEXo87xPvuj3hudvFGlZx+JYWg8WbN12trrAPCstqwlineulsnDbng8iflGkqE6QKyCOA0nVh+3ZpAWcSgsW24tS4ky5cBQIxlPnobhzkKQkCUWVDrmOjqmMmMarBP0nqwIDAQAB",
    },
    // KuCoin s2 — custom KuCoin sending key, retired ~Aug 2025
    {
        exchange:  "KuCoin",
        selector:  "s2",
        domain:    "kucoin.com",
        note:      "retired ~Aug 2025 (lastSeenAt 2025-08-10 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAveEuytQP5erZ/eJrbrYQXev8sxkJtb9nQh1NGB8u/xjE/eC7H0AfvAtscCUssM4uqjqaowFQcHG1Ke1gDAlsZg53HPWAZbsqRwQc4SwZn9fG3+NkV8pMvl+QcEk5Yf5ReixukrBDexONeOViIT5/QAPDPxIRkdhEJRk3v1fUmSh/2GUGl16MmUyVhWopjOO8sdVjbGw3D8dJL4otgFUPYW2KKXHfa2b6myuepLXBE1Z5CnUIKZHHdAdvbSL5gSR2oPYNlFI6zbf1AX6YtIxAXgfdUBZD9tc4Bfb9spYs+otnrR0nQ99Y7LEDA0/dKemF7wq9jnEe7LZSG2GQROMrmwIDAQAB",
    },
    // KuCoin mkt — marketing sending key, retired ~Sep 2025
    {
        exchange:  "KuCoin",
        selector:  "mkt",
        domain:    "kucoin.com",
        note:      "retired ~Sep 2025 (lastSeenAt 2025-09-16 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8FbSJmMaFhvzrr8LaExNc8BUE/UjkP28FG5TzjSznmOtf+1FspIONAwL+hWWulseyrj22ejGJLiuqGMQiXAXbNMYf9n5B+GyapohyS1lX+KjkzfLRVo1JWeC3qyRmAAUOtNZTcW1qaLu7VgoKzSjReHnoTfiya2gknQeTrbaHREhe28lwk+5+Wq2nxys+OAZkEYHEgbZ0pzP4vGzBqmd9HSL1sAv9bk/EJ0UaEp+WMXpPgI6c6sf1emVoUBGVoFCxSsuF+ranD1KE/1Kpa3WbJMfSiWw0NBpcCAnxUFVzfICAUyGFlqyzDd09ncLETs11lKY/VhBy+ubGmdpEPHGwwIDAQAB",
    },
    // NOTE: Celsius zendesk1 (archive first version, Apr 2024) was previously
    // listed here but is a Zendesk shared infrastructure key — same underlying
    // RSA key used across all Zendesk customers. Excluded to prevent cross-exchange
    // badge claims. See EXCHANGE_SELECTORS comment on zendesk exclusion.
];

// ── Hardcoded keys (DNS-verified manually; intermittent in public resolvers) ──
//
// Keys here were confirmed via `dig` but don't resolve reliably through
// Google/Cloudflare DoH. The p= values were captured on 2026-03-09.
// pubkeyHash is pre-computed and verified against the circuit.

interface HardcodedEntry {
    exchange: string;
    selector: string;
    domain:   string;
    hash:     bigint;
}

const HARDCODED_KEYS: HardcodedEntry[] = [
    // Mt. Gox — google._domainkey.mtgox.com is now DNS-dead (NXDOMAIN as of 2026-03).
    // Active trustee emails use Amazon SES with random UUID selectors (1024-bit RSA),
    // which are incompatible with the current 2048-bit ZK circuit.
    // This hash is kept for any pre-2019 emails that may have used the google key.
    // Badge UI marks Mt. Gox as "proof pending" until a 1024-bit circuit ships.
    {
        exchange: "Mt. Gox",
        selector: "google",
        domain:   "mtgox.com",
        hash:     10560732801385130368664797057956499508696070810578095175177778739135514084161n,
    },
    // QuadrigaCX — google._domainkey.quadrigacx.com (DNS intermittent post-bankruptcy)
    // The default._domainkey.quadrigacx.com selector is also live in DNS and hashes
    // to the same value (same underlying RSA key published under both selector names).
    {
        exchange: "QuadrigaCX",
        selector: "google",
        domain:   "quadrigacx.com",
        hash:     8604074053909990840014584413669623780474180795646426038538351672960093894757n,
    },
];

// ── Poseidon pubkeyHash ───────────────────────────────────────────────────────

let _poseidon: Awaited<ReturnType<typeof buildPoseidon>> | null = null;

async function getPoseidon() {
    if (!_poseidon) _poseidon = await buildPoseidon();
    return _poseidon;
}

/**
 * Replicates the ZK circuit's PoseidonLarge(n, k)(chunks):
 *   halfSize = ceil(k / 2)
 *   merged[i] = chunk[2i] + 2^n * chunk[2i+1]   for i < halfSize−1 (or k even)
 *   merged[halfSize−1] = chunk[k−1]              when k is odd
 *   return Poseidon(halfSize)(merged)
 */
async function poseidonLargeCircuit(chunks: bigint[], n: number): Promise<bigint> {
    const poseidon  = await getPoseidon();
    const k         = chunks.length;
    const halfSize  = Math.floor(k / 2) + (k % 2); // ceil(k/2)
    const twoToN    = 1n << BigInt(n);
    const merged: bigint[] = [];

    for (let i = 0; i < halfSize; i++) {
        if (i === halfSize - 1 && k % 2 === 1) {
            // Unpaired last chunk
            merged.push(chunks[k - 1]);
        } else {
            merged.push(chunks[2 * i] + twoToN * chunks[2 * i + 1]);
        }
    }

    const hash = poseidon(merged);
    return poseidon.F.toObject(hash) as bigint;
}

/** Splits a bigint into k chunks of n bits each (little-endian). */
function bigIntToChunks(value: bigint, n: number, k: number): bigint[] {
    const mask   = (1n << BigInt(n)) - 1n;
    const chunks: bigint[] = [];
    for (let i = 0; i < k; i++) {
        chunks.push((value >> BigInt(i * n)) & mask);
    }
    return chunks;
}

/** Computes the Poseidon pubkeyHash exactly as the ZK circuit does. */
async function computePubkeyHash(modulus: bigint): Promise<bigint> {
    const chunks = bigIntToChunks(modulus, CIRCOM_N, CIRCOM_K);
    return poseidonLargeCircuit(chunks, CIRCOM_N);
}

// ── DNS-over-HTTPS ─────────────────────────────────────────────────────────────

async function fetchDkimTxt(selector: string, domain: string): Promise<string | null> {
    const name = `${selector}._domainkey.${domain}`;

    // Try Google DoH first, fall back to Cloudflare if not found
    const resolvers = [
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    ];

    for (const url of resolvers) {
        let json: any;
        try {
            const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
            if (!res.ok) continue;
            json = await res.json();
        } catch {
            continue;
        }

        if (json.Status !== 0 || !json.Answer) continue;

        // Concatenate TXT chunks; strip surrounding quotes added by the API
        const txt = (json.Answer as any[])
            .filter((a) => a.type === 16)
            .map((a) => (a.data as string).replace(/"/g, "").replace(/\s+/g, ""))
            .join("");

        if (txt) return txt;
    }

    return null;
}

// ── RSA modulus extraction ────────────────────────────────────────────────────

/**
 * Parses the `p=` base64 field in a DKIM TXT record and returns the RSA
 * modulus as a BigInt.  Returns null for Ed25519, empty (revoked), or
 * records that aren't DKIM keys at all (e.g. SPF records).
 */
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

// ── Main ──────────────────────────────────────────────────────────────────────

interface KeyResult {
    exchange:          string;
    selector:          string;
    domain:            string;
    hash:              bigint | null;
    alreadyRegistered: boolean;
    note?:             string;
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
    console.log(`║       Signet DKIM Registry Seeder        ║`);
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

    // ── Warm up Poseidon (loads wasm constants once) ────────────────────────
    process.stdout.write("  Initialising Poseidon…");
    await getPoseidon();
    console.log(" done\n");

    const results: KeyResult[] = [];

    console.log("── Fetching & hashing DKIM keys from DNS ────────────────\n");

    // Inject hardcoded keys first (no DNS fetch needed)
    for (const entry of HARDCODED_KEYS) {
        const label = `${entry.exchange} (${entry.selector}._domainkey.${entry.domain}) [hardcoded]`;
        process.stdout.write(`  ${label.padEnd(65)} `);

        const onChain = await publicClient.readContract({
            address:      registry,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "isValid",
            args:         [entry.hash],
        }) as boolean;

        process.stdout.write(`${onChain ? "REGISTERED ✓" : "new         "} — ${entry.hash}\n`);
        results.push({ ...entry, hash: entry.hash, alreadyRegistered: onChain });
    }

    // Archive source keys — parse p= values from ZK Email archive
    for (const entry of ARCHIVE_SOURCE_KEYS) {
        const label = `${entry.exchange} (${entry.selector}._domainkey.${entry.domain}) [archive]`;
        process.stdout.write(`  ${label.padEnd(65)} `);

        const modulus = extractRsaModulus(`k=rsa; p=${entry.pubkeyB64}`);
        if (!modulus) {
            process.stdout.write(`SKIP — could not parse pubkey\n`);
            results.push({ ...entry, hash: null, alreadyRegistered: false, note: "pubkey parse failed" });
            continue;
        }

        const hash    = await computePubkeyHash(modulus);
        const onChain = await publicClient.readContract({
            address:      registry,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "isValid",
            args:         [hash],
        }) as boolean;

        process.stdout.write(`${onChain ? "REGISTERED ✓" : "new         "} — ${hash}\n`);
        results.push({ ...entry, hash, alreadyRegistered: onChain, note: entry.note });
    }

    for (const entry of EXCHANGE_SELECTORS) {
        const dnsName = `${entry.selector}._domainkey.${entry.domain}`;
        const label   = `${entry.exchange} (${dnsName})`;
        process.stdout.write(`  ${label.padEnd(55)} `);

        const txt = await fetchDkimTxt(entry.selector, entry.domain);
        if (!txt) {
            process.stdout.write("NOT FOUND\n");
            results.push({ ...entry, hash: null, alreadyRegistered: false, note: "DNS record not found" });
            continue;
        }

        const modulus = extractRsaModulus(txt);
        if (!modulus) {
            // Could be SPF record, Ed25519, or revoked key
            const hint = txt.startsWith("v=spf") ? "SPF record (wrong TXT)" : "not RSA / revoked";
            process.stdout.write(`SKIP — ${hint}\n`);
            results.push({ ...entry, hash: null, alreadyRegistered: false, note: hint });
            continue;
        }

        const hash = await computePubkeyHash(modulus);

        const onChain = await publicClient.readContract({
            address:      registry,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "isValid",
            args:         [hash],
        }) as boolean;

        process.stdout.write(`${onChain ? "REGISTERED ✓" : "new         "} — ${hash}\n`);
        results.push({ ...entry, hash, alreadyRegistered: onChain });
    }

    // ── Summary ────────────────────────────────────────────────────────────────

    const newKeys    = results.filter((r) => r.hash !== null && !r.alreadyRegistered);
    const registered = results.filter((r) => r.alreadyRegistered);
    const skipped    = results.filter((r) => r.hash === null);

    console.log(`\n── Summary ──────────────────────────────────────────────`);
    console.log(`  Already registered:  ${registered.length}`);
    console.log(`  New keys to add:     ${newKeys.length}`);
    console.log(`  Not found / skipped: ${skipped.length}`);

    if (newKeys.length > 0) {
        console.log("\n  New keys:");
        for (const k of newKeys) {
            console.log(`    ${k.exchange} — ${k.selector}._domainkey.${k.domain}`);
            console.log(`      hash: ${k.hash}`);
        }
    }

    if (skipped.length > 0) {
        console.log("\n  Skipped:");
        for (const k of skipped) {
            console.log(`    ${k.exchange} — ${k.selector}._domainkey.${k.domain}: ${k.note}`);
        }
    }

    if (newKeys.length === 0) {
        console.log("\n  Registry is up to date — nothing to register.\n");
        return;
    }

    if (isDryRun) {
        console.log(`\n  [DRY RUN] Re-run without --dry-run to register ${newKeys.length} key(s).\n`);
        return;
    }

    // ── Register on-chain ────────────────────────────────────────────────────

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
        const base = network === "base"
            ? "https://basescan.org/tx/"
            : "https://sepolia.basescan.org/tx/";
        console.log(`\n  ${hashes.length} key(s) registered.\n  ${base}${txHash}\n`);
    } else {
        console.error("\n  Transaction reverted.\n");
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
