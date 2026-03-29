/**
 * dkim-data.ts
 *
 * Single source of truth for all known exchange DKIM selectors.
 * Imported by both seed-dkim.ts (initial seeding) and monitor-dkim.ts
 * (ongoing rotation monitoring).
 *
 * To add a new exchange or selector: append to EXCHANGE_SELECTORS below.
 * Archive/hardcoded entries go in their respective arrays.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectorEntry {
    exchange: string;
    selector: string;
    domain:   string;
}

export interface ArchiveEntry {
    exchange:  string;
    selector:  string;
    domain:    string;
    note:      string;
    pubkeyB64: string; // raw p= value (base64, no whitespace)
}

export interface HardcodedEntry {
    exchange: string;
    selector: string;
    domain:   string;
    hash:     bigint;
}

// ── Exchange DKIM selectors ───────────────────────────────────────────────────
//
// Selectors sourced from:
//   1. DNS-over-HTTPS queries at seed time (EXCHANGE_SELECTORS)
//   2. ZK Email archive (archive.zk.email) for rotated historical keys (ARCHIVE_SOURCE_KEYS)
//   3. Manual verification for DNS-dead domains (HARDCODED_KEYS)
//
// NOTE: Amazon SES selectors (random UUIDs) cannot be discovered via DNS alone.
// Extract pubSignals[0] from a real proof and register manually via cast:
//   cast send <REGISTRY> "setKey(uint256,bool)" <hash> true --account <keystore>

export const EXCHANGE_SELECTORS: SelectorEntry[] = [
    // ── Live exchanges — Google Workspace DKIM (stable; these rarely rotate) ──
    { exchange: "Coinbase",   selector: "google",                              domain: "coinbase.com"           },
    { exchange: "Coinbase",   selector: "xmk7xv4dzq3ad3l3wrpegkiqkegm4nst",  domain: "info.coinbase.com"      }, // AWS SES, Coinbase-specific
    { exchange: "Binance",    selector: "google",                              domain: "binance.com"            },
    { exchange: "Binance",    selector: "scph0122",                            domain: "mailersp2.binance.com"  }, // Direct TXT, Binance-owned 1024-bit
    { exchange: "Binance",    selector: "gxhqvjfn7nxg45wwesxakydswcc4dbhb",  domain: "ses.binance.com"        }, // AWS SES, Binance-specific 2048-bit
    { exchange: "Binance",    selector: "mail",                                domain: "mailer3.binance.com"    }, // Promo mailer 1024-bit
    { exchange: "Binance",    selector: "20170925085502pm",                     domain: "post.binance.com"       }, // 1024-bit RSA; emails may use rsa-sha1 (unprovaable) or rsa-sha256
    { exchange: "Kraken",     selector: "google",                              domain: "kraken.com"             },
    { exchange: "Kraken",     selector: "krs",                                 domain: "kraken.com"             }, // Transactional 1024-bit
    { exchange: "OKX",        selector: "google",                              domain: "okx.com"                },
    { exchange: "OKX",        selector: "s1",                                  domain: "okx.com"                },
    { exchange: "Bybit",      selector: "google",                              domain: "bybit.com"              },
    { exchange: "Gemini",     selector: "google",                              domain: "gemini.com"             },
    { exchange: "Robinhood",  selector: "google",                              domain: "robinhood.com"          },
    { exchange: "Crypto.com", selector: "google",                              domain: "crypto.com"             },
    { exchange: "KuCoin",     selector: "google",                              domain: "kucoin.com"             },
    { exchange: "KuCoin",     selector: "selector1",                           domain: "kucoin.com"             }, // Microsoft 365 (expsg.onmicrosoft.com)
    { exchange: "KuCoin",     selector: "engagelabmail",                       domain: "kucoin.com"             }, // EngageLab transactional 1024-bit

    // ── Defunct — Google Workspace (2048-bit, DNS confirmed live 2026-03) ──
    { exchange: "FTX",        selector: "google",  domain: "ftx.com"            },
    { exchange: "FTX",        selector: "s1",      domain: "ftx.com"            }, // current (Jan 2026+)
    { exchange: "FTX",        selector: "s2",      domain: "ftx.com"            }, // current (Jan 2026+)
    { exchange: "FTX",        selector: "mx",      domain: "ftx.com"            }, // Mimecast
    { exchange: "FTX",        selector: "mte1",    domain: "ftx.com"            }, // Custom transactional
    { exchange: "FTX US",     selector: "google",  domain: "ftx.us"             },
    { exchange: "FTX US",     selector: "s1",      domain: "ftx.us"             },
    { exchange: "Voyager",    selector: "google",  domain: "investvoyager.com"  },
    { exchange: "Voyager",    selector: "s1",      domain: "investvoyager.com"  },
    { exchange: "Voyager",    selector: "s2",      domain: "investvoyager.com"  },
    { exchange: "BlockFi",    selector: "google",  domain: "blockfi.com"        },
    { exchange: "BlockFi",    selector: "s1",      domain: "blockfi.com"        },
    { exchange: "Terra/Luna", selector: "google",  domain: "terra.money"        },
    { exchange: "Terra/Luna", selector: "s1",      domain: "terra.money"        },
    { exchange: "Terra/Luna", selector: "s2",      domain: "terra.money"        },
    { exchange: "Hodlnaut",   selector: "google",  domain: "hodlnaut.com"       },
    { exchange: "WazirX",     selector: "google",  domain: "wazirx.com"         },
    { exchange: "WazirX",     selector: "k2",      domain: "wazirx.com"         },
    { exchange: "WazirX",     selector: "k3",      domain: "wazirx.com"         }, // current (Nov 2024+)
    { exchange: "WazirX",     selector: "s1",      domain: "wazirx.com"         },
    { exchange: "WazirX",     selector: "w1",      domain: "wazirx.com"         },
    { exchange: "QuadrigaCX", selector: "default", domain: "quadrigacx.com"     }, // same key as google
    { exchange: "Celsius",    selector: "google",  domain: "celsius.network"    }, // 1024-bit
    { exchange: "Vauld",      selector: "google",  domain: "vauld.com"          }, // 1024-bit
    { exchange: "Anchor",     selector: "google",  domain: "anchorprotocol.com" }, // 1024-bit
    { exchange: "DMM Bitcoin", selector: "google", domain: "dmm.com"            },
];

// ── Archive source keys ───────────────────────────────────────────────────────
//
// Historical DKIM keys from the ZK Email archive (archive.zk.email) that have
// since been rotated in DNS. Cover emails signed BEFORE the rotation date.

export const ARCHIVE_SOURCE_KEYS: ArchiveEntry[] = [
    {
        exchange:  "FTX",
        selector:  "s1",
        domain:    "ftx.com",
        note:      "pre-Jan-2026 rotation (lastSeenAt 2025-10-23 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy4pf1wqoFu4UJe3dvc0b+VfY7h53jsHhUnloFSx48T1slZFWEHdLS/+ejs5gRNH1gWFUMrFTQYrjB/9eC0veaVcX2f8YG7Xn3Et5zTYMlnXfOavEAi7hBBZtTb4FmkQesBRTNXN1LXPRwwBn0RyvdMCvLESuSw3e87JqgVe3xtHdKEduWZ8Lr90sjb7IuOI1Qjlyfz4oIyb4JicjYRBx+vFE+e5kCtfuMDJXq97Mo4elgDsiFi23WzDCqfgcGm5pO/m19+P9JQljkwmBZZj7zL/dW9oPtyI/KaB5EE21+Z2bmJ+YmhhptX0oW0PfRQwqk8zWyygFzIKvv7oAVF7EuQIDAQAB",
    },
    {
        exchange:  "FTX",
        selector:  "s2",
        domain:    "ftx.com",
        note:      "pre-Jan-2026 rotation (lastSeenAt 2025-10-23 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt0Vk7hOl9sfHIXAKhb3/Z2W+OjSSxPksQYrMsLWCPksbFvZlsj93YvsBSSzmJ7JnTsmM6tZhNGhWMhQQzC9dQ1ZHx5ALzAjLXMzqEcu8tL6qe5CN6k6gKgzhiRrDyBQ/zKjaoWeIQspF7TwB8ntPnHmIUTCnqsjpdGHx9iU+Bxo+oSs+Ebj/l46cgtEVqGDQY3dQnsVnl43Vd31zvsLEiul2S0JYUMOLRPbbFqVPUqkyQc9kXfak92NSWbP0oS/LTkr5kd2alVA5B13o8LT3VqdSsUN89956vBAxNDfLkJQVZBl436BNAbmu8M9eLz5MpUtL6XjiJ2f9H0J3wNAl/QIDAQAB",
    },
    {
        exchange:  "WazirX",
        selector:  "k3",
        domain:    "wazirx.com",
        note:      "pre-Nov-2024 rotation (lastSeenAt 2024-04-26 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyp0FeijdfInQMrpNaPsImitO70gIGOrm5JaPAEGW3mgFWQqXKcwX3BueAh8K1/9eGudmaIMTEmQ9dZJP22qWDWIGAlhHH91CYENT5zU0T+jXSjUfOjPtiEgHXEIXpPD6mTJm1qMUhcnZs15+m+sUL4LanrdCmVRXJF0i7YDkSRvnqgROi6/aoDx5fQpcHNPTowkg2RLWSrS5JiXNPxk80Rz+p0LmqzB9MCZTov5nliZqlotCRtyhPMlLl0rV9a726nhUi11DKgpLiduBHfJ/BxEvGDs+BzKDGwLSUMJeWQ/axjzT3IVg9CsKuwGieT/Z3Haa82OuiJPvTf8lFWguLwIDAQAB",
    },
    {
        exchange:  "KuCoin",
        selector:  "kuc",
        domain:    "kucoin.com",
        note:      "retired ~Sep 2025 (lastSeenAt 2025-09-22 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtzJek254oHmHCxsfdycuMrzdTU/4yeyg/MMKAirlbx1AQy1gq699DPWujcF+X+sc75MYWxei804etV6LzDE4Grsohe/k31n7E045Y4kCcFMrnUbD5b6eRaIP2cOxn430uhE044SI8T1JdLCg3Y18479fCfu88uFdVBdgrXUClXGX6xdjOjLCJiwNmoIS7CyhmQHIodwS9193K0vMqhT6gEXo87xPvuj3hudvFGlZx+JYWg8WbN12trrAPCstqwlineulsnDbng8iflGkqE6QKyCOA0nVh+3ZpAWcSgsW24tS4ky5cBQIxlPnobhzkKQkCUWVDrmOjqmMmMarBP0nqwIDAQAB",
    },
    {
        exchange:  "KuCoin",
        selector:  "s2",
        domain:    "kucoin.com",
        note:      "retired ~Aug 2025 (lastSeenAt 2025-08-10 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAveEuytQP5erZ/eJrbrYQXev8sxkJtb9nQh1NGB8u/xjE/eC7H0AfvAtscCUssM4uqjqaowFQcHG1Ke1gDAlsZg53HPWAZbsqRwQc4SwZn9fG3+NkV8pMvl+QcEk5Yf5ReixukrBDexONeOViIT5/QAPDPxIRkdhEJRk3v1fUmSh/2GUGl16MmUyVhWopjOO8sdVjbGw3D8dJL4otgFUPYW2KKXHfa2b6myuepLXBE1Z5CnUIKZHHdAdvbSL5gSR2oPYNlFI6zbf1AX6YtIxAXgfdUBZD9tc4Bfb9spYs+otnrR0nQ99Y7LEDA0/dKemF7wq9jnEe7LZSG2GQROMrmwIDAQAB",
    },
    {
        exchange:  "KuCoin",
        selector:  "mkt",
        domain:    "kucoin.com",
        note:      "retired ~Sep 2025 (lastSeenAt 2025-09-16 in ZK Email archive)",
        pubkeyB64: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8FbSJmMaFhvzrr8LaExNc8BUE/UjkP28FG5TzjSznmOtf+1FspIONAwL+hWWulseyrj22ejGJLiuqGMQiXAXbNMYf9n5B+GyapohyS1lX+KjkzfLRVo1JWeC3qyRmAAUOtNZTcW1qaLu7VgoKzSjReHnoTfiya2gknQeTrbaHREhe28lwk+5+Wq2nxys+OAZkEYHEgbZ0pzP4vGzBqmd9HSL1sAv9bk/EJ0UaEp+WMXpPgI6c6sf1emVoUBGVoFCxSsuF+ranD1KE/1Kpa3WbJMfSiWw0NBpcCAnxUFVzfICAUyGFlqyzDd09ncLETs11lKY/VhBy+ubGmdpEPHGwwIDAQAB",
    },
];

// ── Hardcoded keys (DNS-verified manually; intermittent in public resolvers) ──

export const HARDCODED_KEYS: HardcodedEntry[] = [
    {
        exchange: "Mt. Gox",
        selector: "google",
        domain:   "mtgox.com",
        hash:     10560732801385130368664797057956499508696070810578095175177778739135514084161n,
    },
    {
        exchange: "QuadrigaCX",
        selector: "google",
        domain:   "quadrigacx.com",
        hash:     8604074053909990840014584413669623780474180795646426038538351672960093894757n,
    },
];

// ── Predictive selector patterns ──────────────────────────────────────────────
//
// Used by monitor-dkim.ts to proactively check likely next selectors
// before a user hits them.

export interface PredictivePattern {
    exchange: string;
    domain:   string;
    /** Given the currently-known latest selector, generate candidates to try. */
    generate: (knownSelectors: string[]) => string[];
}

export const PREDICTIVE_PATTERNS: PredictivePattern[] = [
    // Cloudflare-style: cf2024-1 → cf2025-1, cf2026-1
    {
        exchange: "Binance",
        domain:   "ses.binance.com",
        generate: () => {
            const year = new Date().getFullYear();
            return [`cf${year}-1`, `cf${year}-2`, `cf${year + 1}-1`];
        },
    },
    // Sequential s1/s2 pattern (FTX, Terra, Voyager, etc.)
    {
        exchange: "FTX",
        domain:   "ftx.com",
        generate: (known) => {
            const max = Math.max(0, ...known.filter(s => /^s\d+$/.test(s)).map(s => parseInt(s.slice(1))));
            return [`s${max + 1}`, `s${max + 2}`];
        },
    },
    {
        exchange: "FTX US",
        domain:   "ftx.us",
        generate: (known) => {
            const max = Math.max(0, ...known.filter(s => /^s\d+$/.test(s)).map(s => parseInt(s.slice(1))));
            return [`s${max + 1}`];
        },
    },
    // Date-based: scph0122 (MMYY) → try upcoming quarters
    {
        exchange: "Binance",
        domain:   "mailersp2.binance.com",
        generate: () => {
            const now  = new Date();
            const results: string[] = [];
            for (let i = 0; i < 4; i++) {
                const d  = new Date(now.getFullYear(), now.getMonth() + i * 3, 1);
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const yy = String(d.getFullYear()).slice(-2);
                results.push(`scph${mm}${yy}`);
            }
            return results;
        },
    },
    // KuCoin sequential
    {
        exchange: "KuCoin",
        domain:   "kucoin.com",
        generate: (known) => {
            const max = Math.max(0, ...known.filter(s => /^selector\d+$/.test(s)).map(s => parseInt(s.replace("selector", ""))));
            return [`selector${max + 1}`, `selector${max + 2}`];
        },
    },
];

// ── Known-selector set (for app-level DNS bypass) ─────────────────────────────
//
// Used by ProveClient and ProveStep to bypass the DNS pre-flight warning
// when a selector is known to be registered on-chain even if DNS is dead.

export const KNOWN_SELECTOR_KEYS: Set<string> = new Set(
    EXCHANGE_SELECTORS.map(e => `${e.selector}._domainkey.${e.domain}`)
);
