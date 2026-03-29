// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { Groth16Verifier }  from "../src/Groth16Verifier.sol";
import { AttestationCache } from "../src/AttestationCache.sol";

/// @notice Redeploys only the Groth16Verifier + AttestationCache,
///         reusing the existing seeded DKIMRegistry.
///
/// Usage:
///   DKIM_REGISTRY=0xd984F26057A990a4f4de5A36faF7968b818BAe46 \
///   forge script script/RedeployVerifier.s.sol \
///     --rpc-url base_sepolia \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast -vvvv
contract RedeployVerifier is Script {
    function run() external {
        address dkimRegistry = vm.envAddress("DKIM_REGISTRY");
        console.log("Reusing DKIMRegistry:", dkimRegistry);

        vm.startBroadcast();

        Groth16Verifier verifier = new Groth16Verifier();
        console.log("New Groth16Verifier:", address(verifier));

        AttestationCache cache = new AttestationCache(
            address(verifier),
            dkimRegistry
        );
        console.log("New AttestationCache:", address(cache));

        vm.stopBroadcast();

        string memory obj = "redeploy";
        vm.serializeAddress(obj, "NEXT_PUBLIC_VERIFIER", address(verifier));
        string memory json = vm.serializeAddress(obj, "NEXT_PUBLIC_ATTESTATION_CACHE", address(cache));
        vm.writeJson(json, "./deployments/base_sepolia.json");
        console.log("Updated deployments/base_sepolia.json");
    }
}
