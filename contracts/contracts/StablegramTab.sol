// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";

/**
 * @title StablegramTab
 * @notice Borrow/lend ledger: lender deposits USDC for borrower; borrower repays to lender.
 * @dev Principal always sits with borrower after lend. Contract only holds funds mid-repay? 
 *      Actually: lend() pulls from lender and pushes to borrower immediately — zero escrow after.
 *      Debt is accounting. repay() pulls from borrower and pushes to lender.
 *      No USDC should remain in this contract except mistaken rescue excess.
 */
contract StablegramTab is EscrowBase {
    struct Debt {
        address lender;
        address borrower;
        uint128 principal;
        uint128 repaid;
        uint64 dueAt;
        bool closed;
        string note;
    }

    address public rescueGuardian;
    uint256 public nextDebtId = 1;

    mapping(uint256 => Debt) public debts;
    mapping(address => uint256[]) private _asBorrower;
    mapping(address => uint256[]) private _asLender;

    event Lent(uint256 indexed debtId, address indexed lender, address indexed borrower, uint256 amount, uint64 dueAt);
    event Repaid(uint256 indexed debtId, address indexed borrower, uint256 amount, uint256 totalRepaid);
    event Forgiven(uint256 indexed debtId, address indexed lender, uint256 remaining);
    event Closed(uint256 indexed debtId);
    event RescueGuardianUpdated(address indexed guardian);

    error NotParty();
    error DebtMissing();
    error DebtClosed();
    error OverRepay();

    constructor(address token_, address rescueGuardian_) EscrowBase(token_) {
        if (rescueGuardian_ == address(0)) revert ZeroAddress();
        rescueGuardian = rescueGuardian_;
    }

    function setRescueGuardian(address g) external {
        if (msg.sender != rescueGuardian) revert NotParty();
        if (g == address(0)) revert ZeroAddress();
        rescueGuardian = g;
        emit RescueGuardianUpdated(g);
    }

    function _authorizeRescue() internal view override {
        if (msg.sender != rescueGuardian) revert NotParty();
    }

    function lend(address borrower, uint256 amount, uint64 dueAt, string calldata note)
        external
        nonReentrant
        returns (uint256 debtId)
    {
        if (borrower == address(0) || borrower == msg.sender) revert ZeroAddress();
        if (amount == 0 || amount > type(uint128).max) revert ZeroAmount();

        // Pull then immediate push — totalEscrowed briefly credits then debits (net zero hold).
        _pullFrom(msg.sender, amount);
        _pushTo(borrower, amount);

        debtId = nextDebtId++;
        debts[debtId] = Debt({
            lender: msg.sender,
            borrower: borrower,
            principal: uint128(amount),
            repaid: 0,
            dueAt: dueAt,
            closed: false,
            note: note
        });
        _asBorrower[borrower].push(debtId);
        _asLender[msg.sender].push(debtId);

        emit Lent(debtId, msg.sender, borrower, amount, dueAt);
    }

    function repay(uint256 debtId, uint256 amount) external nonReentrant {
        Debt storage d = debts[debtId];
        if (d.lender == address(0)) revert DebtMissing();
        if (d.closed) revert DebtClosed();
        if (msg.sender != d.borrower) revert NotParty();

        uint256 remaining = uint256(d.principal) - uint256(d.repaid);
        if (amount == 0 || amount > remaining) revert OverRepay();

        _pullFrom(msg.sender, amount);
        _pushTo(d.lender, amount);

        d.repaid += uint128(amount);
        emit Repaid(debtId, msg.sender, amount, d.repaid);

        if (d.repaid == d.principal) {
            d.closed = true;
            emit Closed(debtId);
        }
    }

    /// @notice Lender forgives remaining balance (no token movement).
    function forgive(uint256 debtId) external {
        Debt storage d = debts[debtId];
        if (d.lender == address(0)) revert DebtMissing();
        if (msg.sender != d.lender) revert NotParty();
        if (d.closed) revert DebtClosed();

        uint256 remaining = uint256(d.principal) - uint256(d.repaid);
        d.closed = true;
        emit Forgiven(debtId, msg.sender, remaining);
        emit Closed(debtId);
    }

    function outstanding(uint256 debtId) external view returns (uint256) {
        Debt storage d = debts[debtId];
        if (d.closed) return 0;
        return uint256(d.principal) - uint256(d.repaid);
    }

    function debtsAsBorrower(address user) external view returns (uint256[] memory) {
        return _asBorrower[user];
    }

    function debtsAsLender(address user) external view returns (uint256[] memory) {
        return _asLender[user];
    }
}
