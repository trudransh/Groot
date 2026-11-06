// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.sol";
import {Forest} from "../src/Forest.sol";
import "../src/Errors.sol";

contract ForestTest is Base {
    function test_registerPlant_onlyGuardian() public {
        address w = makeAddr("wallet");
        vm.prank(stranger);
        vm.expectRevert(NotGuardian.selector);
        forest.registerPlant(w);

        vm.expectEmit(true, false, false, false);
        emit Forest.PlantRegistered(w);
        vm.prank(guardian);
        forest.registerPlant(w);
        assertTrue(forest.isPlant(w));
    }

    function test_setRules_emits() public {
        vm.prank(stranger);
        vm.expectRevert(NotGuardian.selector);
        forest.setRules(2e12, 1000, 100, 300);

        vm.expectEmit(false, false, false, true);
        emit Forest.RulesSet(2e12, 1000, 100, 300);
        vm.prank(guardian);
        forest.setRules(2e12, 1000, 100, 300);
        assertEq(forest.waterPriceWeiPerMl(), 2e12);
        assertEq(forest.shareLimitBps(), 1000);
        assertEq(forest.maxWaterMlPerOrder(), 100);
        assertEq(forest.maxWaterMlPerDay(), 300);
    }

    function test_registerHuman_onlyGuardian() public {
        address h = makeAddr("human");
        vm.prank(stranger);
        vm.expectRevert(NotGuardian.selector);
        forest.registerHuman(h);

        vm.expectEmit(true, false, false, false);
        emit Forest.HumanRegistered(h);
        vm.prank(guardian);
        forest.registerHuman(h);
        assertTrue(forest.isHuman(h));
    }

    function test_openHelpRequest_nonPlant_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(NotInForest.selector);
        forest.openHelpRequest(1 ether, REQ, ROOT);
    }

    function test_recordGift_nonPlant_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(NotInForest.selector);
        forest.recordGift(1, 1);
    }
}
