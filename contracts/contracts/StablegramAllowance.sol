// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";

/**
 * @title StablegramAllowance
 * @notice Guardian deposits USDC; spender can pull up to remaining allowance (session/family cap).
 * @dev Guardian can always withdrawRemaining — no stuck guardian funds.
 */
contract StablegramAllowance is EscrowBase {
    struct Purse {
        address guardian;
        address spender;
        uint128 deposited;
        uint128 spent;
        uint64 expiresAt;
        bool closed;
    }

    address public rescueGuardian;
    uint256 public nextPurseId = 1;
    mapping(uint256 => Purse) public purses;

    event PurseOpened(uint256 indexed purseId, address indexed guardian, address indexed spender, uint256 amount, uint64 expiresAt);
    event Spent(uint256 indexed purseId, address indexed to, uint256 amount);
    event ToppedUp(uint256 indexed purseId, uint256 amount);
    event Closed(uint256 indexed purseId, uint256 refunded);
    event RescueGuardianUpdated(address indexed guardian);

    error NotGuardian();
    error NotSpender();
    error PurseMissing();
    error PurseClosed();
    error Expired();
    error CapExceeded();

    constructor(address token_, address rescueGuardian_) EscrowBase(token_) {
        if (rescueGuardian_ == address(0)) revert ZeroAddress();
        rescueGuardian = rescueGuardian_;
    }

    function setRescueGuardian(address g) external {
        if (msg.sender != rescueGuardian) revert NotGuardian();
        if (g == address(0)) revert ZeroAddress();
        rescueGuardian = g;
        emit RescueGuardianUpdated(g);
    }

    function _authorizeRescue() internal view override {
        if (msg.sender != rescueGuardian) revert NotGuardian();
    }

    function open(address spender, uint256 amount, uint256 durationSeconds)
        external
        nonReentrant
        returns (uint256 purseId)
    {
        if (spender == address(0) || spender == msg.sender) revert ZeroAddress();
        if (amount == 0 || amount > type(uint128).max) revert ZeroAmount();
        if (durationSeconds < 1 hours || durationSeconds > 365 days) revert Expired();

        _pullFrom(msg.sender, amount);

        purseId = nextPurseId++;
        uint64 expiresAt = uint64(block.timestamp + durationSeconds);
        purses[purseId] = Purse({
            guardian: msg.sender,
            spender: spender,
            deposited: uint128(amount),
            spent: 0,
            expiresAt: expiresAt,
            closed: false
        });

        emit PurseOpened(purseId, msg.sender, spender, amount, expiresAt);
    }

    function topUp(uint256 purseId, uint256 amount) external nonReentrant {
        Purse storage p = purses[purseId];
        if (p.guardian == address(0)) revert PurseMissing();
        if (msg.sender != p.guardian) revert NotGuardian();
        if (p.closed) revert PurseClosed();
        if (block.timestamp >= p.expiresAt) revert Expired();

        _pullFrom(msg.sender, amount);
        p.deposited += uint128(amount);
        emit ToppedUp(purseId, amount);
    }

    function spend(uint256 purseId, address to, uint256 amount) external nonReentrant {
        Purse storage p = purses[purseId];
        if (p.guardian == address(0)) revert PurseMissing();
        if (msg.sender != p.spender) revert NotSpender();
        if (p.closed) revert PurseClosed();
        if (block.timestamp >= p.expiresAt) revert Expired();

        uint256 avail = uint256(p.deposited) - uint256(p.spent);
        if (amount == 0 || amount > avail) revert CapExceeded();

        p.spent += uint128(amount);
        _pushTo(to, amount);
        emit Spent(purseId, to, amount);
    }

    /// @notice Guardian closes purse and withdraws unspent balance anytime (or after expiry).
    function closeAndWithdraw(uint256 purseId) external nonReentrant {
        Purse storage p = purses[purseId];
        if (p.guardian == address(0)) revert PurseMissing();
        if (msg.sender != p.guardian) revert NotGuardian();
        if (p.closed) revert PurseClosed();

        p.closed = true;
        uint256 leftover = uint256(p.deposited) - uint256(p.spent);
        p.spent = p.deposited;

        if (leftover > 0) {
            _pushTo(p.guardian, leftover);
        }
        emit Closed(purseId, leftover);
    }

    function remaining(uint256 purseId) external view returns (uint256) {
        Purse storage p = purses[purseId];
        if (p.closed) return 0;
        return uint256(p.deposited) - uint256(p.spent);
    }
}
