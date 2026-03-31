// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { SignetDemoBadge  } from "../src/examples/SignetDemoBadge.sol";

/// @notice Deploy SignetDemoBadge — the on-chain demo SBT for /demo/badge.
///
///   Required env var:
///     SIGNET_PASS_ADDRESS — an existing SignetPass whose isVerified() we check
///                           (use the demo pass: 0x2566081B73fE2e2340B95B36ccd2256584b64C8F)
///
/// Example:
///   SIGNET_PASS_ADDRESS=0x2566081B73fE2e2340B95B36ccd2256584b64C8F \
///   forge script script/DeployDemoBadge.s.sol \
///     --rpc-url base_sepolia --account <keystore> --broadcast -vvvv
contract DeployDemoBadge is Script {
    function run() external {
        address signetPass = vm.envAddress("SIGNET_PASS_ADDRESS");
        require(signetPass != address(0), "SIGNET_PASS_ADDRESS required");

        vm.startBroadcast();
        SignetDemoBadge badge = new SignetDemoBadge(signetPass);
        vm.stopBroadcast();

        console.log("SignetDemoBadge:", address(badge));
        console.log("SignetPass gate:", signetPass);
        console.log("---");
        console.log("Add to apps/pass/.env.local:");
        console.log(string(abi.encodePacked("NEXT_PUBLIC_DEMO_BADGE_CONTRACT=", vm.toString(address(badge)))));
    }
}
