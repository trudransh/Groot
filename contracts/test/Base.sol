// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Forest} from "../src/Forest.sol";
import {PlantWallet} from "../src/PlantWallet.sol";

abstract contract Base is Test {
    uint256 constant PRICE = 1e12;
    bytes32 constant ROOT = bytes32(uint256(0xabc));
    string constant REQ = "req-1";

    address guardian = makeAddr("guardian");
    address supplier = makeAddr("supplier");
    address stranger = makeAddr("stranger");
    Forest forest;
    PlantWallet[] plants;
    address[] agents;

    function setUp() public virtual {
        forest = new Forest(guardian, supplier, PRICE, 2500, 150, 500);
    }

    function _deployForestWithPlants(uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            address agent = makeAddr(string.concat("agent", vm.toString(i)));
            PlantWallet w = new PlantWallet(address(forest), agent, guardian, 0);
            vm.prank(guardian);
            forest.registerPlant(address(w));
            plants.push(w);
            agents.push(agent);
        }
    }

    function _fund(address to, uint256 amount) internal {
        vm.deal(address(this), address(this).balance + amount);
        (bool ok,) = to.call{value: amount}("");
        require(ok);
    }
}
