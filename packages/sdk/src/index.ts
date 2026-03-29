import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";

// ── Shared client factory ─────────────────────────────────────────────────────

function getClient(chain: "baseSepolia" | "base" = "baseSepolia") {
    return createPublicClient({
        chain:     chain === "base" ? base : baseSepolia,
        transport: http(chain === "base"
            ? "https://mainnet.base.org"
            : "https://sepolia.base.org"
        ),
    });
}

// ── Contract addresses ────────────────────────────────────────────────────────

export const SIGNET_ADDRESSES = {
    baseSepolia: "0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1" as const,
    base:        null, // mainnet deployment in progress
} as const;

export const DKIM_REGISTRY_ADDRESS = {
    baseSepolia: "0xd984F26057A990a4f4de5A36faF7968b818BAe46" as const,
    base:        null,
} as const;

export const RUG_SURVIVOR_SBT_ADDRESS = {
    baseSepolia: "0xB2e5Cf0928BC09F60502f0f57a5ABd220f75eF75" as const,
    base:        null,
} as const;

// ── DKIM pubkey hashes (Poseidon of RSA modulus chunks) ───────────────────────
//
// All values computed by scripts/seed-dkim.ts and verified on-chain in
// DKIMRegistry (0xd984F26057A990a4f4de5A36faF7968b818BAe46, Base Sepolia).
//
// Each hash corresponds to google._domainkey.<domain> unless noted.
// Last verified: 2026-03-21 (post.binance.com 20170925085502pm added 2026-03-21; partial-SHA circuit v2).

/** Live exchanges — used for airdrop eligibility proofs (Signet prove flow). */
export const LIVE_EXCHANGE_HASHES = {
    /** google._domainkey.coinbase.com  */
    coinbase:    12478993793821588666622656907431727313282495324428978778213333200202582976087n,
    /** xmk7xv4dzq3ad3l3wrpegkiqkegm4nst._domainkey.info.coinbase.com — Coinbase SES subdomain (1024-bit) */
    coinbaseInfo: 19806930313339437892543285869542575252100319438226679350463646898451946018980n,
    /** google._domainkey.binance.com   */
    binance:     7530370953244161785305698736227894091331396871750461845654044902833037341886n,
    /** scph0122._domainkey.mailersp2.binance.com — Binance marketing subdomain (1024-bit) */
    binanceMailersp2: 5211360840266555668934225377327267216278764602914790735918281919375098884960n,
    /** gxhqvjfn7nxg45wwesxakydswcc4dbhb._domainkey.ses.binance.com — Binance SES subdomain (2048-bit) */
    binanceSes:       11386741564238666620858285565730877046054953351540032615456661840837574366512n,
    /** google._domainkey.kraken.com    */
    kraken:      4477281523986306060851616083512793067969394548081436960153957673746589703409n,
    /** krs._domainkey.kraken.com — Kraken transactional key (1024-bit) */
    krakenKrs:   17435802328349134093238821880640718843412956424088016714356511044999990791754n,
    /** google._domainkey.okx.com       */
    okx:         6087015245241216128247766011539286654729248409476150086529922054622136325966n,
    /** s1._domainkey.okx.com           */
    okxS1:       3724273636662862511108242140099137256880169760227353900550208597187269253457n,
    /** google._domainkey.bybit.com     */
    bybit:       7986170548142533905024073588893793486613773949529266370021505426939871078647n,
    /** google._domainkey.gemini.com    */
    gemini:      16316796790088203292157090937558982184416615752548107725939943272321938601396n,
    /** google._domainkey.robinhood.com */
    robinhood:   7019150618836442810941204799616816398863719229496820525963187936340264179826n,
    /** google._domainkey.crypto.com    */
    cryptoCom:   8188481930121974683479917529320145251421776358134464229461597154866957184393n,
    /** google._domainkey.kucoin.com    */
    kucoin:      10168679144983397166085511337407953118160341388600226133510335114685233743051n,
    /** selector1._domainkey.kucoin.com — Microsoft 365 (expsg.onmicrosoft.com) */
    kucoinSelector1: 18341902629066994389013891671846108822569422681843009915600085949904203301480n,
    /** kuc._domainkey.kucoin.com — retired ~Sep 2025 */
    kucoinKuc:   1463336852737323141752389940153716620542534116632479001591198198292743799953n,
    /** s2._domainkey.kucoin.com — retired ~Aug 2025 */
    kucoinS2:    19099778266458280452207864265643828327196865215412234994511064095837130548792n,
    /** mkt._domainkey.kucoin.com — retired ~Sep 2025 */
    kucoinMkt:   3747560782515219361431438135528798416189021292952488411162012552635244112764n,
    /** engagelabmail._domainkey.kucoin.com — EngageLab/MailChimp transactional (1024-bit, DNS live 2026-03) */
    kucoinEngagelab: 5322664242892396143952195593217444709779166141856011629709952967845466916475n,
    /** mail._domainkey.mailer3.binance.com — Binance promo/mailer3 subdomain (1024-bit) */
    binanceMailer3: 16963075529282339495337551812437626768485281387098062695261681001943365649165n,
    /** 20170925085502pm._domainkey.post.binance.com — Binance transactional mailer (1024-bit, registered 2026-03) */
    binancePost: 9875585885503178472458319649316448599182761947522549893373005256307473897762n,
} as const;

/**
 * Defunct exchanges — used for Rug Survivor badge claims.
 * These are the primary (google) hashes; additional selectors are registered
 * on-chain via addValidHash() and tracked in scripts/seed-dkim.ts.
 *
 * Token IDs map to RugSurvivorSBT (RUG_SURVIVOR_SBT_ADDRESS above).
 */
export const DEFUNCT_EXCHANGE_HASHES = {
    /** tokenId=1  — Mt. Gox      — google._domainkey.mtgox.com (DNS dead; 1024-bit SES active) */
    mtgox:       10560732801385130368664797057956499508696070810578095175177778739135514084161n,
    /** tokenId=2  — QuadrigaCX   — google._domainkey.quadrigacx.com (same key as default) */
    quadrigacx:  8604074053909990840014584413669623780474180795646426038538351672960093894757n,
    /** tokenId=3  — Terra/Luna   — google._domainkey.terra.money */
    terra:       3389252223873368753058448547633103051241383246553097648899029069587541867176n,
    /** tokenId=4  — Anchor       — google._domainkey.anchorprotocol.com (1024-bit) */
    anchor:      4440941819140606887764194885747861613736718455759786730730983520900871824175n,
    /** tokenId=5  — Celsius      — google._domainkey.celsius.network (1024-bit) */
    celsius:     10384955412642265998252959978742467558355448157692984166726228396693955519192n,
    /** tokenId=6  — Voyager      — google._domainkey.investvoyager.com */
    voyager:     21655039498611246900572099179852202179651465170361468469446708305334155129361n,
    /** tokenId=7  — Vauld        — google._domainkey.vauld.com (1024-bit) */
    vauld:       1422844125583424164228051593396685602206696052463481310773789876950803713593n,
    /** tokenId=8  — Hodlnaut     — google._domainkey.hodlnaut.com */
    hodlnaut:    2508813884830361805419716168525129265308742494125259996988245627690748355269n,
    /** tokenId=9  — BlockFi      — google._domainkey.blockfi.com */
    blockfi:     15995179555830230422567641468672278394140302474868826490505651543321581641295n,
    /** tokenId=10 — FTX          — google._domainkey.ftx.com */
    ftx:         9282170130123607788839600562270015695975457885356643661041235264582127996140n,
    /** tokenId=11 — FTX US       — google._domainkey.ftx.us */
    ftxUs:       20949963136665964488095537598472241959060855148883342116182154792393370966889n,
    /** tokenId=12 — WazirX       — google._domainkey.wazirx.com */
    wazirx:      3315094999066053194713504158777114913777981790762827139346000974047616146216n,
    /** tokenId=13 — DMM Bitcoin  — google._domainkey.dmm.com */
    dmmBitcoin:  6712128891927903255862823387444533785697220667109782555189035858428213064504n,
} as const;

// Legacy alias — kept for backwards compatibility with existing SDK consumers.
// Prefer LIVE_EXCHANGE_HASHES going forward.
export const PUBKEY_HASHES = LIVE_EXCHANGE_HASHES;

// ── ABIs ──────────────────────────────────────────────────────────────────────

// v2 ABI: partial-SHA circuit, 3 public signals (removed email_recipient/nullifier).
// Signal layout: [0]=pubkeyHash, [1]=email_timestamp, [2]=proverETHAddress
export const ATTESTATION_CACHE_ABI = parseAbi([
    "function attest(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[3] pubSignals) nonpayable",
    "function dryRunAttest(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[3] pubSignals) nonpayable",
    "function hasAttestation(address wallet) view returns (bool)",
    "function getAttestation(address wallet) view returns ((uint256 pubkeyHash, uint64 emailTimestamp, uint64 registeredAt))",
    "event Attested(address indexed wallet, uint64 emailTimestamp, uint256 pubkeyHash)",
    "error InvalidProof()",
    "error WalletMismatch()",
    "error UnknownDKIMKey(uint256 pubkeyHash)",
    "error WalletAlreadyAttested(address wallet)",
]);

export const DKIM_REGISTRY_ABI = parseAbi([
    "function isValid(uint256 pubkeyHash) view returns (bool)",
    "function setKey(uint256 pubkeyHash, bool valid) nonpayable",
    "function setKeys(uint256[] hashes, bool valid) nonpayable",
]);

export const RUG_SURVIVOR_SBT_ABI = parseAbi([
    "function claimBadge(uint256 tokenId) nonpayable",
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function collapseTimestamps(uint256 tokenId) view returns (uint64)",
    "function validHashes(uint256 tokenId, uint256 pubkeyHash) view returns (bool)",
    "function addValidHash(uint256 tokenId, uint256 pubkeyHash) nonpayable",
    "function registerExchange(uint256 tokenId, uint64 cutoffTimestamp, uint256 initialHash) nonpayable",
    "function uri(uint256 tokenId) view returns (string)",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Attestation {
    pubkeyHash:     bigint;
    emailTimestamp: bigint;  // Unix seconds — DKIM t= tag
    registeredAt:   bigint;  // Unix seconds — block.timestamp when submitted
}

export interface EligibilityResult {
    eligible:    boolean;
    attestation: Attestation | null;
    /** Human-readable reason when eligible === false */
    reason?:     string;
}

export interface SignetOptions {
    /** Unix timestamp — emailTimestamp must be strictly before this */
    cutoff:      number | bigint;
    /** Optional: restrict to a specific email domain by pubkeyHash */
    pubkeyHash?: bigint;
    /** Chain to query. Defaults to baseSepolia. */
    chain?:      "baseSepolia" | "base";
    /** Override the AttestationCache contract address */
    address?:    `0x${string}`;
}

// ── Client factory (attestation helpers) ─────────────────────────────────────

function getAddress(
    opts: Pick<SignetOptions, "chain" | "address">
): `0x${string}` {
    if (opts.address) return opts.address;
    const addr = SIGNET_ADDRESSES[opts.chain ?? "baseSepolia"];
    if (!addr) throw new Error(`Signet not yet deployed on ${opts.chain}`);
    return addr;
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Fetch the raw attestation for a wallet.
 * Returns null if no attestation exists.
 */
export async function getAttestation(
    wallet: `0x${string}`,
    opts:   Pick<SignetOptions, "chain" | "address"> = {}
): Promise<Attestation | null> {
    const client  = getClient(opts.chain);
    const address = getAddress(opts);

    const raw = await client.readContract({
        address,
        abi:          ATTESTATION_CACHE_ABI,
        functionName: "getAttestation",
        args:         [wallet],
    });

    if (raw.registeredAt === 0n) return null;
    return {
        pubkeyHash:     raw.pubkeyHash,
        emailTimestamp: raw.emailTimestamp,
        registeredAt:   BigInt(raw.registeredAt),
    };
}

/**
 * Check whether a wallet is eligible for an airdrop.
 *
 * @example
 * const result = await checkEligibility("0xABC…", {
 *     cutoff:     1704067200,        // Jan 1 2024
 *     pubkeyHash: LIVE_EXCHANGE_HASHES.coinbase,
 * });
 * if (result.eligible) showClaimButton();
 * else showMessage(result.reason);
 */
export async function checkEligibility(
    wallet: `0x${string}`,
    opts:   SignetOptions
): Promise<EligibilityResult> {
    const attestation = await getAttestation(wallet, opts);

    if (!attestation) {
        return {
            eligible:    false,
            attestation: null,
            reason:      "No Signet attestation found. Visit signet.xyz to prove your email.",
        };
    }

    const cutoff = BigInt(opts.cutoff);
    if (attestation.emailTimestamp >= cutoff) {
        const date = new Date(Number(cutoff) * 1000).toLocaleDateString();
        return {
            eligible:    false,
            attestation,
            reason:      `Email account too recent — must predate ${date}.`,
        };
    }

    if (opts.pubkeyHash && attestation.pubkeyHash !== opts.pubkeyHash) {
        return {
            eligible:    false,
            attestation,
            reason:      "Wrong email domain for this airdrop.",
        };
    }

    return { eligible: true, attestation };
}

/**
 * Returns the Signet prove URL with an optional return destination.
 * Use this to deep-link users from your claim page to Signet.
 *
 * @example
 * const url = getProveUrl({ returnUrl: "https://myairdrop.xyz/claim" });
 * // → "https://signet.xyz/prove?return=https%3A%2F%2Fmyairdrop.xyz%2Fclaim"
 */
export function getProveUrl(opts: { returnUrl?: string; wallet?: string } = {}): string {
    const base = "https://signet.xyz/prove";
    const params = new URLSearchParams();
    if (opts.returnUrl) params.set("return", opts.returnUrl);
    if (opts.wallet)    params.set("wallet", opts.wallet);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
}

// ── Pass ──────────────────────────────────────────────────────────────────────
//
// Signet pass contracts expose a single read: isVerified(address) → bool.
// No ZK knowledge or attestation cache needed — just one call to the deployed
// pass contract.

export const PASS_ABI = parseAbi([
    "function isVerified(address wallet) view returns (bool)",
]);

export interface PassOptions {
    /** Override the chain. Defaults to baseSepolia. */
    chain?:  "baseSepolia" | "base";
    /** Override the RPC URL. */
    rpcUrl?: string;
}

/**
 * Check whether a wallet holds a Signet pass.
 *
 * @param contract  The deployed Signet pass contract address.
 * @param wallet    The wallet address to check.
 * @param opts      Optional chain / RPC overrides.
 *
 * @example
 * const hasPass = await checkPass("0xABC…", "0xDEF…");
 * if (hasPass) grantAccess();
 */
export async function checkPass(
    contract: `0x${string}`,
    wallet:   `0x${string}`,
    opts:     PassOptions = {}
): Promise<boolean> {
    const client = opts.rpcUrl
        ? createPublicClient({
            chain:     opts.chain === "base" ? base : baseSepolia,
            transport: http(opts.rpcUrl),
          })
        : getClient(opts.chain);

    return client.readContract({
        address:      contract,
        abi:          PASS_ABI,
        functionName: "isVerified",
        args:         [wallet],
    }) as Promise<boolean>;
}
