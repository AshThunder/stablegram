// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";

/**
 * @title StablegramRosca
 * @notice Rotating Savings and Credit Association (ROSCA).
 *         Regional names (ajo, esusu, susu, …) are UX only — product name is ROSCA.
 *
 * @dev Money safety
 *  - Escrowed USDC == unpaid deposits in the current round
 *  - Full round → auto (and permissionless) payout to turn holder, then advance
 *  - After roundDeadline if incomplete → anyone refunds current round + pause
 *  - Members vote to dissolve → refund current unfinished round only (past pots stay)
 *  - Creator opens a circle, then invites; candidates must accept (or decline)
 *  - Circle cannot start while invites are pending; need ≥2 accepted members
 *  - After complete, open a new circle
 *
 * @dev History: RoundRecord + vote structs + indexed events for indexers / app.
 */
contract StablegramRosca is EscrowBase {
    enum RoundStatus {
        None,
        Active,
        PaidOut,
        TimedOutRefunded,
        DissolvedRefunded
    }

    struct Circle {
        address creator;
        uint128 contribution;
        uint32 roundPeriod;
        uint16 memberCount;
        uint16 currentRound;
        uint16 paidRounds;
        uint64 roundDeadline; // 0 = not started or paused after timeout
        bool started;
        bool cancelled;
        bool completed;
        address[] members;
    }

    struct RoundRecord {
        address recipient;
        uint128 amount;
        uint64 closedAt;
        RoundStatus status;
        uint16 paidCount;
    }

    struct DissolveProposal {
        address proposer;
        uint64 proposedAt;
        uint16 yesVotes;
        bool active;
        bool executed;
    }

    address public rescueGuardian;
    uint256 public nextCircleId = 1;

    mapping(uint256 => Circle) public circles;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public paidRound;
    mapping(uint256 => mapping(uint256 => uint256)) public roundCollected;
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(uint256 => RoundRecord)) public roundHistory;
    mapping(uint256 => mapping(uint256 => mapping(address => uint64))) public contributedAt;
    /// @dev Pull refunds after timeout/dissolve — claim via `claimRoundRefund`.
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public refundable;

    mapping(uint256 => DissolveProposal) public dissolveProposals;
    mapping(uint256 => mapping(address => bool)) public dissolveVoted;

    /// @dev Invite must be accepted before the candidate becomes a member.
    mapping(uint256 => mapping(address => bool)) public pendingInvite;
    mapping(uint256 => address[]) private _pendingInvitees;

    event CircleCreated(
        uint256 indexed circleId,
        address indexed creator,
        uint256 contribution,
        uint32 roundPeriod,
        uint256 members
    );
    event MemberAdded(uint256 indexed circleId, address indexed member, uint16 memberCount);
    event RoundOpened(uint256 indexed circleId, uint256 indexed round, uint64 deadline, address recipient);
    event RoundContributed(
        uint256 indexed circleId,
        uint256 indexed round,
        address indexed member,
        uint256 amount,
        uint64 at
    );
    event RoundRefunded(
        uint256 indexed circleId,
        uint256 indexed round,
        address indexed member,
        uint256 amount,
        uint64 at
    );
    event RoundPayout(
        uint256 indexed circleId,
        uint256 indexed round,
        address indexed recipient,
        uint256 amount,
        uint64 at
    );
    event RoundTimedOut(uint256 indexed circleId, uint256 indexed round, uint256 refundedTotal);
    event RoundResumed(uint256 indexed circleId, uint256 indexed round, uint64 deadline);
    event CircleCompleted(uint256 indexed circleId, uint16 paidRounds);

    event DissolveProposed(uint256 indexed circleId, address indexed proposer, uint64 at);
    event DissolveVoted(uint256 indexed circleId, address indexed voter, uint16 yesVotes, uint16 need);
    event CircleDissolved(uint256 indexed circleId, address indexed executor, uint256 refundedTotal);
    event RescueGuardianUpdated(address indexed guardian);

    event MemberInvited(uint256 indexed circleId, address indexed candidate, address indexed inviter);
    event InviteAccepted(uint256 indexed circleId, address indexed member, uint16 memberCount);
    event InviteDeclined(uint256 indexed circleId, address indexed candidate);
    event InviteRevoked(uint256 indexed circleId, address indexed candidate, address indexed by);

    error NotCreator();
    error CircleMissing();
    error CircleClosed();
    error NotMember();
    error AlreadyPaid();
    error RoundIncomplete();
    error BadMembers();
    error AlreadyStarted();
    error NotStarted();
    error DeadlineNotPassed();
    error RoundPaused();
    error RoundNotPaused();
    error ProposalInactive();
    error ProposalActive();
    error AlreadyVoted();
    error BadCandidate();
    error ZeroPeriod();
    error BadPeriod();
    error NothingToRefund();
    error NoInvite();
    error InvitesPending();
    error NeedMembers();

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

    // ─── Views / history ───────────────────────────────────────────

    function getMembers(uint256 circleId) external view returns (address[] memory) {
        return circles[circleId].members;
    }

    function getRoundRecord(uint256 circleId, uint256 round) external view returns (RoundRecord memory) {
        return roundHistory[circleId][round];
    }

    function requiredQuorum(uint256 memberCount) public pure returns (uint16) {
        if (memberCount == 0) return 0;
        if (memberCount <= 4) return uint16(memberCount);
        return uint16((uint256(memberCount) * 2 + 2) / 3);
    }

    function circleQuorum(uint256 circleId) external view returns (uint16) {
        return requiredQuorum(circles[circleId].memberCount);
    }

    function roundNeed(uint256 circleId) public view returns (uint256) {
        Circle storage c = circles[circleId];
        return uint256(c.memberCount) * uint256(c.contribution);
    }

    function getPendingInvites(uint256 circleId) external view returns (address[] memory) {
        return _pendingInvitees[circleId];
    }

    // ─── Create + invite membership ────────────────────────────────

    /// @notice Opens a circle with the creator as the sole member. Invite others before starting.
    function createCircle(uint256 contribution_, uint32 roundPeriod_) external returns (uint256 circleId) {
        if (roundPeriod_ < 1 hours || roundPeriod_ > 365 days) revert BadPeriod();
        if (contribution_ == 0 || contribution_ > type(uint128).max) revert ZeroAmount();

        circleId = nextCircleId++;
        Circle storage c = circles[circleId];
        c.creator = msg.sender;
        c.contribution = uint128(contribution_);
        c.roundPeriod = roundPeriod_;
        isMember[circleId][msg.sender] = true;
        c.members.push(msg.sender);
        c.memberCount = 1;

        emit MemberAdded(circleId, msg.sender, 1);
        emit CircleCreated(circleId, msg.sender, contribution_, roundPeriod_, 1);
    }

    /// @notice Invite a registered wallet. Candidate must `acceptInvite` before joining the roster.
    function inviteMember(uint256 circleId, address candidate) external {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.started || c.cancelled || c.completed) revert AlreadyStarted();
        if (!isMember[circleId][msg.sender]) revert NotMember();
        if (candidate == address(0) || isMember[circleId][candidate]) revert BadCandidate();
        if (pendingInvite[circleId][candidate]) revert BadCandidate();
        if (c.memberCount + _pendingInvitees[circleId].length >= 50) revert BadMembers();

        pendingInvite[circleId][candidate] = true;
        _pendingInvitees[circleId].push(candidate);
        emit MemberInvited(circleId, candidate, msg.sender);
    }

    function acceptInvite(uint256 circleId) external {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.started || c.cancelled || c.completed) revert AlreadyStarted();
        if (!pendingInvite[circleId][msg.sender]) revert NoInvite();
        if (c.memberCount >= 50) revert BadMembers();

        _removePending(circleId, msg.sender);
        isMember[circleId][msg.sender] = true;
        c.members.push(msg.sender);
        c.memberCount += 1;
        emit InviteAccepted(circleId, msg.sender, c.memberCount);
        emit MemberAdded(circleId, msg.sender, c.memberCount);
    }

    function declineInvite(uint256 circleId) external {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (!pendingInvite[circleId][msg.sender]) revert NoInvite();
        _removePending(circleId, msg.sender);
        emit InviteDeclined(circleId, msg.sender);
    }

    /// @notice Member cancels a pending invite (before the candidate accepts).
    function revokeInvite(uint256 circleId, address candidate) external {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.started || c.cancelled || c.completed) revert AlreadyStarted();
        if (!isMember[circleId][msg.sender]) revert NotMember();
        if (!pendingInvite[circleId][candidate]) revert NoInvite();
        _removePending(circleId, candidate);
        emit InviteRevoked(circleId, candidate, msg.sender);
    }

    function _removePending(uint256 circleId, address candidate) internal {
        pendingInvite[circleId][candidate] = false;
        address[] storage list = _pendingInvitees[circleId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == candidate) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }

    // ─── Contribute / auto-payout ──────────────────────────────────

    function contribute(uint256 circleId) external nonReentrant {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.cancelled || c.completed) revert CircleClosed();
        if (!isMember[circleId][msg.sender]) revert NotMember();

        uint256 round = c.currentRound;
        if (paidRound[circleId][round][msg.sender]) revert AlreadyPaid();

        if (!c.started) {
            if (_pendingInvitees[circleId].length > 0) revert InvitesPending();
            if (c.memberCount < 2) revert NeedMembers();
            c.started = true;
            _openRound(circleId, round);
        } else if (c.roundDeadline == 0) {
            revert RoundPaused();
        }

        uint256 amount = c.contribution;
        _pullFrom(msg.sender, amount);
        paidRound[circleId][round][msg.sender] = true;
        contributedAt[circleId][round][msg.sender] = uint64(block.timestamp);
        roundCollected[circleId][round] += amount;
        roundHistory[circleId][round].paidCount += 1;

        emit RoundContributed(circleId, round, msg.sender, amount, uint64(block.timestamp));

        if (roundCollected[circleId][round] == roundNeed(circleId)) {
            _payoutRound(circleId);
        }
    }

    function payoutRound(uint256 circleId) external nonReentrant {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.cancelled || c.completed) revert CircleClosed();
        if (roundCollected[circleId][c.currentRound] != roundNeed(circleId)) revert RoundIncomplete();
        _payoutRound(circleId);
    }

    function _openRound(uint256 circleId, uint256 round) internal {
        Circle storage c = circles[circleId];
        c.roundDeadline = uint64(block.timestamp) + c.roundPeriod;
        RoundRecord storage rec = roundHistory[circleId][round];
        rec.status = RoundStatus.Active;
        rec.recipient = c.members[round];
        rec.paidCount = 0;
        emit RoundOpened(circleId, round, c.roundDeadline, rec.recipient);
    }

    function _payoutRound(uint256 circleId) internal {
        Circle storage c = circles[circleId];
        uint256 round = c.currentRound;
        uint256 need = roundNeed(circleId);
        if (roundCollected[circleId][round] != need) revert RoundIncomplete();

        address recipient = c.members[round];
        roundCollected[circleId][round] = 0;
        c.paidRounds += 1;

        RoundRecord storage rec = roundHistory[circleId][round];
        rec.recipient = recipient;
        rec.amount = uint128(need);
        rec.closedAt = uint64(block.timestamp);
        rec.status = RoundStatus.PaidOut;
        rec.paidCount = c.memberCount;

        _pushTo(recipient, need);
        emit RoundPayout(circleId, round, recipient, need, uint64(block.timestamp));

        if (c.paidRounds >= c.memberCount) {
            c.completed = true;
            c.roundDeadline = 0;
            emit CircleCompleted(circleId, c.paidRounds);
        } else {
            c.currentRound += 1;
            _openRound(circleId, c.currentRound);
        }
    }

    // ─── Timeout → refund + pause / resume ─────────────────────────

    function timeoutCurrentRound(uint256 circleId) external nonReentrant {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.cancelled || c.completed) revert CircleClosed();
        if (!c.started) revert NotStarted();
        if (c.roundDeadline == 0 || block.timestamp < c.roundDeadline) revert DeadlineNotPassed();

        uint256 refunded = _refundCurrentRoundDeposits(circleId, RoundStatus.TimedOutRefunded);
        c.roundDeadline = 0;
        emit RoundTimedOut(circleId, c.currentRound, refunded);
    }

    function resumeRound(uint256 circleId) external {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.cancelled || c.completed) revert CircleClosed();
        if (!isMember[circleId][msg.sender]) revert NotMember();
        if (!c.started) revert NotStarted();
        if (c.roundDeadline != 0) revert RoundNotPaused();
        if (roundCollected[circleId][c.currentRound] != 0) revert RoundIncomplete();

        _openRound(circleId, c.currentRound);
        emit RoundResumed(circleId, c.currentRound, c.roundDeadline);
    }

    /**
     * @dev Marks deposits refundable (pull). Members call `claimRoundRefund` to withdraw.
     *      Avoids unbounded push loops that can strand funds if the tx OOGs.
     */
    function _refundCurrentRoundDeposits(uint256 circleId, RoundStatus closeStatus)
        internal
        returns (uint256 refunded)
    {
        Circle storage c = circles[circleId];
        uint256 round = c.currentRound;
        uint256 amount = c.contribution;

        for (uint256 i = 0; i < c.members.length; i++) {
            address m = c.members[i];
            if (!paidRound[circleId][round][m]) continue;
            paidRound[circleId][round][m] = false;
            contributedAt[circleId][round][m] = 0;
            roundCollected[circleId][round] -= amount;
            refundable[circleId][round][m] += amount;
            refunded += amount;
            emit RoundRefunded(circleId, round, m, amount, uint64(block.timestamp));
        }
        roundCollected[circleId][round] = 0;

        RoundRecord storage rec = roundHistory[circleId][round];
        rec.status = closeStatus;
        rec.closedAt = uint64(block.timestamp);
        rec.amount = 0;
        rec.paidCount = 0;
    }

    /// @notice Pull USDC after timeout/dissolve marked the round refundable.
    function claimRoundRefund(uint256 circleId, uint256 round) external nonReentrant {
        uint256 amt = refundable[circleId][round][msg.sender];
        if (amt == 0) revert NothingToRefund();
        refundable[circleId][round][msg.sender] = 0;
        _pushTo(msg.sender, amt);
    }

    // ─── Dissolve vote ─────────────────────────────────────────────

    function proposeDissolve(uint256 circleId) external nonReentrant {
        Circle storage c = circles[circleId];
        if (c.creator == address(0)) revert CircleMissing();
        if (c.cancelled || c.completed) revert CircleClosed();
        if (!isMember[circleId][msg.sender]) revert NotMember();

        DissolveProposal storage p = dissolveProposals[circleId];
        if (p.active && !p.executed) revert ProposalActive();

        _clearDissolveVotes(circleId);

        dissolveProposals[circleId] = DissolveProposal({
            proposer: msg.sender,
            proposedAt: uint64(block.timestamp),
            yesVotes: 0,
            active: true,
            executed: false
        });

        emit DissolveProposed(circleId, msg.sender, uint64(block.timestamp));
        _voteDissolve(circleId);
    }

    function voteDissolve(uint256 circleId) external nonReentrant {
        _voteDissolve(circleId);
    }

    function _clearDissolveVotes(uint256 circleId) internal {
        address[] storage members = circles[circleId].members;
        for (uint256 i = 0; i < members.length; i++) {
            dissolveVoted[circleId][members[i]] = false;
        }
    }

    function _voteDissolve(uint256 circleId) internal {
        Circle storage c = circles[circleId];
        if (c.cancelled || c.completed) revert CircleClosed();
        if (!isMember[circleId][msg.sender]) revert NotMember();

        DissolveProposal storage p = dissolveProposals[circleId];
        if (!p.active || p.executed) revert ProposalInactive();
        if (dissolveVoted[circleId][msg.sender]) revert AlreadyVoted();

        dissolveVoted[circleId][msg.sender] = true;
        p.yesVotes += 1;

        uint16 need = requiredQuorum(c.memberCount);
        emit DissolveVoted(circleId, msg.sender, p.yesVotes, need);

        if (p.yesVotes >= need) {
            p.executed = true;
            p.active = false;
            _dissolve(circleId);
        }
    }

    function _dissolve(uint256 circleId) internal {
        Circle storage c = circles[circleId];
        c.cancelled = true;
        c.roundDeadline = 0;

        uint256 refunded;
        if (c.started) {
            refunded = _refundCurrentRoundDeposits(circleId, RoundStatus.DissolvedRefunded);
        }
        emit CircleDissolved(circleId, msg.sender, refunded);
    }
}
