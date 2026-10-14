// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";

/**
 * @title StablegramBillEscrow
 * @notice Split bill: payers deposit their share; release to payee.
 * @dev Exit paths:
 *  - `withdrawPayment` anytime before release
 *  - After `expiresAt`, release blocked; payers withdraw
 *  - Creator `cancel` soft-closes; payers withdraw
 *  - `releaseIfFunded` when fully paid (anyone)
 */
contract StablegramBillEscrow is EscrowBase {
    struct Bill {
        address creator;
        address payee;
        uint128 total;
        uint128 collected;
        uint64 expiresAt;
        bool released;
        bool cancelled;
        address[] payers;
    }

    address public rescueGuardian;
    uint256 public nextBillId = 1;

    mapping(uint256 => Bill) public bills;
    mapping(uint256 => mapping(address => uint256)) public paidOf;
    mapping(uint256 => mapping(address => uint256)) public shareOf;

    event BillCreated(
        uint256 indexed billId,
        address indexed creator,
        address payee,
        uint256 total,
        uint64 expiresAt
    );
    event ShareSet(uint256 indexed billId, address indexed payer, uint256 share);
    event Paid(uint256 indexed billId, address indexed payer, uint256 amount, uint256 collected);
    event Withdrawn(uint256 indexed billId, address indexed to, uint256 amount);
    event Released(uint256 indexed billId, address indexed payee, uint256 amount);
    event Cancelled(uint256 indexed billId);
    event RescueGuardianUpdated(address indexed guardian);

    error NotCreator();
    error BillMissing();
    error BillClosed();
    error BillExpired();
    error Overpay();
    error NotFullyPaid();
    error DuplicatePayer();
    error NothingToWithdraw();
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

    function createBill(
        address payee_,
        address[] calldata payers_,
        uint256[] calldata shares_,
        uint256 durationSeconds
    ) external returns (uint256 billId) {
        if (payee_ == address(0)) revert ZeroAddress();
        if (payers_.length == 0 || payers_.length != shares_.length) revert ZeroAmount();
        if (durationSeconds < 1 hours || durationSeconds > 365 days) revert BadExpiry();

        uint256 total;
        for (uint256 i = 0; i < shares_.length; i++) {
            if (payers_[i] == address(0) || shares_[i] == 0) revert ZeroAddress();
            total += shares_[i];
        }
        if (total == 0 || total > type(uint128).max) revert ZeroAmount();

        billId = nextBillId++;
        Bill storage b = bills[billId];
        b.creator = msg.sender;
        b.payee = payee_;
        b.total = uint128(total);
        b.expiresAt = uint64(block.timestamp + durationSeconds);

        for (uint256 i = 0; i < payers_.length; i++) {
            if (shareOf[billId][payers_[i]] != 0) revert DuplicatePayer();
            b.payers.push(payers_[i]);
            shareOf[billId][payers_[i]] = shares_[i];
            emit ShareSet(billId, payers_[i], shares_[i]);
        }

        emit BillCreated(billId, msg.sender, payee_, total, b.expiresAt);
    }

    function payShare(uint256 billId, uint256 amount) external nonReentrant {
        Bill storage b = bills[billId];
        if (b.creator == address(0)) revert BillMissing();
        if (b.released || b.cancelled) revert BillClosed();
        if (block.timestamp >= b.expiresAt) revert BillExpired();

        uint256 share = shareOf[billId][msg.sender];
        if (share == 0) revert ZeroAmount();
        uint256 already = paidOf[billId][msg.sender];
        if (already + amount > share) revert Overpay();

        _pullFrom(msg.sender, amount);
        paidOf[billId][msg.sender] = already + amount;
        b.collected += uint128(amount);

        emit Paid(billId, msg.sender, amount, b.collected);
    }

    /// @notice Pull exit — payer withdraws their deposit anytime before release.
    function withdrawPayment(uint256 billId) external nonReentrant {
        Bill storage b = bills[billId];
        if (b.creator == address(0)) revert BillMissing();
        if (b.released) revert BillClosed();

        uint256 amt = paidOf[billId][msg.sender];
        if (amt == 0) revert NothingToWithdraw();

        paidOf[billId][msg.sender] = 0;
        b.collected -= uint128(amt);
        _pushTo(msg.sender, amt);
        emit Withdrawn(billId, msg.sender, amt);
    }

    function cancel(uint256 billId) external {
        Bill storage b = bills[billId];
        if (b.creator == address(0)) revert BillMissing();
        if (msg.sender != b.creator) revert NotCreator();
        if (b.released || b.cancelled) revert BillClosed();
        b.cancelled = true;
        emit Cancelled(billId);
    }

    function release(uint256 billId) external nonReentrant {
        Bill storage b = bills[billId];
        if (b.creator == address(0)) revert BillMissing();
        if (msg.sender != b.creator) revert NotCreator();
        _release(billId, b);
    }

    function releaseIfFunded(uint256 billId) external nonReentrant {
        Bill storage b = bills[billId];
        if (b.creator == address(0)) revert BillMissing();
        if (b.collected < b.total) revert NotFullyPaid();
        _release(billId, b);
    }

    function _release(uint256 billId, Bill storage b) internal {
        if (b.released || b.cancelled) revert BillClosed();
        if (block.timestamp >= b.expiresAt) revert BillExpired();
        if (b.collected < b.total) revert NotFullyPaid();

        b.released = true;
        uint256 amount = b.collected;
        b.collected = 0;

        uint256 n = b.payers.length;
        for (uint256 i = 0; i < n; i++) {
            paidOf[billId][b.payers[i]] = 0;
        }

        _pushTo(b.payee, amount);
        emit Released(billId, b.payee, amount);
    }
}
