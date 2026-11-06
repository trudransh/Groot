// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Errors.sol";

contract Forest {
    address public immutable guardianExecutor;
    address public immutable supplier;
    uint256 public waterPriceWeiPerMl;
    uint16 public shareLimitBps;
    uint32 public maxWaterMlPerOrder;
    uint32 public maxWaterMlPerDay;

    mapping(address => bool) public isPlant;
    mapping(address => bool) public isHuman;
    mapping(address => uint256) public openRequestOf;

    struct Request {
        address plant;
        uint256 amountWei;
        uint256 filledWei;
        bool open;
    }

    mapping(uint256 => Request) private _requests;
    uint256 public requestCount;

    event PlantRegistered(address indexed wallet);
    event HumanRegistered(address indexed human);
    event RulesSet(uint256 waterPriceWeiPerMl, uint16 shareLimitBps, uint32 maxWaterMlPerOrder, uint32 maxWaterMlPerDay);
    event HelpRequested(uint256 indexed id, address indexed plant, uint256 amountWei, string requestId, bytes32 root);
    event HelpFilled(uint256 indexed id);

    modifier onlyGuardian() {
        if (msg.sender != guardianExecutor) revert NotGuardian();
        _;
    }

    modifier onlyPlant() {
        if (!isPlant[msg.sender]) revert NotInForest();
        _;
    }

    constructor(
        address guardianExecutor_,
        address supplier_,
        uint256 waterPriceWeiPerMl_,
        uint16 shareLimitBps_,
        uint32 maxWaterMlPerOrder_,
        uint32 maxWaterMlPerDay_
    ) {
        guardianExecutor = guardianExecutor_;
        supplier = supplier_;
        waterPriceWeiPerMl = waterPriceWeiPerMl_;
        shareLimitBps = shareLimitBps_;
        maxWaterMlPerOrder = maxWaterMlPerOrder_;
        maxWaterMlPerDay = maxWaterMlPerDay_;
    }

    function registerPlant(address wallet) external onlyGuardian {
        isPlant[wallet] = true;
        emit PlantRegistered(wallet);
    }

    function registerHuman(address human) external onlyGuardian {
        isHuman[human] = true;
        emit HumanRegistered(human);
    }

    function setRules(uint256 price, uint16 shareBps, uint32 perOrder, uint32 perDay) external onlyGuardian {
        waterPriceWeiPerMl = price;
        shareLimitBps = shareBps;
        maxWaterMlPerOrder = perOrder;
        maxWaterMlPerDay = perDay;
        emit RulesSet(price, shareBps, perOrder, perDay);
    }

    function openHelpRequest(uint256 amountWei, string calldata requestId, bytes32 root)
        external
        onlyPlant
        returns (uint256 id)
    {
        if (openRequestOf[msg.sender] != 0) revert RequestAlreadyOpen();
        id = ++requestCount;
        _requests[id] = Request(msg.sender, amountWei, 0, true);
        openRequestOf[msg.sender] = id;
        emit HelpRequested(id, msg.sender, amountWei, requestId, root);
    }

    function recordGift(uint256 id, uint256 amountWei) external onlyPlant {
        Request storage r = _requests[id];
        if (!r.open || r.plant == msg.sender || amountWei > r.amountWei - r.filledWei) revert NoOpenRequest();
        r.filledWei += amountWei;
        if (r.filledWei == r.amountWei) {
            r.open = false;
            openRequestOf[r.plant] = 0;
            emit HelpFilled(id);
        }
    }

    function helpRequest(uint256 id) external view returns (address plant, uint256 amountWei, uint256 filledWei, bool open) {
        Request storage r = _requests[id];
        return (r.plant, r.amountWei, r.filledWei, r.open);
    }
}
