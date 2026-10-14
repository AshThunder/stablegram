// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EscrowBase
 * @notice Shared safety rails for Stablegram vaults.
 * @dev RULES (mainnet):
 *  - Every unit of `token` credited into accounting MUST have a user exit path
 *    (claim / release / refund / expire).
 *  - `rescueToken` can ONLY move excess balance above `totalEscrowed`.
 *  - No admin can seize escrowed user funds.
 */
abstract contract EscrowBase is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    /// @notice Sum of all user-credited balances still held for payouts/refunds.
    uint256 public totalEscrowed;

    event Rescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientEscrow();
    error NothingToRescue();

    constructor(address token_) {
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
    }

    function _credit(uint256 amount) internal {
        totalEscrowed += amount;
    }

    function _debit(uint256 amount) internal {
        if (amount > totalEscrowed) revert InsufficientEscrow();
        totalEscrowed -= amount;
    }

    function _pullFrom(address from, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(from, address(this), amount);
        _credit(amount);
    }

    function _pushTo(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _debit(amount);
        token.safeTransfer(to, amount);
    }

    /// @notice Recover tokens accidentally sent here (NOT escrowed accounting).
    function rescueToken(address erc20, address to, uint256 amount) external virtual {
        _authorizeRescue();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        if (erc20 == address(token)) {
            uint256 bal = token.balanceOf(address(this));
            uint256 excess = bal > totalEscrowed ? bal - totalEscrowed : 0;
            if (amount > excess) revert NothingToRescue();
            token.safeTransfer(to, amount);
        } else {
            IERC20(erc20).safeTransfer(to, amount);
        }
        emit Rescued(erc20, to, amount);
    }

    function _authorizeRescue() internal view virtual;
}
