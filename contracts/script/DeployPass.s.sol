// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { SignetPassFactory } from "../src/examples/SignetPassFactory.sol";

/// @notice Deploy a SignetPassFactory and an initial SignetPass.
///
///   Required env vars:
///     SIGNET_ADDRESS    — AttestationCache address (e.g. 0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1 on Base Sepolia)
///     SIGNET_TREASURY   — Signet's fee recipient address
///     CUTOFF_UNIX       — Account cutoff (Unix seconds). Accounts with email timestamps before this qualify.
///
///   Optional env vars:
///     SIGNET_FEE_WEI    — Fee per verify() call in wei (default: 0 = free)
///     OWNER             — Pass owner address (defaults to broadcaster / msg.sender)
///     ALLOWED_HASHES    — Comma-separated list of pubkey hashes to restrict exchanges.
///                         Leave unset or empty to accept any supported exchange.
///                         Example: "19806930313339437892543285869542575252100319438226679350463646898451946018980,7530370953244161785305698736227894091331396871750461845654044902833037341886"
///
/// Example (any exchange, 1 Jan 2024 cutoff, free):
///   SIGNET_ADDRESS=0x7e80601CbEdA2302e3eB11a05bC621e5453d8fC1 \
///   SIGNET_TREASURY=0xYourTreasury \
///   CUTOFF_UNIX=1704067200 \
///   forge script script/DeployPass.s.sol \
///     --rpc-url base_sepolia --account <keystore> --broadcast -vvvv
contract DeployPass is Script {

    function run() external {
        address signetAddr             = vm.envAddress("SIGNET_ADDRESS");
        address payable signetTreasury = payable(vm.envAddress("SIGNET_TREASURY"));
        uint256 signetFee              = vm.envOr("SIGNET_FEE_WEI", uint256(0));
        uint256 cutoffUnix             = vm.envOr("CUTOFF_UNIX",    uint256(0));

        require(signetAddr     != address(0), "SIGNET_ADDRESS required");
        require(signetTreasury != address(0), "SIGNET_TREASURY required");
        require(cutoffUnix      > 0,          "CUTOFF_UNIX required");

        address owner = vm.envOr("OWNER", msg.sender);

        // Parse optional comma-separated ALLOWED_HASHES.
        // Format: "hash1,hash2,hash3" — leave unset or empty for any exchange.
        uint256[] memory allowedHashes = _parseAllowedHashes();

        vm.startBroadcast();

        SignetPassFactory factory = new SignetPassFactory(
            signetAddr,
            signetTreasury,
            signetFee
        );
        console.log("SignetPassFactory:", address(factory));

        address pass = factory.deploy(cutoffUnix, allowedHashes, owner);
        console.log("SignetPass:       ", pass);

        vm.stopBroadcast();

        console.log("---");
        console.log("Cutoff:        ", cutoffUnix);
        console.log("Fee(wei):      ", signetFee);
        console.log("Treasury:      ", signetTreasury);
        console.log("Owner:         ", owner);
        console.log("AllowedHashes: ", allowedHashes.length == 0 ? "any exchange" : _joinHashes(allowedHashes));
    }

    /// @dev Parse ALLOWED_HASHES env var (comma-separated uint256 strings).
    ///      Returns an empty array if the var is unset or empty.
    function _parseAllowedHashes() internal view returns (uint256[] memory) {
        string memory raw = vm.envOr("ALLOWED_HASHES", string(""));
        if (bytes(raw).length == 0) return new uint256[](0);

        // Count commas to size the array.
        bytes memory b = bytes(raw);
        uint256 count = 1;
        for (uint256 i; i < b.length; ++i) {
            if (b[i] == bytes1(",")) ++count;
        }

        uint256[] memory result = new uint256[](count);
        uint256 idx;
        uint256 start;
        for (uint256 i; i <= b.length; ++i) {
            if (i == b.length || b[i] == bytes1(",")) {
                bytes memory token = _slice(b, start, i);
                result[idx++] = _parseUint(token);
                start = i + 1;
            }
        }
        return result;
    }

    function _slice(bytes memory b, uint256 from, uint256 to) internal pure returns (bytes memory) {
        bytes memory out = new bytes(to - from);
        for (uint256 i; i < to - from; ++i) out[i] = b[from + i];
        return out;
    }

    function _parseUint(bytes memory b) internal pure returns (uint256 v) {
        for (uint256 i; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            // Skip whitespace
            if (c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d) continue;
            require(c >= 0x30 && c <= 0x39, "ALLOWED_HASHES: invalid character");
            v = v * 10 + (c - 0x30);
        }
    }

    function _joinHashes(uint256[] memory hashes) internal pure returns (string memory out) {
        for (uint256 i; i < hashes.length; ++i) {
            if (i > 0) out = string.concat(out, ",");
            out = string.concat(out, vm.toString(hashes[i]));
        }
    }
}
