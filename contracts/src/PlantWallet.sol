// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Errors.sol";
import {Forest} from "./Forest.sol";

contract PlantWallet {
    uint256 private constant WINDOW = 1 days;

    Forest public immutable forest;
    address public immutable guardianExecutor;
    address public agent;
    uint256 public reserveWei;

    uint256 public orderCount;
    uint256 private _waterWindowStart;
    uint256 private _waterMlInWindow;

    uint256 private _giftWindowStart;
    uint256 private _giftSurplusWei;
    uint256 private _giftedWei;

    event Funded(address indexed from, uint256 amountWei);
    event WaterOrdered(uint256 indexed orderId, uint32 ml, uint256 costWei, string requestId, bytes32 root);
    event Gift(address indexed to, uint256 indexed helpRequestId, uint256 amountWei, string requestId, bytes32 root);
    event HumanPaid(address indexed to, uint256 indexed helpRequestId, uint256 amountWei, string requestId, bytes32 root);
    event DecisionLogged(uint8 action, string requestId, bytes32 root);
    event GuardianAction(bytes4 indexed selector, bytes data);

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardianExecutor) revert NotGuardian();
        _;
        emit GuardianAction(msg.sig, msg.data);
    }

    constructor(address forest_, address agent_, address guardianExecutor_, uint256 reserveWei_) {
        forest = Forest(forest_);
        agent = agent_;
        guardianExecutor = guardianExecutor_;
        reserveWei = reserveWei_;
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    function orderWater(uint32 ml, string calldata requestId, bytes32 root) external onlyAgent returns (uint256 orderId) {
        if (ml > forest.maxWaterMlPerOrder()) revert WaterCapExceeded();
        if (_waterWindowStart == 0 || block.timestamp >= _waterWindowStart + WINDOW) {
            _waterWindowStart = block.timestamp;
            _waterMlInWindow = 0;
        }
        if (_waterMlInWindow + ml > forest.maxWaterMlPerDay()) revert WaterCapExceeded();
        uint256 cost = uint256(ml) * forest.waterPriceWeiPerMl();
        if (address(this).balance < cost) revert InsufficientBalance();

        _waterMlInWindow += ml;
        orderId = ++orderCount;
        _send(forest.supplier(), cost);
        emit WaterOrdered(orderId, ml, cost, requestId, root);
    }

    function askHelp(uint256 amountWei, string calldata requestId, bytes32 root) external onlyAgent returns (uint256 id) {
        return forest.openHelpRequest(amountWei, requestId, root);
    }

    function give(address to, uint256 helpRequestId, uint256 amountWei, string calldata requestId, bytes32 root)
        external
        onlyAgent
    {
        if (!forest.isPlant(to)) revert NotInForest();
        (address owner,,,) = forest.helpRequest(helpRequestId);
        if (owner != to) revert NoOpenRequest();
        forest.recordGift(helpRequestId, amountWei);
        _spend(amountWei);
        _send(to, amountWei);
        emit Gift(to, helpRequestId, amountWei, requestId, root);
    }

    function payHuman(address to, uint256 helpRequestId, uint256 amountWei, string calldata requestId, bytes32 root)
        external
        onlyAgent
    {
        if (!forest.isHuman(to)) revert NotVerifiedHuman();
        if (helpRequestId != 0) forest.recordGift(helpRequestId, amountWei);
        _spend(amountWei);
        _send(to, amountWei);
        emit HumanPaid(to, helpRequestId, amountWei, requestId, root);
    }

    function logDecision(uint8 action, string calldata requestId, bytes32 root) external onlyAgent {
        emit DecisionLogged(action, requestId, root);
    }

    function setReserve(uint256 reserveWei_) external onlyGuardian {
        reserveWei = reserveWei_;
    }

    function setAgent(address agent_) external onlyGuardian {
        agent = agent_;
    }

    function guardianWithdraw(address to, uint256 amountWei) external onlyGuardian {
        if (to == address(0)) revert ZeroAddress();
        _send(to, amountWei);
    }

    function giftedInWindowWei() external view returns (uint256) {
        return block.timestamp >= _giftWindowStart + WINDOW ? 0 : _giftedWei;
    }

    function _spend(uint256 amount) private {
        uint256 bal = address(this).balance;
        if (bal < amount || bal - amount < reserveWei) revert ReserveBreached();
        if (_giftWindowStart == 0 || block.timestamp >= _giftWindowStart + WINDOW) {
            _giftWindowStart = block.timestamp;
            _giftSurplusWei = bal > reserveWei ? bal - reserveWei : 0;
            _giftedWei = 0;
        }
        if (_giftedWei + amount > _giftSurplusWei * forest.shareLimitBps() / 10000) revert OverShareLimit();
        _giftedWei += amount;
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
