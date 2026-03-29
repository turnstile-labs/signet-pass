// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import { SignetGated }   from "../src/SignetGated.sol";
import { SignetAirdrop } from "../src/examples/SignetAirdrop.sol";
import { AttestationCache } from "../src/AttestationCache.sol";

// ── Minimal ERC-20 for testing ────────────────────────────────────────────────

contract TestToken is ERC20 {
    constructor() ERC20("Test", "TST") {
        _mint(msg.sender, 1_000_000e18);
    }
}

// ── Stub verifier that always passes ─────────────────────────────────────────

contract AlwaysPassVerifier {
    function verifyProof(
        uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[3] calldata
    ) external pure returns (bool) { return true; }
}

// ── Harness that exposes SignetGated on a custom cache address ─────────────────

contract Harness is SignetGated {
    address private _cache;
    constructor(address cache) { _cache = cache; }
    function _signetAddress() internal view override returns (address) { return _cache; }

    function checkEligible(address w, uint256 cutoff) external view returns (bool) {
        return isSignetEligible(w, cutoff);
    }
    function checkEligibleDomain(address w, uint256 cutoff, uint256 pkh) external view returns (bool) {
        return isSignetEligibleDomain(w, cutoff, pkh);
    }
    function doRequireSignet(address w, uint256 cutoff) external view {
        requireSignet(w, cutoff);
    }
    function doRequireSignetDomain(address w, uint256 cutoff, uint256 pkh) external view {
        requireSignetDomain(w, cutoff, pkh);
    }
}

// ── Main test suite ───────────────────────────────────────────────────────────

contract SignetGatedTest is Test {
    AttestationCache  cache;
    AlwaysPassVerifier verifier;
    Harness           harness;
    TestToken         token;
    SignetAirdrop     airdrop;

    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");

    uint256 constant PUBKEY_HASH = 0x1111;
    uint256 constant TIMESTAMP   = 1_700_000_000; // Nov 2023
    uint256 constant CUTOFF      = 1_704_067_200; // Jan 1 2024
    uint256 constant AMOUNT      = 100e18;

    uint[2]    dummyA = [uint(1), 2];
    uint[2][2] dummyB = [[uint(1), 2], [uint(3), 4]];
    uint[2]    dummyC = [uint(1), 2];

    // Stub DKIMRegistry that validates PUBKEY_HASH
    address registry;

    function setUp() public {
        verifier = new AlwaysPassVerifier();

        // Deploy a mock registry that validates all pubkeys
        vm.startPrank(address(this));
        registry = address(new MockRegistry());
        cache    = new AttestationCache(address(verifier), registry);
        vm.stopPrank();

        harness = new Harness(address(cache));

        token   = new TestToken();
        // CustomSignetAirdrop wires the airdrop to our local cache instead of
        // the default SIGNET_BASE_SEPOLIA address.
        airdrop = new CustomSignetAirdrop(
            address(token), CUTOFF, AMOUNT, address(this), address(cache)
        );

        token.transfer(address(airdrop), 1_000e18);
        airdrop.open();

        // Register alice with an old email timestamp
        uint[3] memory sigs = [PUBKEY_HASH, TIMESTAMP, uint256(uint160(alice))];
        vm.prank(alice);
        cache.attest(dummyA, dummyB, dummyC, sigs);
    }

    // ── SignetGated helpers ────────────────────────────────────────────────────

    function test_isEligible_true() public view {
        assertTrue(harness.checkEligible(alice, CUTOFF));
    }

    function test_isEligible_false_no_attestation() public view {
        assertFalse(harness.checkEligible(bob, CUTOFF));
    }

    function test_isEligible_false_too_recent() public view {
        // TIMESTAMP >= CUTOFF → not eligible
        assertFalse(harness.checkEligible(alice, TIMESTAMP));
    }

    function test_isEligibleDomain_true() public view {
        assertTrue(harness.checkEligibleDomain(alice, CUTOFF, PUBKEY_HASH));
    }

    function test_isEligibleDomain_false_wrong_domain() public view {
        assertFalse(harness.checkEligibleDomain(alice, CUTOFF, 0x9999));
    }

    function test_requireSignet_passes() public view {
        harness.doRequireSignet(alice, CUTOFF);
    }

    function test_requireSignet_reverts_no_attestation() public {
        vm.expectRevert(abi.encodeWithSelector(SignetGated.SignetNoAttestation.selector, bob));
        harness.doRequireSignet(bob, CUTOFF);
    }

    function test_requireSignet_reverts_too_recent() public {
        vm.expectRevert(
            abi.encodeWithSelector(SignetGated.SignetEmailTooRecent.selector, alice, TIMESTAMP, TIMESTAMP)
        );
        harness.doRequireSignet(alice, TIMESTAMP);
    }

    function test_requireSignetDomain_reverts_wrong_domain() public {
        vm.expectRevert(
            abi.encodeWithSelector(SignetGated.SignetWrongDomain.selector, alice, PUBKEY_HASH, uint256(0x9999))
        );
        harness.doRequireSignetDomain(alice, CUTOFF, 0x9999);
    }

    // ── SignetAirdrop ─────────────────────────────────────────────────────────

    function test_airdrop_claim_succeeds() public {
        assertFalse(airdrop.claimed(alice));

        vm.expectEmit(true, false, false, true);
        emit SignetAirdrop.Claimed(alice, AMOUNT, TIMESTAMP);

        vm.prank(alice);
        airdrop.claim();
        assertTrue(airdrop.claimed(alice));
        assertEq(token.balanceOf(alice), AMOUNT);
    }

    function test_airdrop_claim_reverts_double_claim() public {
        vm.prank(alice);
        airdrop.claim();
        vm.expectRevert(SignetAirdrop.AlreadyClaimed.selector);
        vm.prank(alice);
        airdrop.claim();
    }

    function test_airdrop_claim_reverts_no_attestation() public {
        vm.expectRevert(abi.encodeWithSelector(SignetGated.SignetNoAttestation.selector, bob));
        vm.prank(bob);
        airdrop.claim();
    }

    function test_airdrop_isEligible() public view {
        assertTrue(airdrop.isEligible(alice));
        assertFalse(airdrop.isEligible(bob));
    }

    function test_airdrop_sweep() public {
        uint256 airdropBal = token.balanceOf(address(airdrop));
        uint256 beforeBal  = token.balanceOf(address(this));
        airdrop.sweep(address(this));
        assertEq(token.balanceOf(address(this)), beforeBal + airdropBal);
        assertEq(token.balanceOf(address(airdrop)), 0);
    }

    function test_airdrop_pause() public {
        airdrop.close();
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(alice);
        airdrop.claim();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

contract MockRegistry {
    function isValid(uint256) external pure returns (bool) { return true; }
}

/// SignetAirdrop with a configurable Signet address (for testing against a local cache).
contract CustomSignetAirdrop is SignetAirdrop {
    address private immutable _signet;

    constructor(
        address token, uint256 cutoff, uint256 amount, address owner, address signet
    ) SignetAirdrop(token, cutoff, amount, owner) {
        _signet = signet;
    }

    function _signetAddress() internal view override returns (address) {
        return _signet;
    }
}
