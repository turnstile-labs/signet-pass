// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SignetPass } from "./SignetPass.sol";

/// @title  SignetPassFactory
/// @notice Deploys `SignetPass` instances with Signet's fee model baked in.
///         Founders configure only `cutoff` and `allowedHashes`; Signet's
///         treasury address and fee are set once at factory deployment and
///         cannot be changed per pass.
///
///         The owner (Signet) can update the fee charged on future passes
///         via `setFee()`. Existing passes are unaffected — their fee is
///         immutable at deploy time.
contract SignetPassFactory {

    /// @notice Signet AttestationCache — passed to every deployed pass.
    address public immutable signetAddress;

    /// @notice Receives all verification fees from every pass.
    address payable public immutable signetTreasury;

    /// @notice Verification fee (wei) charged to users per `verify()` call.
    ///         0 = free during testnet. Updated via setFee() for mainnet.
    uint256 public signetFee;

    /// @notice Factory owner — the only address that can call setFee().
    address public owner;

    error NotOwner();

    event PassDeployed(
        address indexed pass,
        address indexed owner,
        uint256         cutoff,
        uint256[]       allowedHashes,
        uint256         feePerCheck
    );

    event FeeUpdated(uint256 oldFee, uint256 newFee);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

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
        owner          = msg.sender;
    }

    // ── Owner functions ───────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Update the fee charged on all future passes.
    ///         Existing deployed passes are unaffected.
    function setFee(uint256 newFee) external onlyOwner {
        emit FeeUpdated(signetFee, newFee);
        signetFee = newFee;
    }

    /// @notice Transfer factory ownership to a new address (e.g. multisig).
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Deploy ────────────────────────────────────────────────────────────────

    /// @notice Deploy a new SignetPass.
    /// @param cutoff        Unix timestamp — email must predate this.
    ///                      Use a far-future value (e.g. 9999999999) for no restriction.
    /// @param allowedHashes Exchange filter. Empty array = any exchange.
    /// @param passOwner     Informational owner recorded in the PassDeployed event.
    function deploy(
        uint256           cutoff,
        uint256[] calldata allowedHashes,
        address           passOwner
    ) external returns (address pass) {
        SignetPass p = new SignetPass(
            cutoff,
            allowedHashes,
            signetFee,
            signetTreasury,
            signetAddress
        );
        pass = address(p);
        emit PassDeployed(pass, passOwner, cutoff, allowedHashes, signetFee);
    }
}
