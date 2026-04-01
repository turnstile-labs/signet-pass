// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { SignetPassFactory  } from "../src/examples/SignetPassFactory.sol";

/// @notice Deploys (or re-deploys) the SignetPassFactory.
///
/// Usage:
///   SIGNET_ADDRESS=0x... TREASURY=0x... forge script script/DeployFactory.s.sol \
///     --rpc-url https://sepolia.base.org \
///     --private-key $PRIVATE_KEY \
///     --broadcast --skip test
///
/// Env vars:
///   SIGNET_ADDRESS — AttestationCache address (required)
///   TREASURY       — Fee recipient address (required)
///   SIGNET_FEE     — Fee in wei (default: 0 for testnet)
contract DeployFactory is Script {
    function run() external {
        address signetAddress = vm.envAddress("SIGNET_ADDRESS");
        address treasury      = vm.envAddress("TREASURY");
        uint256 fee           = vm.envOr("SIGNET_FEE", uint256(0));

        require(signetAddress != address(0), "SIGNET_ADDRESS required");
        require(treasury      != address(0), "TREASURY required");

        vm.startBroadcast();
        SignetPassFactory factory = new SignetPassFactory(
            signetAddress,
            payable(treasury),
            fee
        );
        vm.stopBroadcast();

        console.log("SignetPassFactory:", address(factory));
        console.log("  signetAddress:  ", signetAddress);
        console.log("  treasury:       ", treasury);
        console.log("  signetFee:      ", fee);
        console.log("  owner:          ", factory.owner());
        console.log("---");
        console.log("Update in apps/pass/src/lib/wagmi.ts:");
        console.log(string(abi.encodePacked(
            "FACTORY_ADDRESS = '", vm.toString(address(factory)), "'"
        )));
    }
}
