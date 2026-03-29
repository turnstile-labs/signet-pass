// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IAttestationCache
/// @notice Read-only interface for the Signet AttestationCache contract.
///         Import this in your airdrop or gating contract to query
///         whether a wallet has a verified ZK email attestation.
///
/// @dev    Deployed addresses (import from @signet/contracts):
///           Base Sepolia:  0x32162906F896A9d61c60970D35BF33930dD22793
///           Base Mainnet:  deployment in progress
interface IAttestationCache {

    /// @notice On-chain record written when a wallet submits a valid ZK proof.
    /// @param pubkeyHash      Poseidon hash of the DKIM RSA public key — identifies the email domain.
    /// @param nullifier       Poseidon hash of the recipient email address — prevents double registration.
    /// @param emailTimestamp  Unix timestamp from the DKIM `t=` tag — cryptographically verified send time.
    /// @param registeredAt    block.timestamp when attest() was called — NOT the email date.
    struct Attestation {
        uint256 pubkeyHash;     // slot 1
        uint256 nullifier;      // slot 2
        uint64  emailTimestamp; // slot 3 — packed with registeredAt; uint64 is sufficient until year ~292B
        uint64  registeredAt;   // slot 3
    }

    /// @notice Returns true if `wallet` has submitted a valid attestation.
    function hasAttestation(address wallet) external view returns (bool);

    /// @notice Returns the full attestation for `wallet`.
    ///         All fields are zero if no attestation exists — check `registeredAt > 0`.
    function getAttestation(address wallet) external view returns (Attestation memory);

    /// @notice Returns the wallet that registered a given nullifier, or address(0) if unused.
    ///         Use this to check whether a specific email address has already been used.
    function nullifierToWallet(uint256 nullifier) external view returns (address);
}
