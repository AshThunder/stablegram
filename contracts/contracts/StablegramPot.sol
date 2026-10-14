// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";

/**
 * @title StablegramPot
 * @notice Collection pot: contributors deposit up to goal; release to beneficiary.
 * @dev Exit paths (no stranded contributor funds):
 *  - `withdrawContribution` anytime before release
 *  - After `expiresAt`, release is blocked; contributors withdraw
 *  - Creator may `cancel` (soft-close) then contributors withdraw
 *  - `releaseIfFunded` when collected >= goal (anyone), before expiry
 */
contract StablegramPot is EscrowBase {
    struct Pot {
        address creator;
        address beneficiary;
        uint128 goal;
        uint128 collected;
        uint64 expiresAt;
        bool released;
        bool cancelled;
        address[] contributors;
    }

    address public rescueGuardian;
    uint256 public nextPotId = 1;

    mapping(uint256 => Pot) public pots;
    mapping(uint256 => mapping(address => uint256)) public contributionOf;

    event PotCreated(
        uint256 indexed potId,
        address indexed creator,
        address beneficiary,
        uint256 goal,
        uint64 expiresAt
    );
    event Contributed(uint256 indexed potId, address indexed from, uint256 amount, uint256 collected);
    event Withdrawn(uint256 indexed potId, address indexed to, uint256 amount);
    event Released(uint256 indexed potId, address indexed to, uint256 amount);
    event Cancelled(uint256 indexed potId);
    event RescueGuardianUpdated(address indexed guardian);

    error NotCreator();
    error PotMissing();
    error PotClosed();
    error PotExpired();
    error GoalExceeded();
    error NothingToWithdraw();
    error GoalNotMet();
    error BadExpiry();

    constructor(address token_, address rescueGuardian_) EscrowBase(token_) {
        if (rescueGuardian_ == address(0)) revert ZeroAddress();
        rescueGuardian = rescueGuardian_;
    }

    function setRescueGuardian(address g) external {
        if (msg.sender != rescueGuardian) revert NotCreator();
        if (g == address(0)) revert ZeroAddress();
        rescueGuardian = g;
        emit RescueGuardianUpdated(g);
    }

    function _authorizeRescue() internal view override {
        if (msg.sender != rescueGuardian) revert NotCreator();
    }

    function createPot(address beneficiary_, uint256 goal_, uint256 durationSeconds)
        external
        returns (uint256 potId)
    {
        if (beneficiary_ == address(0)) revert ZeroAddress();
        if (goal_ == 0 || goal_ > type(uint128).max) revert ZeroAmount();
        if (durationSeconds < 1 hours || durationSeconds > 365 days) revert BadExpiry();

        potId = nextPotId++;
        Pot storage p = pots[potId];
        p.creator = msg.sender;
        p.beneficiary = beneficiary_;
        p.goal = uint128(goal_);
        p.expiresAt = uint64(block.timestamp + durationSeconds);

        emit PotCreated(potId, msg.sender, beneficiary_, goal_, p.expiresAt);
    }

    function contribute(uint256 potId, uint256 amount) external nonReentrant {
        Pot storage p = pots[potId];
        if (p.creator == address(0)) revert PotMissing();
        if (p.released || p.cancelled) revert PotClosed();
        if (block.timestamp >= p.expiresAt) revert PotExpired();
        if (amount == 0) revert ZeroAmount();

        uint256 room = uint256(p.goal) - uint256(p.collected);
        if (amount > room) revert GoalExceeded();

        _pullFrom(msg.sender, amount);

        if (contributionOf[potId][msg.sender] == 0) {
            p.contributors.push(msg.sender);
        }
        contributionOf[potId][msg.sender] += amount;
        p.collected += uint128(amount);

        emit Contributed(potId, msg.sender, amount, p.collected);
    }

    /// @notice Pull exit — contributor withdraws their deposit anytime before release.
    function withdrawContribution(uint256 potId) external nonReentrant {
        Pot storage p = pots[potId];
        if (p.creator == address(0)) revert PotMissing();
        if (p.released) revert PotClosed();

        uint256 amt = contributionOf[potId][msg.sender];
        if (amt == 0) revert NothingToWithdraw();

        contributionOf[potId][msg.sender] = 0;
        p.collected -= uint128(amt);
        _pushTo(msg.sender, amt);
        emit Withdrawn(potId, msg.sender, amt);
    }

    /// @notice Soft-close: blocks new deposits/release; contributors withdraw themselves.
    function cancel(uint256 potId) external {
        Pot storage p = pots[potId];
        if (p.creator == address(0)) revert PotMissing();
        if (msg.sender != p.creator) revert NotCreator();
        if (p.released || p.cancelled) revert PotClosed();
        p.cancelled = true;
        emit Cancelled(potId);
    }

    function release(uint256 potId) external nonReentrant {
        Pot storage p = pots[potId];
        if (p.creator == address(0)) revert PotMissing();
        if (msg.sender != p.creator) revert NotCreator();
        _release(potId, p);
    }

    /// @notice Anyone may release once the goal is fully funded (before expiry / cancel).
    function releaseIfFunded(uint256 potId) external nonReentrant {
        Pot storage p = pots[potId];
        if (p.creator == address(0)) revert PotMissing();
        if (p.collected < p.goal) revert GoalNotMet();
        _release(potId, p);
    }

    function _release(uint256 potId, Pot storage p) internal {
        if (p.released || p.cancelled) revert PotClosed();
        if (block.timestamp >= p.expiresAt) revert PotExpired();
        if (p.collected == 0) revert ZeroAmount();

        p.released = true;
        uint256 amount = p.collected;
        p.collected = 0;

        uint256 n = p.contributors.length;
        for (uint256 i = 0; i < n; i++) {
            contributionOf[potId][p.contributors[i]] = 0;
        }

        _pushTo(p.beneficiary, amount);
        emit Released(potId, p.beneficiary, amount);
    }

    function contributorCount(uint256 potId) external view returns (uint256) {
        return pots[potId].contributors.length;
    }
}
