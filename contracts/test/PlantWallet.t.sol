// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.sol";
import {Forest} from "../src/Forest.sol";
import {PlantWallet} from "../src/PlantWallet.sol";
import "../src/Errors.sol";

contract PlantWalletTest is Base {
    PlantWallet giver;
    PlantWallet sapling;

    function setUp() public override {
        super.setUp();
        _deployForestWithPlants(2);
        giver = plants[0];
        sapling = plants[1];
    }

    function _giftSetup() internal returns (uint256 id) {
        _fund(address(giver), 5e16);
        vm.prank(guardian);
        giver.setReserve(1e16);
        vm.prank(agents[1]);
        id = sapling.askHelp(2e16, REQ, ROOT);
    }

    function _lift_shareLimit() internal {
        vm.prank(guardian);
        forest.setRules(PRICE, 10000, 150, 500);
    }

    function _human() internal returns (address human) {
        human = makeAddr("human");
        vm.prank(guardian);
        forest.registerHuman(human);
    }


    function test_receive_emitsFunded() public {
        vm.expectEmit(true, false, false, true);
        emit PlantWallet.Funded(address(this), 1 ether);
        _fund(address(giver), 1 ether);
        assertEq(address(giver).balance, 1 ether);
    }

    function test_logDecision_onlyAgent() public {
        vm.prank(stranger);
        vm.expectRevert(NotAgent.selector);
        giver.logDecision(1, REQ, ROOT);

        vm.expectEmit(false, false, false, true);
        emit PlantWallet.DecisionLogged(1, REQ, ROOT);
        vm.prank(agents[0]);
        giver.logDecision(1, REQ, ROOT);
    }

    function test_agentOnlyFunctions_revertForOthers() public {
        vm.startPrank(stranger);
        vm.expectRevert(NotAgent.selector);
        giver.orderWater(10, REQ, ROOT);
        vm.expectRevert(NotAgent.selector);
        giver.askHelp(1, REQ, ROOT);
        vm.expectRevert(NotAgent.selector);
        giver.give(address(sapling), 1, 1, REQ, ROOT);
        vm.expectRevert(NotAgent.selector);
        giver.payHuman(stranger, 0, 1, REQ, ROOT);
        vm.stopPrank();
    }

    function test_guardianFunctions_revertForOthers() public {
        vm.startPrank(stranger);
        vm.expectRevert(NotGuardian.selector);
        giver.setReserve(1);
        vm.expectRevert(NotGuardian.selector);
        giver.setAgent(stranger);
        vm.expectRevert(NotGuardian.selector);
        giver.guardianWithdraw(stranger, 1);
        vm.stopPrank();
    }

    function test_setReserve_setAgent_emit() public {
        vm.expectEmit(true, false, false, true);
        emit PlantWallet.GuardianAction(PlantWallet.setReserve.selector, abi.encodeCall(PlantWallet.setReserve, (7)));
        vm.prank(guardian);
        giver.setReserve(7);
        assertEq(giver.reserveWei(), 7);

        vm.expectEmit(true, false, false, true);
        emit PlantWallet.GuardianAction(PlantWallet.setAgent.selector, abi.encodeCall(PlantWallet.setAgent, (stranger)));
        vm.prank(guardian);
        giver.setAgent(stranger);
        assertEq(giver.agent(), stranger);
    }

    function test_guardianWithdraw_moves() public {
        _fund(address(giver), 1 ether);
        address to = makeAddr("to");
        vm.prank(guardian);
        giver.guardianWithdraw(to, 0.4 ether);
        assertEq(to.balance, 0.4 ether);
        assertEq(address(giver).balance, 0.6 ether);
    }

    function test_guardianWithdraw_zeroAddress_reverts() public {
        _fund(address(giver), 1 ether);
        vm.prank(guardian);
        vm.expectRevert(ZeroAddress.selector);
        giver.guardianWithdraw(address(0), 1);
    }


    function test_orderWater_paysSupplier() public {
        _fund(address(giver), 1 ether);
        vm.expectEmit(true, false, false, true);
        emit PlantWallet.WaterOrdered(1, 100, 100 * PRICE, REQ, ROOT);
        vm.prank(agents[0]);
        uint256 id = giver.orderWater(100, REQ, ROOT);
        assertEq(id, 1);
        assertEq(supplier.balance, 100 * PRICE);
    }

    function test_orderWater_perOrderCap() public {
        _fund(address(giver), 1 ether);
        vm.prank(agents[0]);
        vm.expectRevert(WaterCapExceeded.selector);
        giver.orderWater(151, REQ, ROOT);
    }

    function test_orderWater_perDayCap() public {
        _fund(address(giver), 1 ether);
        vm.startPrank(agents[0]);
        giver.orderWater(150, REQ, ROOT);
        giver.orderWater(150, REQ, ROOT);
        giver.orderWater(150, REQ, ROOT);
        giver.orderWater(50, REQ, ROOT);
        vm.expectRevert(WaterCapExceeded.selector);
        giver.orderWater(1, REQ, ROOT);
        vm.stopPrank();
    }

    function test_orderWater_dayResets() public {
        _fund(address(giver), 1 ether);
        vm.startPrank(agents[0]);
        for (uint256 i = 0; i < 3; i++) giver.orderWater(150, REQ, ROOT);
        giver.orderWater(50, REQ, ROOT);
        vm.warp(block.timestamp + 1 days);
        giver.orderWater(150, REQ, ROOT);
        vm.stopPrank();
    }

    function test_orderWater_canSpendReserve() public {
        _fund(address(giver), 100 * PRICE);
        vm.prank(guardian);
        giver.setReserve(100 * PRICE);
        vm.prank(agents[0]);
        giver.orderWater(100, REQ, ROOT);
        assertEq(address(giver).balance, 0);
    }

    function test_orderWater_insufficientBalance() public {
        _fund(address(giver), 10 * PRICE);
        vm.prank(agents[0]);
        vm.expectRevert(InsufficientBalance.selector);
        giver.orderWater(11, REQ, ROOT);
    }


    function test_askHelp_opensRequest() public {
        vm.expectEmit(true, true, false, true);
        emit Forest.HelpRequested(1, address(sapling), 2e16, REQ, ROOT);
        vm.prank(agents[1]);
        uint256 id = sapling.askHelp(2e16, REQ, ROOT);
        assertEq(id, 1);
        assertEq(forest.openRequestOf(address(sapling)), 1);
        (address plant, uint256 amount, uint256 filled, bool open) = forest.helpRequest(1);
        assertEq(plant, address(sapling));
        assertEq(amount, 2e16);
        assertEq(filled, 0);
        assertTrue(open);
    }

    function test_askHelp_secondWhileOpen_reverts() public {
        vm.startPrank(agents[1]);
        sapling.askHelp(1, REQ, ROOT);
        vm.expectRevert(RequestAlreadyOpen.selector);
        sapling.askHelp(1, REQ, ROOT);
        vm.stopPrank();
    }

    function test_give_movesAndRecords() public {
        uint256 id = _giftSetup();
        vm.expectEmit(true, true, false, true);
        emit PlantWallet.Gift(address(sapling), id, 5e15, REQ, ROOT);
        vm.prank(agents[0]);
        giver.give(address(sapling), id, 5e15, REQ, ROOT);
        assertEq(address(sapling).balance, 5e15);
        (,, uint256 filled, bool open) = forest.helpRequest(id);
        assertEq(filled, 5e15);
        assertTrue(open);
    }

    function test_give_exactRemaining_closesRequest() public {
        uint256 id = _giftSetup();
        _lift_shareLimit();
        vm.expectEmit(true, false, false, false);
        emit Forest.HelpFilled(id);
        vm.prank(agents[0]);
        giver.give(address(sapling), id, 2e16, REQ, ROOT);
        (,,, bool open) = forest.helpRequest(id);
        assertFalse(open);
        assertEq(forest.openRequestOf(address(sapling)), 0);
    }

    function test_give_oneWeiOver_reverts() public {
        uint256 id = _giftSetup();
        _lift_shareLimit();
        vm.prank(agents[0]);
        vm.expectRevert(NoOpenRequest.selector);
        giver.give(address(sapling), id, 2e16 + 1, REQ, ROOT);
    }

    function test_give_notInForest() public {
        uint256 id = _giftSetup();
        vm.prank(agents[0]);
        vm.expectRevert(NotInForest.selector);
        giver.give(stranger, id, 1, REQ, ROOT);
    }

    function test_give_noOpenRequest() public {
        _giftSetup();
        vm.prank(agents[0]);
        vm.expectRevert(NoOpenRequest.selector);
        giver.give(address(sapling), 99, 1, REQ, ROOT);
    }

    function test_give_selfGift_reverts() public {
        _giftSetup();
        vm.startPrank(agents[0]);
        uint256 ownId = giver.askHelp(1e16, REQ, ROOT);
        vm.expectRevert(NoOpenRequest.selector);
        giver.give(address(giver), ownId, 1, REQ, ROOT);
        vm.stopPrank();
    }

    function test_give_reserveBreached() public {
        uint256 id = _giftSetup();
        vm.prank(guardian);
        giver.setReserve(5e16);
        vm.prank(agents[0]);
        vm.expectRevert(ReserveBreached.selector);
        giver.give(address(sapling), id, 1, REQ, ROOT);
    }

    function test_give_overShareLimit() public {
        uint256 id = _giftSetup();
        vm.startPrank(agents[0]);
        giver.give(address(sapling), id, 1e16, REQ, ROOT);
        vm.expectRevert(OverShareLimit.selector);
        giver.give(address(sapling), id, 1, REQ, ROOT);
        vm.stopPrank();
    }

    function test_shareWindow_resetsAt24h() public {
        uint256 id = _giftSetup();
        vm.startPrank(agents[0]);
        giver.give(address(sapling), id, 1e16, REQ, ROOT);
        vm.warp(block.timestamp + 1 days - 1);
        vm.expectRevert(OverShareLimit.selector);
        giver.give(address(sapling), id, 1, REQ, ROOT);
        vm.warp(block.timestamp + 1);
        giver.give(address(sapling), id, 7.5e15, REQ, ROOT);
        vm.expectRevert(OverShareLimit.selector);
        giver.give(address(sapling), id, 1, REQ, ROOT);
        vm.stopPrank();
    }

    function testFuzz_give_neverBelowReserve(uint96 reserve, uint96 a1, uint96 a2, uint96 a3) public {
        _fund(address(giver), 100 ether);
        vm.prank(guardian);
        giver.setReserve(bound(reserve, 0, 100 ether));
        vm.prank(agents[1]);
        uint256 id = sapling.askHelp(1000 ether, REQ, ROOT);
        uint96[3] memory amounts = [a1, a2, a3];
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(agents[0]);
            try giver.give(address(sapling), id, amounts[i], REQ, ROOT) {} catch {}
            assertGe(address(giver).balance, giver.reserveWei());
        }
    }


    function test_payHuman_refill_paysVerifiedHuman() public {
        _fund(address(giver), 5e16);
        vm.prank(guardian);
        giver.setReserve(1e16);
        address human = _human();

        vm.expectEmit(true, true, false, true);
        emit PlantWallet.HumanPaid(human, 0, 5e15, REQ, ROOT);
        vm.prank(agents[0]);
        giver.payHuman(human, 0, 5e15, REQ, ROOT);
        assertEq(human.balance, 5e15);
    }

    function test_payHuman_unverified_reverts() public {
        _fund(address(giver), 1 ether);
        vm.prank(agents[0]);
        vm.expectRevert(NotVerifiedHuman.selector);
        giver.payHuman(stranger, 0, 1, REQ, ROOT);
    }

    function test_payHuman_fillsHelpRequest() public {
        uint256 id = _giftSetup();
        address human = _human();
        _lift_shareLimit();

        vm.startPrank(agents[0]);
        giver.payHuman(human, id, 1e16, REQ, ROOT);
        (,, uint256 filled, bool open) = forest.helpRequest(id);
        assertEq(filled, 1e16);
        assertTrue(open);

        vm.expectEmit(true, false, false, false);
        emit Forest.HelpFilled(id);
        giver.payHuman(human, id, 1e16, REQ, ROOT);
        vm.stopPrank();
        (,,, open) = forest.helpRequest(id);
        assertFalse(open);
        assertEq(human.balance, 2e16);
        assertEq(address(sapling).balance, 0);
    }

    function test_payHuman_overUnfilled_reverts() public {
        uint256 id = _giftSetup();
        address human = _human();
        _lift_shareLimit();
        vm.prank(agents[0]);
        vm.expectRevert(NoOpenRequest.selector);
        giver.payHuman(human, id, 2e16 + 1, REQ, ROOT);
    }

    function test_payHuman_cannotFillOwnRequest() public {
        _giftSetup();
        address human = _human();
        vm.startPrank(agents[0]);
        uint256 ownId = giver.askHelp(1e16, REQ, ROOT);
        vm.expectRevert(NoOpenRequest.selector);
        giver.payHuman(human, ownId, 1, REQ, ROOT);
        vm.stopPrank();
    }

    function test_payHuman_appliesReserveAndShareLimit() public {
        _giftSetup();
        address human = _human();

        vm.startPrank(agents[0]);
        giver.payHuman(human, 0, 1e16, REQ, ROOT);
        vm.expectRevert(OverShareLimit.selector);
        giver.payHuman(human, 0, 1, REQ, ROOT);
        vm.stopPrank();

        vm.prank(guardian);
        giver.setReserve(address(giver).balance);
        vm.warp(block.timestamp + 1 days);
        vm.prank(agents[0]);
        vm.expectRevert(ReserveBreached.selector);
        giver.payHuman(human, 0, 1, REQ, ROOT);
    }
}
