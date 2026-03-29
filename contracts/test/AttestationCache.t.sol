// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { DKIMRegistry }     from "../src/DKIMRegistry.sol";
import { AttestationCache } from "../src/AttestationCache.sol";

/// @dev Stub verifier: always passes or always fails depending on a flag.
contract StubVerifier {
    bool public shouldPass;
    constructor(bool _shouldPass) { shouldPass = _shouldPass; }
    function verifyProof(
        uint[2]    calldata,
        uint[2][2] calldata,
        uint[2]    calldata,
        uint[3]    calldata
    ) external view returns (bool) { return shouldPass; }
}

contract AttestationCacheTest is Test {

    DKIMRegistry     registry;
    StubVerifier     verifierOk;
    StubVerifier     verifierFail;
    AttestationCache cache;

    // Fixed test values — v2 circuit (partial-SHA, 3 public signals)
    uint256 constant PUBKEY_HASH  = 0x1111;
    uint256 constant TIMESTAMP    = 1_690_000_000; // Aug 2023

    address alice = makeAddr("alice");

    uint[2]    dummyA = [uint(1), 2];
    uint[2][2] dummyB = [[uint(1), uint(2)], [uint(3), uint(4)]];
    uint[2]    dummyC = [uint(1), 2];

    function setUp() public {
        verifierOk   = new StubVerifier(true);
        verifierFail = new StubVerifier(false);
        registry     = new DKIMRegistry();
        cache        = new AttestationCache(address(verifierOk), address(registry));

        registry.setKey(PUBKEY_HASH, true);
    }

    // Builds the 3-signal array: [pubkeyHash, email_timestamp, proverETHAddress]
    function _pubSignals(address wallet) internal pure returns (uint[3] memory sigs) {
        sigs[0] = PUBKEY_HASH;
        sigs[1] = TIMESTAMP;
        sigs[2] = uint256(uint160(wallet));
    }

    // ── Happy path ────────────────────────────────────────────────────────────

    function test_attest_succeeds() public {
        vm.expectEmit(true, false, false, true);
        emit AttestationCache.Attested(alice, TIMESTAMP, PUBKEY_HASH);

        vm.prank(alice);
        cache.attest(dummyA, dummyB, dummyC, _pubSignals(alice));

        assertTrue(cache.hasAttestation(alice));
        AttestationCache.Attestation memory a = cache.getAttestation(alice);
        assertEq(a.pubkeyHash,     PUBKEY_HASH);
        assertEq(a.emailTimestamp, TIMESTAMP);
        assertGt(a.registeredAt,   0);
    }

    // ── Failure cases ─────────────────────────────────────────────────────────

    function test_revert_invalid_proof() public {
        AttestationCache badCache = new AttestationCache(
            address(verifierFail), address(registry)
        );
        vm.prank(alice);
        vm.expectRevert(AttestationCache.InvalidProof.selector);
        badCache.attest(dummyA, dummyB, dummyC, _pubSignals(alice));
    }

    function test_revert_wallet_mismatch() public {
        address bob = makeAddr("bob");
        // Alice's address embedded in the proof but bob sends the tx
        vm.prank(bob);
        vm.expectRevert(AttestationCache.WalletMismatch.selector);
        cache.attest(dummyA, dummyB, dummyC, _pubSignals(alice));
    }

    function test_revert_unknown_dkim_key() public {
        uint[3] memory sigs = _pubSignals(alice);
        sigs[0] = 0x9999; // unregistered key
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AttestationCache.UnknownDKIMKey.selector, uint256(0x9999))
        );
        cache.attest(dummyA, dummyB, dummyC, sigs);
    }

    /// @dev Fuzz: any key other than the registered one must revert UnknownDKIMKey.
    function testFuzz_revert_unknown_dkim_key(uint256 randomKey) public {
        vm.assume(randomKey != PUBKEY_HASH);
        vm.assume(randomKey != 0); // 0 is rejected by DKIMRegistry.setKey (ZeroHash)

        uint[3] memory sigs = _pubSignals(alice);
        sigs[0] = randomKey;
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AttestationCache.UnknownDKIMKey.selector, randomKey)
        );
        cache.attest(dummyA, dummyB, dummyC, sigs);
    }

    function test_revert_wallet_already_attested() public {
        vm.prank(alice);
        cache.attest(dummyA, dummyB, dummyC, _pubSignals(alice));

        // Alice tries to register a second email from the same wallet
        uint[3] memory sigs2;
        sigs2[0] = PUBKEY_HASH;
        sigs2[1] = TIMESTAMP + 1000; // different timestamp (different email)
        sigs2[2] = uint256(uint160(alice));

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AttestationCache.WalletAlreadyAttested.selector, alice)
        );
        cache.attest(dummyA, dummyB, dummyC, sigs2);
    }

    // ── dryRunAttest ──────────────────────────────────────────────────────────

    function test_dryRun_emits_event_no_storage() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit AttestationCache.Attested(alice, TIMESTAMP, PUBKEY_HASH);
        cache.dryRunAttest(dummyA, dummyB, dummyC, _pubSignals(alice));

        // Storage must NOT be written
        assertFalse(cache.hasAttestation(alice));
    }

    function test_dryRun_repeatable() public {
        vm.prank(alice);
        cache.dryRunAttest(dummyA, dummyB, dummyC, _pubSignals(alice));
        // Second call with the same proof must also succeed
        vm.prank(alice);
        cache.dryRunAttest(dummyA, dummyB, dummyC, _pubSignals(alice));
        assertFalse(cache.hasAttestation(alice));
    }

    function test_dryRun_revert_invalid_proof() public {
        AttestationCache badCache = new AttestationCache(
            address(verifierFail), address(registry)
        );
        vm.prank(alice);
        vm.expectRevert(AttestationCache.InvalidProof.selector);
        badCache.dryRunAttest(dummyA, dummyB, dummyC, _pubSignals(alice));
    }

    // ── Owner / pause functions ───────────────────────────────────────────────

    function test_transferOwnership_twoStep() public {
        // Ownable2Step: transfer is pending until new owner accepts
        cache.transferOwnership(alice);
        assertEq(cache.owner(), address(this)); // still old owner during pending
        vm.prank(alice);
        cache.acceptOwnership();
        assertEq(cache.owner(), alice);
    }

    function test_revert_transferOwnership_notOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        cache.transferOwnership(alice);
    }

    function test_pause_blocks_attest() public {
        cache.pause();
        vm.prank(alice);
        vm.expectRevert();
        cache.attest(dummyA, dummyB, dummyC, _pubSignals(alice));
    }

    function test_unpause_allows_attest() public {
        cache.pause();
        cache.unpause();
        vm.prank(alice);
        cache.attest(dummyA, dummyB, dummyC, _pubSignals(alice));
        assertTrue(cache.hasAttestation(alice));
    }
}
