// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SignetPass } from "./SignetPass.sol";

/// @title  SignetPassFactory
/// @notice Deploys `SignetPass` instances with Signet's fee model baked in.
///         Founders configure only `cutoff` and `allowedHashes`; Signet's
///         treasury address and fee are set once at factory deployment and
///         cannot be changed per pass.
contract SignetPassFactory {

    /// @notice Signet AttestationCache — passed to every deployed pass.
    address public immutable signetAddress;

    /// @notice Receives all verification fees from every pass.
    address payable public immutable signetTreasury;

    /// @notice Verification fee (wei) charged to users per `verify()` call.
    ///         Set by Signet at factory deployment. 0 = free during testnet.
    uint256 public immutable signetFee;

    event PassDeployed(
        address indexed pass,
        address indexed owner,
        uint256         cutoff,
        uint256[]       allowedHashes,
        uint256         feePerCheck
    );

    constructor(
        address         _signetAddress,
        address payable _signetTreasury,
        uint256         _signetFee
    ) {
        require(_signetAddress  != address(0), "Invalid signet address");
        require(_signetTreasury != address(0), "Invalid treasury");
        signetAddress  = _signetAddress;
        signetTreasury = _signetTreasury;
        signetFee      = _signetFee;
    }

    /// @notice Deploy a new SignetPass.
    /// @param cutoff        Unix timestamp — accounts older than this qualify.
    /// @param allowedHashes Exchange filter. Empty array = any exchange.
    ///                      Pass e.g. [COINBASE_PUBKEY_HASH] to restrict to Coinbase.
    ///                      Multiple hashes = OR logic (any matching exchange qualifies).
    /// @param owner         Owner of the pass (can be the founder's EOA or multisig).
    function deploy(
        uint256           cutoff,
        uint256[] calldata allowedHashes,
        address           owner
    ) external returns (address pass) {
        SignetPass p = new SignetPass(
            cutoff,
            allowedHashes,
            signetFee,
            signetTreasury,
            signetAddress
        );
        pass = address(p);
        emit PassDeployed(pass, owner, cutoff, allowedHashes, signetFee);
    }
}
