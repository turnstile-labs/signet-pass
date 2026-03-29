// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ReentrancyGuard }   from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import { SignetGated }       from "../SignetGated.sol";
import { IAttestationCache } from "../interfaces/IAttestationCache.sol";

/// @title  SignetPass
/// @notice A sybil-resistant access pass contract. Wallets that call `verify()`
///         must have a Signet attestation with an email timestamp strictly
///         before `cutoff`. An optional exchange filter (`allowedHashes`)
///         restricts verification to one or more specific exchanges.
///
///         Deployed by `SignetPassFactory`. The fee and treasury are
///         Signet's — founders configure only cutoff and exchange filters.
///
/// Usage:
///
///     // Deploy via factory
///     address pass = factory.deploy(
///         1704067200,      // cutoff: Jan 1 2024
///         new uint256[](0) // allowedHashes: empty = any exchange
///     );
///
///     // User proves eligibility
///     pass.verify{ value: factory.signetFee() }();
///
///     // Protocol reads eligibility
///     bool ok = ISignetPass(pass).isVerified(wallet);
contract SignetPass is SignetGated, ReentrancyGuard {

    // ── Immutables ────────────────────────────────────────────────────────────

    /// @notice Email must predate this Unix timestamp.
    uint256 public immutable cutoff;

    /// @notice Fee per verify() call (in wei). Set by Signet, goes to treasury.
    uint256 public immutable feePerCheck;

    /// @notice Signet's treasury — receives all verification fees.
    address payable public immutable treasury;

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice Allowed DKIM pubkey hashes. Empty = accept any registered exchange.
    ///         Non-empty = wallet's attestation hash must match one of these.
    uint256[] public allowedHashes;

    /// @notice Wallets that hold a valid pass.
    mapping(address => bool) public verified;

    // ── Signet ────────────────────────────────────────────────────────────────

    address internal immutable _signet;

    function _signetAddress() internal view override returns (address) { return _signet; }

    // ── Events / Errors ───────────────────────────────────────────────────────

    event Verified(address indexed wallet);

    error InsufficientFee(uint256 sent, uint256 required);
    error AlreadyVerified(address wallet);
    error SignetWrongExchange(address wallet, uint256 gotHash);
    error InvalidAddress();

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param _cutoff         Email must predate this timestamp.
    /// @param _allowedHashes  Exchange filter. Empty = any exchange.
    /// @param _feePerCheck    Fee in wei per verify() call.
    /// @param _treasury       Fee recipient (Signet's treasury).
    /// @param _signetAddr     Signet AttestationCache address.
    constructor(
        uint256           _cutoff,
        uint256[] memory  _allowedHashes,
        uint256           _feePerCheck,
        address payable   _treasury,
        address           _signetAddr
    ) {
        if (_treasury   == address(0)) revert InvalidAddress();
        if (_signetAddr == address(0)) revert InvalidAddress();

        cutoff       = _cutoff;
        feePerCheck  = _feePerCheck;
        treasury     = _treasury;
        _signet      = _signetAddr;

        for (uint256 i; i < _allowedHashes.length; ++i) {
            allowedHashes.push(_allowedHashes[i]);
        }
    }

    // ── External ──────────────────────────────────────────────────────────────

    /// @notice Prove eligibility and claim a pass.
    ///
    ///         Reverts with:
    ///         - `InsufficientFee`          — msg.value < feePerCheck
    ///         - `AlreadyVerified`          — wallet already holds this pass
    ///         - `SignetNoAttestation`      — wallet has no Signet attestation
    ///         - `SignetEmailTooRecent`     — email timestamp >= cutoff
    ///         - `SignetWrongExchange`      — email domain not in allowedHashes
    function verify() external payable nonReentrant {
        if (msg.value < feePerCheck)  revert InsufficientFee(msg.value, feePerCheck);
        if (verified[msg.sender])     revert AlreadyVerified(msg.sender);

        // Read attestation once — avoids multiple cross-contract calls.
        IAttestationCache.Attestation memory att = _getAttestation(msg.sender);
        if (att.registeredAt   == 0)    revert SignetNoAttestation(msg.sender);
        if (att.emailTimestamp >= cutoff) revert SignetEmailTooRecent(msg.sender, att.emailTimestamp, cutoff);

        // Exchange filter (OR logic: any matching hash qualifies).
        if (allowedHashes.length > 0) {
            bool found;
            for (uint256 i; i < allowedHashes.length; ++i) {
                if (att.pubkeyHash == allowedHashes[i]) { found = true; break; }
            }
            if (!found) revert SignetWrongExchange(msg.sender, att.pubkeyHash);
        }

        verified[msg.sender] = true;
        if (msg.value > 0) treasury.transfer(msg.value);
        emit Verified(msg.sender);
    }

    /// @notice Returns true if `wallet` holds this pass.
    function isVerified(address wallet) external view returns (bool) {
        return verified[wallet];
    }

    /// @notice Returns true if `wallet` would pass eligibility (no fee/already-verified check).
    function isEligible(address wallet) external view returns (bool) {
        IAttestationCache.Attestation memory att = _getAttestation(wallet);
        if (att.registeredAt == 0 || att.emailTimestamp >= cutoff) return false;
        if (allowedHashes.length == 0) return true;
        for (uint256 i; i < allowedHashes.length; ++i) {
            if (att.pubkeyHash == allowedHashes[i]) return true;
        }
        return false;
    }

    /// @notice Returns the full allowedHashes array.
    function getAllowedHashes() external view returns (uint256[] memory) {
        return allowedHashes;
    }
}
