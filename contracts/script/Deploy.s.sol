// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {Forest} from "../src/Forest.sol";
import {PlantWallet} from "../src/PlantWallet.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        uint256 guardianKey = vm.envUint("GUARDIAN_EXECUTOR_KEY");
        address guardian = vm.addr(guardianKey);
        require(guardian == vm.envAddress("GUARDIAN_EXECUTOR"), "GUARDIAN_EXECUTOR does not match its key");
        address[] memory agents = vm.envAddress("PLANT_AGENTS", ",");
        uint256[] memory reserves = vm.envUint("PLANT_RESERVES_WEI", ",");
        require(agents.length == reserves.length, "PLANT_AGENTS and PLANT_RESERVES_WEI differ in length");

        vm.startBroadcast(deployerKey);
        Forest forest = new Forest(guardian, vm.envAddress("SUPPLIER"), 1e12, 2500, 150, 500);
        address[] memory wallets = new address[](agents.length);
        for (uint256 i = 0; i < agents.length; i++) {
            wallets[i] = address(new PlantWallet(address(forest), agents[i], guardian, reserves[i]));
        }
        vm.stopBroadcast();

        vm.startBroadcast(guardianKey);
        for (uint256 i = 0; i < wallets.length; i++) {
            forest.registerPlant(wallets[i]);
        }
        vm.stopBroadcast();

        string memory plants = "";
        for (uint256 i = 0; i < wallets.length; i++) {
            plants = string.concat(
                plants,
                i == 0 ? "" : ",",
                '{"agent":"', vm.toString(agents[i]),
                '","wallet":"', vm.toString(wallets[i]),
                '","reserveWei":"', vm.toString(reserves[i]), '"}'
            );
        }
        string memory json = string.concat('{"forest":"', vm.toString(address(forest)), '","plants":[', plants, "]}");
        vm.writeFile(string.concat("deployments/", vm.toString(block.chainid), ".json"), json);
    }
}
