// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { DKIMRegistry }  from "./DKIMRegistry.sol";
import { Ownable2Step }  from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import { Ownable }       from "openzeppelin-contracts/contracts/access/Ownable.sol";
import { Pausable }      from "openzeppelin-contracts/contracts/utils/Pausable.sol";

/// @dev Minimal interface for the snarkjs-generated Groth16Verifier.
interface IVerifier {
    function verifyProof(
        uint[2]    calldata _pA,
        uint[2][2] calldata _pB,
        uint[2]    calldata _pC,
        uint[3]    calldata _pubSignals
    ) external view returns (bool);
}

/// @title AttestationCache
/// @notice Records one ZK-email attestation per wallet.
///
/// Circuit: partial-SHA header design (maxHeadersLength=640).
/// The DKIM-Signature line is the only part processed inside the circuit;
/// all preceding headers are precomputed off-circuit. This allows unlimited
/// header lengths (KuCoin, EngageLab, etc.) without growing the circuit.
///
/// Public signal layout (must match signet_email.circom):
///   pubSignals[0]  pubkeyHash       — Poseidon hash of the RSA modulus chunks
///   pubSignals[1]  email_timestamp  — DKIM t= tag value (Unix seconds, uint64)
///   pubSignals[2]  proverETHAddress — msg.sender address cast to uint256
///
/// email_recipient (Poseidon of the To: address) was removed in v2 of the
/// circuit because the To: header lives in the precomputed prefix and cannot
/// be extracted inside the circuit. One-wallet-one-attestation is enforced
/// via the WalletAlreadyAttested check on proverETHAddress.
///
/// Invariants enforced on every attest() call:
///   1. Groth16 proof verifies against verification key.
///   2. pubSignals[2] == uint256(uint160(msg.sender))      — proof bound to caller.
///   3. dkimRegistry.isValid(pubSignals[0])                — known DKIM key.
///   4. attestations[msg.sender].registeredAt == 0         — one registration per wallet.
contract AttestationCache is Ownable2Step, Pausable {

    // ── Immutables ────────────────────────────────────────────────────────────

    IVerifier    public immutable verifier;
    DKIMRegistry public immutable dkimRegistry;

    // ── Storage ───────────────────────────────────────────────────────────────

    struct Attestation {
        uint256 pubkeyHash;     // slot 1
        uint64  emailTimestamp; // slot 2 — packed with registeredAt
        uint64  registeredAt;   // slot 2
    }

    /// wallet => attestation
    mapping(address => Attestation) public attestations;

    // ── Events ────────────────────────────────────────────────────────────────

    event Attested(
        address indexed wallet,
        uint256         emailTimestamp,
        uint256         pubkeyHash
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error InvalidProof();
    error WalletMismatch();
    error UnknownDKIMKey(uint256 pubkeyHash);
    error WalletAlreadyAttested(address wallet);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address _verifier, address _dkimRegistry) Ownable(msg.sender) {
        verifier     = IVerifier(_verifier);
        dkimRegistry = DKIMRegistry(_dkimRegistry);
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    /// @notice Submit a ZK-email proof to claim an attestation.
    /// @param _pA  Groth16 proof point A
    /// @param _pB  Groth16 proof point B
    /// @param _pC  Groth16 proof point C
    /// @param pubSignals  The 3 public signals [pubkeyHash, email_timestamp, proverETHAddress]
    function attest(
        uint[2]    calldata _pA,
        uint[2][2] calldata _pB,
        uint[2]    calldata _pC,
        uint[3]    calldata pubSignals
    ) external whenNotPaused {
        // 1. Verify the Groth16 proof.
        if (!verifier.verifyProof(_pA, _pB, _pC, pubSignals)) revert InvalidProof();

        // 2. The address embedded in the proof must be the transaction sender.
        //    This prevents a mempool attacker from copying a valid proof and
        //    submitting it from their own wallet to steal the attestation.
        if (uint256(uint160(msg.sender)) != pubSignals[2]) revert WalletMismatch();

        // 3. The RSA public key hash must be registered in our DKIM registry.
        if (!dkimRegistry.isValid(pubSignals[0])) revert UnknownDKIMKey(pubSignals[0]);

        // 4. Each wallet may register only once.
        if (attestations[msg.sender].registeredAt != 0)
            revert WalletAlreadyAttested(msg.sender);

        // 5. Record the attestation.
        attestations[msg.sender] = Attestation({
            pubkeyHash:     pubSignals[0],
            emailTimestamp: uint64(pubSignals[1]),
            registeredAt:   uint64(block.timestamp)
        });

        emit Attested(msg.sender, pubSignals[1], pubSignals[0]);
    }

    // ── Dry run (testing only) ────────────────────────────────────────────────

    /// @notice Runs every proof check and emits the Attested event, but does NOT
    ///         write to storage. Useful for full end-to-end testing without
    ///         burning a real attestation slot.
    /// @dev TODO: remove before mainnet deployment.
    function dryRunAttest(
        uint[2]    calldata _pA,
        uint[2][2] calldata _pB,
        uint[2]    calldata _pC,
        uint[3]    calldata pubSignals
    ) external whenNotPaused {
        if (!verifier.verifyProof(_pA, _pB, _pC, pubSignals)) revert InvalidProof();
        if (uint256(uint160(msg.sender)) != pubSignals[2])     revert WalletMismatch();
        if (!dkimRegistry.isValid(pubSignals[0]))              revert UnknownDKIMKey(pubSignals[0]);
        if (attestations[msg.sender].registeredAt != 0)
            revert WalletAlreadyAttested(msg.sender);

        emit Attested(msg.sender, pubSignals[1], pubSignals[0]);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function hasAttestation(address wallet) external view returns (bool) {
        return attestations[wallet].registeredAt > 0;
    }

    function getAttestation(address wallet) external view returns (Attestation memory) {
        return attestations[wallet];
    }

    // ── Emergency controls ────────────────────────────────────────────────────

    /// @notice Pause attest() and dryRunAttest() in case a circuit vulnerability
    ///         is discovered. Does not affect existing attestation reads.
    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
