// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { DKIMRegistry } from "../src/DKIMRegistry.sol";

contract DKIMRegistryTest is Test {

    DKIMRegistry registry;

    address alice = makeAddr("alice");

    uint256 constant HASH_A = 0x1111;
    uint256 constant HASH_B = 0x2222;
    uint256 constant HASH_C = 0x3333;

    function setUp() public {
        registry = new DKIMRegistry();
    }

    // ── setKey ────────────────────────────────────────────────────────────────

    function test_setKey_registers_hash() public {
        assertFalse(registry.isValid(HASH_A));

        vm.expectEmit(true, false, false, true);
        emit DKIMRegistry.KeySet(HASH_A, true);

        registry.setKey(HASH_A, true);
        assertTrue(registry.isValid(HASH_A));
    }

    function test_setKey_revokes_hash() public {
        registry.setKey(HASH_A, true);
        assertTrue(registry.isValid(HASH_A));

        vm.expectEmit(true, false, false, true);
        emit DKIMRegistry.KeySet(HASH_A, false);

        registry.setKey(HASH_A, false);
        assertFalse(registry.isValid(HASH_A));
    }

    function test_revert_setKey_notOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.setKey(HASH_A, true);
    }

    function test_revert_setKey_zeroHash() public {
        vm.expectRevert(DKIMRegistry.ZeroHash.selector);
        registry.setKey(0, true);
    }

    // ── setKeys (batch) ───────────────────────────────────────────────────────

    function test_setKeys_registers_batch() public {
        uint256[] memory hashes = new uint256[](3);
        hashes[0] = HASH_A;
        hashes[1] = HASH_B;
        hashes[2] = HASH_C;

        registry.setKeys(hashes, true);

        assertTrue(registry.isValid(HASH_A));
        assertTrue(registry.isValid(HASH_B));
        assertTrue(registry.isValid(HASH_C));
    }

    function test_setKeys_revokes_batch() public {
        uint256[] memory hashes = new uint256[](2);
        hashes[0] = HASH_A;
        hashes[1] = HASH_B;

        registry.setKeys(hashes, true);
        registry.setKeys(hashes, false);

        assertFalse(registry.isValid(HASH_A));
        assertFalse(registry.isValid(HASH_B));
    }

    function test_setKeys_emits_per_entry() public {
        uint256[] memory hashes = new uint256[](2);
        hashes[0] = HASH_A;
        hashes[1] = HASH_B;

        vm.expectEmit(true, false, false, true);
        emit DKIMRegistry.KeySet(HASH_A, true);
        vm.expectEmit(true, false, false, true);
        emit DKIMRegistry.KeySet(HASH_B, true);

        registry.setKeys(hashes, true);
    }

    function test_revert_setKeys_notOwner() public {
        uint256[] memory hashes = new uint256[](1);
        hashes[0] = HASH_A;
        vm.prank(alice);
        vm.expectRevert();
        registry.setKeys(hashes, true);
    }

    function test_revert_setKeys_zeroHash_in_batch() public {
        uint256[] memory hashes = new uint256[](3);
        hashes[0] = HASH_A;
        hashes[1] = 0;       // zero in the middle
        hashes[2] = HASH_C;

        vm.expectRevert(DKIMRegistry.ZeroHash.selector);
        registry.setKeys(hashes, true);

        // HASH_A was processed before the revert — state is rolled back by the EVM
        assertFalse(registry.isValid(HASH_A));
    }

    // ── Ownership (Ownable2Step) ──────────────────────────────────────────────

    function test_transferOwnership_twoStep() public {
        registry.transferOwnership(alice);
        assertEq(registry.owner(), address(this)); // pending — not yet active

        vm.prank(alice);
        registry.acceptOwnership();
        assertEq(registry.owner(), alice);
    }

    function test_pendingOwner_set_before_acceptance() public {
        registry.transferOwnership(alice);
        assertEq(registry.pendingOwner(), alice);
        assertEq(registry.owner(),        address(this));
    }

    function test_revert_transferOwnership_notOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.transferOwnership(alice);
    }

    function test_new_owner_can_setKey_after_transfer() public {
        registry.transferOwnership(alice);
        vm.prank(alice);
        registry.acceptOwnership();

        vm.prank(alice);
        registry.setKey(HASH_A, true);
        assertTrue(registry.isValid(HASH_A));
    }

    function test_old_owner_cannot_setKey_after_transfer() public {
        registry.transferOwnership(alice);
        vm.prank(alice);
        registry.acceptOwnership();

        vm.expectRevert();
        registry.setKey(HASH_A, true); // address(this) is no longer owner
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    function testFuzz_setKey_any_nonzero_hash(uint256 hash) public {
        vm.assume(hash != 0);
        registry.setKey(hash, true);
        assertTrue(registry.isValid(hash));
    }
}
