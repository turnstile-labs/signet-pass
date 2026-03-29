import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { SIGNET_ADDRESSES as _SIGNET_ADDRESSES, ATTESTATION_CACHE_ABI } from "@signet/sdk";

export { ATTESTATION_CACHE_ABI } from "@signet/sdk";

export const ATTESTATION_CACHE_ADDRESS = _SIGNET_ADDRESSES.baseSepolia;

// Factory is deployed by Signet — treasury and fee are baked in.
// Founders only configure cutoff and exchange filter.
export const FACTORY_ADDRESS = (
    process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? ""
) as `0x${string}`;

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";

export function getPublicClient() {
    return createPublicClient({
        chain:     baseSepolia,
        transport: http(
            alchemyKey
                ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
                : "https://sepolia.base.org"
        ),
    });
}

// ── Supported exchanges ───────────────────────────────────────────────────────
// Each exchange lists ALL valid DKIM pubkey hashes (primary + alternate selectors).
// When a developer selects an exchange, every hash is written to allowedHashes[]
// so users are never rejected due to email-key variant differences.
// Hash values synced from @signet/sdk LIVE_EXCHANGE_HASHES.

export const SUPPORTED_EXCHANGES = [
    {
        id:     "any",
        label:  "Any exchange",
        domain: null as string | null,
        hashes: [] as readonly bigint[],
    },
    {
        id:     "coinbase",
        label:  "Coinbase",
        domain: "coinbase.com",
        hashes: [
            12478993793821588666622656907431727313282495324428978778213333200202582976087n, // google._domainkey.coinbase.com
            19806930313339437892543285869542575252100319438226679350463646898451946018980n, // info.coinbase.com SES subdomain
        ] as const,
    },
    {
        id:     "binance",
        label:  "Binance",
        domain: "binance.com",
        hashes: [
             7530370953244161785305698736227894091331396871750461845654044902833037341886n, // google._domainkey.binance.com
             5211360840266555668934225377327267216278764602914790735918281919375098884960n, // mailersp2 subdomain
            11386741564238666620858285565730877046054953351540032615456661840837574366512n, // SES subdomain
            16963075529282339495337551812437626768485281387098062695261681001943365649165n, // mailer3 subdomain
             9875585885503178472458319649316448599182761947522549893373005256307473897762n, // post subdomain
        ] as const,
    },
    {
        id:     "kraken",
        label:  "Kraken",
        domain: "kraken.com",
        hashes: [
            4477281523986306060851616083512793067969394548081436960153957673746589703409n, // google._domainkey.kraken.com
           17435802328349134093238821880640718843412956424088016714356511044999990791754n, // krs._domainkey.kraken.com
        ] as const,
    },
    {
        id:     "okx",
        label:  "OKX",
        domain: "okx.com",
        hashes: [
            6087015245241216128247766011539286654729248409476150086529922054622136325966n, // google._domainkey.okx.com
            3724273636662862511108242140099137256880169760227353900550208597187269253457n, // s1._domainkey.okx.com
        ] as const,
    },
    {
        id:     "bybit",
        label:  "Bybit",
        domain: "bybit.com",
        hashes: [
            7986170548142533905024073588893793486613773949529266370021505426939871078647n, // google._domainkey.bybit.com
        ] as const,
    },
    {
        id:     "gemini",
        label:  "Gemini",
        domain: "gemini.com",
        hashes: [
            16316796790088203292157090937558982184416615752548107725939943272321938601396n, // google._domainkey.gemini.com
        ] as const,
    },
    {
        id:     "robinhood",
        label:  "Robinhood",
        domain: "robinhood.com",
        hashes: [
            7019150618836442810941204799616816398863719229496820525963187936340264179826n, // google._domainkey.robinhood.com
        ] as const,
    },
    {
        id:     "cryptoCom",
        label:  "Crypto.com",
        domain: "crypto.com",
        hashes: [
            8188481930121974683479917529320145251421776358134464229461597154866957184393n, // google._domainkey.crypto.com
        ] as const,
    },
    {
        id:     "kucoin",
        label:  "KuCoin",
        domain: "kucoin.com",
        hashes: [
            10168679144983397166085511337407953118160341388600226133510335114685233743051n, // google._domainkey.kucoin.com
            18341902629066994389013891671846108822569422681843009915600085949904203301480n, // Microsoft 365 selector
             1463336852737323141752389940153716620542534116632479001591198198292743799953n, // kuc selector (retired)
            19099778266458280452207864265643828327196865215412234994511064095837130548792n, // s2 selector (retired)
             3747560782515219361431438135528798416189021292952488411162012552635244112764n, // mkt selector (retired)
             5322664242892396143952195593217444709779166141856011629709952967845466916475n, // EngageLab
        ] as const,
    },
] as const;

export type ExchangeId = (typeof SUPPORTED_EXCHANGES)[number]["id"];

/** Map any pubkeyHash back to its exchange (checks all alternate keys). */
export function hashToExchange(hash: bigint) {
    return SUPPORTED_EXCHANGES.find(
        e => e.id !== "any" && (e.hashes as readonly bigint[]).includes(hash)
    ) ?? null;
}

/**
 * Given the contract's allowedHashes array, return unique exchange labels.
 * Deduplicates so e.g. two Coinbase hashes produce one "Coinbase" label.
 */
export function hashesToLabels(hashes: bigint[]): string[] {
    if (hashes.length === 0) return [];
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const h of hashes) {
        const ex = hashToExchange(h);
        if (ex && !seen.has(ex.id)) {
            seen.add(ex.id);
            labels.push(ex.label);
        }
    }
    return labels;
}

/**
 * Given the contract's allowedHashes, return unique domain strings (e.g. "coinbase.com").
 * Used by ProveStep to validate that the uploaded email is from an accepted exchange.
 */
export function hashesToDomains(hashes: bigint[]): string[] {
    if (hashes.length === 0) return [];
    const seen = new Set<string>();
    const domains: string[] = [];
    for (const h of hashes) {
        const ex = hashToExchange(h);
        if (ex?.domain && !seen.has(ex.id)) {
            seen.add(ex.id);
            domains.push(ex.domain);
        }
    }
    return domains;
}

/**
 * Given selected exchange IDs, return the flat list of all their hashes.
 * Pass this to the factory's allowedHashes[] parameter when deploying.
 */
export function exchangeIdsToHashes(ids: string[]): bigint[] {
    return SUPPORTED_EXCHANGES
        .filter(e => ids.includes(e.id) && e.id !== "any")
        .flatMap(e => [...e.hashes]);
}

// ── Signet Pass ABI ───────────────────────────────────────────────────────────

export const SIGNET_PASS_ABI = [
    { inputs: [],                                  name: "cutoff",           outputs: [{ type: "uint256" }], stateMutability: "view",    type: "function" },
    { inputs: [],                                  name: "feePerCheck",      outputs: [{ type: "uint256" }], stateMutability: "view",    type: "function" },
    { inputs: [],                                  name: "treasury",         outputs: [{ type: "address" }], stateMutability: "view",    type: "function" },
    { inputs: [],                                  name: "getAllowedHashes", outputs: [{ type: "uint256[]"}], stateMutability: "view",   type: "function" },
    { inputs: [{ type: "address", name: "wallet" }], name: "isVerified",    outputs: [{ type: "bool"    }], stateMutability: "view",    type: "function" },
    { inputs: [{ type: "address", name: "wallet" }], name: "isEligible",    outputs: [{ type: "bool"    }], stateMutability: "view",    type: "function" },
    { inputs: [],                                  name: "verify",           outputs: [],                    stateMutability: "payable", type: "function" },
    { anonymous: false, inputs: [{ indexed: true, name: "wallet", type: "address" }], name: "Verified", type: "event" },
    { inputs: [{ name: "sent",   type: "uint256" }, { name: "required", type: "uint256" }], name: "InsufficientFee",   type: "error" },
    { inputs: [{ name: "wallet", type: "address" }],                                        name: "AlreadyVerified",   type: "error" },
    { inputs: [{ name: "wallet", type: "address" }],                                        name: "SignetNoAttestation",  type: "error" },
    { inputs: [{ name: "wallet", type: "address" }, { name: "emailTimestamp", type: "uint256" }, { name: "cutoff", type: "uint256" }], name: "SignetEmailTooRecent", type: "error" },
    { inputs: [{ name: "wallet", type: "address" }, { name: "gotHash",        type: "uint256" }], name: "SignetWrongExchange",  type: "error" },
] as const;

// ── Signet Pass Factory ABI ───────────────────────────────────────────────────

export const SIGNET_PASS_FACTORY_ABI = [
    { inputs: [],  name: "signetFee",      outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [],  name: "signetTreasury", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
    {
        inputs: [
            { name: "cutoff",        type: "uint256"   },
            { name: "allowedHashes", type: "uint256[]" },
            { name: "owner",         type: "address"   },
        ],
        name: "deploy",
        outputs: [{ name: "pass", type: "address" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true,  name: "pass",          type: "address"   },
            { indexed: true,  name: "owner",         type: "address"   },
            { indexed: false, name: "cutoff",        type: "uint256"   },
            { indexed: false, name: "allowedHashes", type: "uint256[]" },
            { indexed: false, name: "feePerCheck",   type: "uint256"   },
        ],
        name: "PassDeployed",
        type: "event",
    },
] as const;

// ── Utilities ─────────────────────────────────────────────────────────────────

export function formatEth(wei: bigint): string {
    if (wei === 0n) return "Free";
    const eth = Number(wei) / 1e18;
    if (eth < 0.001) return `${(Number(wei) / 1e9).toFixed(4)} Gwei`;
    return `${eth.toFixed(4)} ETH`;
}

export function formatDate(unix: bigint): string {
    return new Date(Number(unix) * 1000).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
    });
}

export function isValidAddress(addr: string | null): addr is `0x${string}` {
    return !!addr && /^0x[0-9a-fA-F]{40}$/.test(addr);
}
