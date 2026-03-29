// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IAttestationCache } from "./interfaces/IAttestationCache.sol";

/// @title  SignetGated
/// @notice Base contract for protocols that want to gate access using
///         Signet ZK email attestations.
///
/// @dev    Inherit this contract and call `requireSignet()` inside any
///         function you want to restrict to wallets with a verified email
///         attestation older than a given cutoff timestamp.
///
/// Usage:
///
///     contract MyAirdrop is SignetGated {
///         uint256 constant CUTOFF = 1704067200; // Jan 1 2024
///
///         function claim() external {
///             requireSignet(msg.sender, CUTOFF);
///             // ... distribute tokens
///         }
///     }
///
/// To restrict by email domain, pass the domain's pubkeyHash:
///
///         function claim() external {
///             requireSignetDomain(msg.sender, CUTOFF, COINBASE_PUBKEY_HASH);
///         }
abstract contract SignetGated {

    // ── Signet contract addresses ─────────────────────────────────────────────

    /// @notice Signet AttestationCache on Base Sepolia (testnet).
    address public constant SIGNET_BASE_SEPOLIA =
        0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1;

    // Add SIGNET_BASE_MAINNET here after mainnet deploy.

    // ── Known DKIM pubkey hashes ──────────────────────────────────────────────

    /// @notice Poseidon hash of Coinbase's DKIM public key (SES — info.coinbase.com).
    ///         Pass to requireSignetDomain() to restrict to Coinbase email accounts.
    uint256 public constant COINBASE_PUBKEY_HASH =
        19806930313339437892543285869542575252100319438226679350463646898451946018980;

    /// @notice Poseidon hash of Coinbase's Google Workspace DKIM key (coinbase.com).
    uint256 public constant COINBASE_GWS_PUBKEY_HASH =
        12478993793821588666622656907431727313282495324428978778213333200202582976087;

    /// @notice Poseidon hash of Binance's DKIM public key (google._domainkey.binance.com).
    uint256 public constant BINANCE_PUBKEY_HASH =
        7530370953244161785305698736227894091331396871750461845654044902833037341886;

    /// @notice Poseidon hash of Kraken's DKIM public key (google._domainkey.kraken.com).
    uint256 public constant KRAKEN_PUBKEY_HASH =
        4477281523986306060851616083512793067969394548081436960153957673746589703409;

    /// @notice Poseidon hash of OKX's DKIM public key (google._domainkey.okx.com).
    uint256 public constant OKX_PUBKEY_HASH =
        6087015245241216128247766011539286654729248409476150086529922054622136325966;

    /// @notice Poseidon hash of Bybit's DKIM public key (google._domainkey.bybit.com).
    uint256 public constant BYBIT_PUBKEY_HASH =
        7986170548142533905024073588893793486613773949529266370021505426939871078647;

    /// @notice Poseidon hash of Gemini's DKIM public key (google._domainkey.gemini.com).
    uint256 public constant GEMINI_PUBKEY_HASH =
        16316796790088203292157090937558982184416615752548107725939943272321938601396;

    /// @notice Poseidon hash of Robinhood's DKIM public key (google._domainkey.robinhood.com).
    uint256 public constant ROBINHOOD_PUBKEY_HASH =
        7019150618836442810941204799616816398863719229496820525963187936340264179826;

    /// @notice Poseidon hash of Crypto.com's DKIM public key (google._domainkey.crypto.com).
    uint256 public constant CRYPTO_PUBKEY_HASH =
        8188481930121974683479917529320145251421776358134464229461597154866957184393;

    /// @notice Poseidon hash of KuCoin's DKIM public key (google._domainkey.kucoin.com).
    uint256 public constant KUCOIN_PUBKEY_HASH =
        10168679144983397166085511337407953118160341388600226133510335114685233743051;

    // ── Errors ────────────────────────────────────────────────────────────────

    error SignetNoAttestation(address wallet);
    error SignetEmailTooRecent(address wallet, uint256 emailTimestamp, uint256 cutoff);
    error SignetWrongDomain(address wallet, uint256 gotPubkeyHash, uint256 wantPubkeyHash);

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// @notice Returns the Signet attestation for `wallet`.
    ///         Override `_signetAddress()` to use a different deployment.
    function _getAttestation(address wallet)
        internal view
        returns (IAttestationCache.Attestation memory)
    {
        return IAttestationCache(_signetAddress()).getAttestation(wallet);
    }

    /// @notice The Signet contract address used by this deployment.
    ///         Override to point at mainnet or a different chain, or pass
    ///         the address via constructor and store it as an immutable:
    ///
    ///     address internal immutable _signet;
    ///     constructor(address signetAddress) { _signet = signetAddress; }
    ///     function _signetAddress() internal view override returns (address) { return _signet; }
    function _signetAddress() internal view virtual returns (address) {
        return SIGNET_BASE_SEPOLIA;
    }

    // ── Guards ────────────────────────────────────────────────────────────────

    /// @notice Reverts unless `wallet` has a Signet attestation with an email
    ///         timestamp strictly before `cutoff`.
    ///         Accepts any email domain registered in Signet's DKIMRegistry.
    /// @dev    Returns the attestation so callers can use it without a second
    ///         cross-contract read (e.g. to include emailTimestamp in an event).
    ///         `emailTimestamp` is stored as uint64; Solidity upcasts it to uint256
    ///         for the comparison — no truncation risk, no explicit cast needed.
    function requireSignet(address wallet, uint256 cutoff)
        internal view
        returns (IAttestationCache.Attestation memory a)
    {
        a = _getAttestation(wallet);
        if (a.registeredAt == 0)        revert SignetNoAttestation(wallet);
        if (a.emailTimestamp >= cutoff) revert SignetEmailTooRecent(wallet, a.emailTimestamp, cutoff);
    }

    /// @notice Like requireSignet(), but also enforces a specific email domain
    ///         identified by its `pubkeyHash` (e.g. COINBASE_PUBKEY_HASH).
    ///         Returns the attestation for use in events or downstream logic.
    function requireSignetDomain(
        address wallet,
        uint256 cutoff,
        uint256 pubkeyHash
    ) internal view returns (IAttestationCache.Attestation memory a) {
        a = _getAttestation(wallet);
        if (a.registeredAt == 0)        revert SignetNoAttestation(wallet);
        if (a.emailTimestamp >= cutoff) revert SignetEmailTooRecent(wallet, a.emailTimestamp, cutoff);
        if (a.pubkeyHash != pubkeyHash) revert SignetWrongDomain(wallet, a.pubkeyHash, pubkeyHash);
    }

    /// @notice Returns true if `wallet` is eligible: has an attestation with
    ///         emailTimestamp < cutoff. Does not revert.
    function isSignetEligible(address wallet, uint256 cutoff)
        internal view
        returns (bool)
    {
        IAttestationCache.Attestation memory a = _getAttestation(wallet);
        return a.registeredAt > 0 && a.emailTimestamp < cutoff;
    }

    /// @notice Returns true if `wallet` is eligible for the given domain.
    ///         Does not revert.
    function isSignetEligibleDomain(
        address wallet,
        uint256 cutoff,
        uint256 pubkeyHash
    ) internal view returns (bool) {
        IAttestationCache.Attestation memory a = _getAttestation(wallet);
        return a.registeredAt > 0
            && a.emailTimestamp < cutoff
            && a.pubkeyHash == pubkeyHash;
    }
}
