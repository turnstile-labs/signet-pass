// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "openzeppelin-contracts/contracts/access/Ownable2Step.sol";
/// @title DKIMRegistry
/// @notice Tracks which Poseidon pubkey hashes correspond to known, valid DKIM
///         signing keys. The owner registers hashes after verifying off-chain
///         that the domain's DNS still publishes the matching public key.
///
///         pubkeyHash = Poseidon(rsaModulusChunks)  — computed by the ZK circuit.
///
/// @dev    Uses Ownable2Step so ownership transfers require explicit acceptance,
///         preventing accidental transfer to a dead address and permanent loss of
///         the ability to register new DKIM keys.
contract DKIMRegistry is Ownable2Step {

    /// @notice pubkeyHash => true if the key is considered valid
    mapping(uint256 => bool) public validKeys;

    event KeySet(uint256 indexed pubkeyHash, bool valid);

    error ZeroHash();

    constructor() Ownable(msg.sender) {}

    /// @notice Register or revoke a single pubkey hash.
    function setKey(uint256 pubkeyHash, bool valid) external onlyOwner {
        if (pubkeyHash == 0) revert ZeroHash();
        validKeys[pubkeyHash] = valid;
        emit KeySet(pubkeyHash, valid);
    }

    /// @notice Batch-register or revoke pubkey hashes (e.g. initial deployment).
    function setKeys(uint256[] calldata hashes, bool valid) external onlyOwner {
        for (uint256 i; i < hashes.length;) {
            if (hashes[i] == 0) revert ZeroHash();
            validKeys[hashes[i]] = valid;
            emit KeySet(hashes[i], valid);
            unchecked { ++i; }
        }
    }

    function isValid(uint256 pubkeyHash) external view returns (bool) {
        return validKeys[pubkeyHash];
    }
}
