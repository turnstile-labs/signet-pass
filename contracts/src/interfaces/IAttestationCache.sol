// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IAttestationCache
/// @notice Read-only interface for the Signet AttestationCache contract.
///         Import this in your airdrop or gating contract to query
///         whether a wallet has a verified ZK email attestation.
///
/// @dev    Deployed addresses (import from @signet/contracts):
///           Base Sepolia:  0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1
///           Base Mainnet:  deployment in progress
///
///         v2 (partial-SHA circuit): `nullifier` and `nullifierToWallet` removed.
///         One-wallet-one-attestation is enforced via WalletAlreadyAttested
///         in AttestationCache.sol. The To: address is no longer a public signal.
interface IAttestationCache {

    /// @notice On-chain record written when a wallet submits a valid ZK proof.
    /// @param pubkeyHash      Poseidon hash of the DKIM RSA public key — identifies the email domain.
    /// @param emailTimestamp  Unix timestamp from the DKIM `t=` tag — cryptographically verified send time.
    /// @param registeredAt    block.timestamp when attest() was called — NOT the email date.
    struct Attestation {
        uint256 pubkeyHash;     // slot 1
        uint64  emailTimestamp; // slot 2 — packed with registeredAt; uint64 is sufficient until year ~292B
        uint64  registeredAt;   // slot 2
    }

    /// @notice Returns true if `wallet` has submitted a valid attestation.
    function hasAttestation(address wallet) external view returns (bool);

    /// @notice Returns the full attestation for `wallet`.
    ///         All fields are zero if no attestation exists — check `registeredAt > 0`.
    function getAttestation(address wallet) external view returns (Attestation memory);
}
