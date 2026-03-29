// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AttestationCache }  from "../src/AttestationCache.sol";
import { SignetPass }        from "../src/examples/SignetPass.sol";
import { SignetPassFactory } from "../src/examples/SignetPassFactory.sol";

// ── Stub verifier that always passes ─────────────────────────────────────────

contract AlwaysPassVerifierP {
    function verifyProof(
        uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[3] calldata
    ) external pure returns (bool) { return true; }
}

// ── Mock DKIM registry that accepts all hashes ────────────────────────────────

contract MockDKIMRegistryP {
    function isValid(uint256) external pure returns (bool) { return true; }
}

// ── Test suite ────────────────────────────────────────────────────────────────

contract SignetPassTest is Test {

    AttestationCache   cache;
    AlwaysPassVerifierP verifier;
    SignetPass         pass;
    SignetPassFactory   factory;

    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address treasury = makeAddr("treasury");
    address owner    = makeAddr("owner");

    uint256 constant PUBKEY_HASH  = 0xAAAA;
    uint256 constant PUBKEY_HASH2 = 0xBBBB;
    uint256 constant TIMESTAMP    = 1_700_000_000; // Nov 2023
    uint256 constant CUTOFF       = 1_704_067_200; // Jan 1 2024
    uint256 constant FEE          = 0.001 ether;

    // ── helpers ──────────────────────────────────────────────────────────────

    function _attest(address wallet, uint256 ts, uint256 pkh) internal {
        uint[2]    memory pA = [uint(1), 2];
        uint[2][2] memory pB = [[uint(1), 2], [uint(3), 4]];
        uint[2]    memory pC = [uint(1), 2];
        uint[3]    memory sigs = [pkh, ts, uint256(uint160(wallet))];
        vm.prank(wallet);
        cache.attest(pA, pB, pC, sigs);
    }

    function _noHashes() internal pure returns (uint256[] memory) {
        return new uint256[](0);
    }

    function _oneHash(uint256 h) internal pure returns (uint256[] memory) {
        uint256[] memory arr = new uint256[](1);
        arr[0] = h;
        return arr;
    }

    function _twoHashes(uint256 a, uint256 b) internal pure returns (uint256[] memory) {
        uint256[] memory arr = new uint256[](2);
        arr[0] = a; arr[1] = b;
        return arr;
    }

    function setUp() public {
        verifier = new AlwaysPassVerifierP();
        address registry = address(new MockDKIMRegistryP());
        cache    = new AttestationCache(address(verifier), registry);

        // any exchange, FEE goes to treasury (Signet's treasury in prod)
        pass = new SignetPass(
            CUTOFF,
            _noHashes(),
            FEE,
            payable(treasury),
            address(cache)
        );

        factory = new SignetPassFactory(
            address(cache),
            payable(treasury),
            FEE
        );
    }

    // ── constructor ──────────────────────────────────────────────────────────

    function test_params() public view {
        assertEq(pass.cutoff(),      CUTOFF);
        assertEq(pass.feePerCheck(), FEE);
        assertEq(pass.treasury(),    treasury);
        assertEq(pass.getAllowedHashes().length, 0);
    }

    // ── verify — any exchange (happy path) ───────────────────────────────────

    function test_verify_happy() public {
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        vm.deal(alice, 1 ether);

        vm.expectEmit(true, false, false, false);
        emit SignetPass.Verified(alice);

        vm.prank(alice);
        pass.verify{ value: FEE }();

        assertTrue(pass.isVerified(alice));
        assertEq(treasury.balance, FEE);
    }

    function test_verify_free_pass() public {
        SignetPass free = new SignetPass(
            CUTOFF, _noHashes(), 0, payable(treasury), address(cache)
        );
        _attest(alice, TIMESTAMP, PUBKEY_HASH);

        vm.prank(alice);
        free.verify{ value: 0 }();
        assertTrue(free.isVerified(alice));
    }

    function test_verify_overpay_accepted() public {
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        pass.verify{ value: FEE * 2 }();
        assertTrue(pass.isVerified(alice));
        assertEq(treasury.balance, FEE * 2);
    }

    // ── verify — single exchange filter ──────────────────────────────────────

    function test_verify_single_hash_happy() public {
        SignetPass gated = new SignetPass(
            CUTOFF, _oneHash(PUBKEY_HASH), FEE, payable(treasury), address(cache)
        );
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        gated.verify{ value: FEE }();
        assertTrue(gated.isVerified(alice));
    }

    function test_verify_single_hash_wrong() public {
        SignetPass gated = new SignetPass(
            CUTOFF, _oneHash(PUBKEY_HASH), FEE, payable(treasury), address(cache)
        );
        _attest(alice, TIMESTAMP, PUBKEY_HASH2); // wrong hash
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SignetPass.SignetWrongExchange.selector, alice, PUBKEY_HASH2)
        );
        gated.verify{ value: FEE }();
    }

    // ── verify — multi exchange filter (OR logic) ─────────────────────────────

    function test_verify_multi_hash_first_matches() public {
        SignetPass multi = new SignetPass(
            CUTOFF, _twoHashes(PUBKEY_HASH, PUBKEY_HASH2), FEE, payable(treasury), address(cache)
        );
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        multi.verify{ value: FEE }();
        assertTrue(multi.isVerified(alice));
    }

    function test_verify_multi_hash_second_matches() public {
        SignetPass multi = new SignetPass(
            CUTOFF, _twoHashes(PUBKEY_HASH, PUBKEY_HASH2), FEE, payable(treasury), address(cache)
        );
        _attest(alice, TIMESTAMP, PUBKEY_HASH2);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        multi.verify{ value: FEE }();
        assertTrue(multi.isVerified(alice));
    }

    function test_verify_multi_hash_none_match() public {
        SignetPass multi = new SignetPass(
            CUTOFF, _twoHashes(PUBKEY_HASH, PUBKEY_HASH2), FEE, payable(treasury), address(cache)
        );
        uint256 OTHER_HASH = 0xCCCC;
        _attest(alice, TIMESTAMP, OTHER_HASH);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SignetPass.SignetWrongExchange.selector, alice, OTHER_HASH)
        );
        multi.verify{ value: FEE }();
    }

    // ── error cases ──────────────────────────────────────────────────────────

    function test_insufficient_fee() public {
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SignetPass.InsufficientFee.selector, 0, FEE)
        );
        pass.verify{ value: 0 }();
    }

    function test_already_verified() public {
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        vm.deal(alice, 2 ether);

        vm.prank(alice);
        pass.verify{ value: FEE }();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SignetPass.AlreadyVerified.selector, alice)
        );
        pass.verify{ value: FEE }();
    }

    function test_no_attestation() public {
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert();
        pass.verify{ value: FEE }();
    }

    function test_email_too_recent() public {
        uint256 afterCutoff = CUTOFF + 1;
        _attest(alice, afterCutoff, PUBKEY_HASH);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert();
        pass.verify{ value: FEE }();
    }

    // ── isEligible ────────────────────────────────────────────────────────────

    function test_is_eligible_true() public {
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        assertTrue(pass.isEligible(alice));
    }

    function test_is_eligible_no_attestation() public view {
        assertFalse(pass.isEligible(alice));
    }

    function test_is_eligible_too_recent() public {
        _attest(alice, CUTOFF + 1, PUBKEY_HASH);
        assertFalse(pass.isEligible(alice));
    }

    function test_is_eligible_with_exchange_filter() public {
        SignetPass gated = new SignetPass(
            CUTOFF, _oneHash(PUBKEY_HASH), FEE, payable(treasury), address(cache)
        );
        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        assertTrue(gated.isEligible(alice));

        _attest(bob, TIMESTAMP, PUBKEY_HASH2);
        assertFalse(gated.isEligible(bob));
    }

    // ── factory ───────────────────────────────────────────────────────────────

    function test_factory_deploy() public {
        address deployed = factory.deploy(CUTOFF, _noHashes(), owner);
        SignetPass p = SignetPass(deployed);

        assertEq(p.cutoff(),      CUTOFF);
        assertEq(p.feePerCheck(), FEE);
        assertEq(p.treasury(),    treasury);
        assertEq(p.getAllowedHashes().length, 0);
    }

    function test_factory_deploy_with_exchange_filter() public {
        address deployed = factory.deploy(CUTOFF, _oneHash(PUBKEY_HASH), owner);
        SignetPass p = SignetPass(deployed);
        assertEq(p.getAllowedHashes().length, 1);
        assertEq(p.getAllowedHashes()[0], PUBKEY_HASH);
    }

    function test_factory_deploy_multi_exchange() public {
        address deployed = factory.deploy(CUTOFF, _twoHashes(PUBKEY_HASH, PUBKEY_HASH2), owner);
        SignetPass p = SignetPass(deployed);
        assertEq(p.getAllowedHashes().length, 2);
    }

    function test_factory_full_flow() public {
        address deployed = factory.deploy(CUTOFF, _noHashes(), owner);
        SignetPass p = SignetPass(deployed);

        _attest(alice, TIMESTAMP, PUBKEY_HASH);
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        p.verify{ value: FEE }();

        assertTrue(p.isVerified(alice));
        assertEq(treasury.balance, FEE);
    }
}
