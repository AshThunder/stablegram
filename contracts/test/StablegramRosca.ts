import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { deployFixture } from './helpers';

/** Create + invite + accept so roster has alice & bob before first contribute. */
async function openWithBob(
  rosca: Awaited<ReturnType<typeof deployFixture>>['rosca'],
  alice: Awaited<ReturnType<typeof deployFixture>>['alice'],
  bob: Awaited<ReturnType<typeof deployFixture>>['bob'],
  contribution: bigint,
  period: number,
) {
  await rosca.connect(alice).createCircle(contribution, period);
  await rosca.connect(alice).inviteMember(1, bob.address);
  await rosca.connect(bob).acceptInvite(1);
}

describe('StablegramRosca', () => {
  it('auto-pays and rotates; history records payouts; zero residual escrow', async () => {
    const { rosca, usdc, alice, bob, approve, parse, assertBalanced } =
      await loadFixture(deployFixture);
    const roscaAddr = await rosca.getAddress();

    await openWithBob(rosca, alice, bob, parse('25'), 7 * 24 * 3600);

    await approve(alice, roscaAddr, '100');
    await approve(bob, roscaAddr, '100');

    const a0 = await usdc.balanceOf(alice.address);
    await rosca.connect(alice).contribute(1);
    await rosca.connect(bob).contribute(1);
    expect(await usdc.balanceOf(alice.address)).to.equal(a0 - parse('25') + parse('50'));
    await assertBalanced(rosca);

    const r0 = await rosca.getRoundRecord(1, 0);
    expect(r0.status).to.equal(2n);
    expect(r0.recipient).to.equal(alice.address);
    expect(r0.amount).to.equal(parse('50'));

    const b0 = await usdc.balanceOf(bob.address);
    await rosca.connect(alice).contribute(1);
    await rosca.connect(bob).contribute(1);
    expect(await usdc.balanceOf(bob.address)).to.equal(b0 - parse('25') + parse('50'));
    await assertBalanced(rosca);
    expect(await rosca.totalEscrowed()).to.equal(0n);

    const circle = await rosca.circles(1);
    expect(circle.completed).to.equal(true);

    const r1 = await rosca.getRoundRecord(1, 1);
    expect(r1.status).to.equal(2n);
    expect(r1.recipient).to.equal(bob.address);
  });

  it('members vote to dissolve; pull claimRoundRefund', async () => {
    const { rosca, usdc, alice, bob, approve, parse, assertBalanced } =
      await loadFixture(deployFixture);
    const roscaAddr = await rosca.getAddress();
    await openWithBob(rosca, alice, bob, parse('10'), 86400);
    await approve(alice, roscaAddr, '100');
    await rosca.connect(alice).contribute(1);

    await rosca.connect(alice).proposeDissolve(1);
    await rosca.connect(bob).voteDissolve(1);

    expect((await rosca.circles(1)).cancelled).to.equal(true);
    const rec = await rosca.getRoundRecord(1, 0);
    expect(rec.status).to.equal(4n);

    const a0 = await usdc.balanceOf(alice.address);
    await rosca.connect(alice).claimRoundRefund(1, 0);
    expect(await usdc.balanceOf(alice.address)).to.equal(a0 + parse('10'));
    await assertBalanced(rosca);
    expect(await rosca.totalEscrowed()).to.equal(0n);
  });

  it('timeout marks refundable + pause; claim then resume', async () => {
    const { rosca, usdc, alice, bob, approve, parse, assertBalanced } =
      await loadFixture(deployFixture);
    const roscaAddr = await rosca.getAddress();
    await openWithBob(rosca, alice, bob, parse('10'), 3600);
    await approve(alice, roscaAddr, '100');
    await approve(bob, roscaAddr, '100');

    await rosca.connect(alice).contribute(1);

    await time.increase(3601);
    await rosca.connect(bob).timeoutCurrentRound(1);
    expect((await rosca.circles(1)).roundDeadline).to.equal(0n);
    await assertBalanced(rosca);

    const aBefore = await usdc.balanceOf(alice.address);
    await rosca.connect(alice).claimRoundRefund(1, 0);
    expect(await usdc.balanceOf(alice.address)).to.equal(aBefore + parse('10'));
    await assertBalanced(rosca);

    await expect(rosca.connect(alice).contribute(1)).to.be.revertedWithCustomError(
      rosca,
      'RoundPaused',
    );

    await rosca.connect(alice).resumeRound(1);
    await rosca.connect(alice).contribute(1);
    await rosca.connect(bob).contribute(1);
    await assertBalanced(rosca);

    await rosca.connect(alice).contribute(1);
    await rosca.connect(bob).contribute(1);
    expect((await rosca.circles(1)).completed).to.equal(true);
    expect(await rosca.totalEscrowed()).to.equal(0n);
  });

  it('invite accept/decline/revoke; cannot start with pending invites or solo', async () => {
    const { rosca, alice, bob, carol, approve, parse, assertBalanced } =
      await loadFixture(deployFixture);
    const roscaAddr = await rosca.getAddress();

    await rosca.connect(alice).createCircle(parse('5'), 86400);
    expect((await rosca.circles(1)).memberCount).to.equal(1n);

    await expect(rosca.connect(alice).contribute(1)).to.be.revertedWithCustomError(
      rosca,
      'NeedMembers',
    );

    await rosca.connect(alice).inviteMember(1, bob.address);
    expect(await rosca.pendingInvite(1, bob.address)).to.equal(true);
    await expect(rosca.connect(alice).contribute(1)).to.be.revertedWithCustomError(
      rosca,
      'InvitesPending',
    );

    await rosca.connect(bob).declineInvite(1);
    expect(await rosca.pendingInvite(1, bob.address)).to.equal(false);

    await rosca.connect(alice).inviteMember(1, bob.address);
    await rosca.connect(alice).revokeInvite(1, bob.address);
    expect(await rosca.pendingInvite(1, bob.address)).to.equal(false);

    await rosca.connect(alice).inviteMember(1, bob.address);
    await rosca.connect(bob).acceptInvite(1);
    expect(await rosca.isMember(1, bob.address)).to.equal(true);
    expect((await rosca.circles(1)).memberCount).to.equal(2n);

    await rosca.connect(alice).inviteMember(1, carol.address);
    await expect(rosca.connect(alice).contribute(1)).to.be.revertedWithCustomError(
      rosca,
      'InvitesPending',
    );
    await rosca.connect(carol).acceptInvite(1);
    expect((await rosca.circles(1)).memberCount).to.equal(3n);

    await approve(alice, roscaAddr, '100');
    await rosca.connect(alice).contribute(1);

    await expect(rosca.connect(alice).inviteMember(1, alice.address)).to.be.revertedWithCustomError(
      rosca,
      'AlreadyStarted',
    );
    await assertBalanced(rosca);
  });

  it('rejects short periods; only invitee can accept', async () => {
    const { rosca, alice, bob, parse } = await loadFixture(deployFixture);
    await expect(rosca.connect(alice).createCircle(parse('5'), 100)).to.be.revertedWithCustomError(
      rosca,
      'BadPeriod',
    );
    await rosca.connect(alice).createCircle(parse('5'), 86400);
    await rosca.connect(alice).inviteMember(1, bob.address);
    await expect(rosca.connect(alice).acceptInvite(1)).to.be.revertedWithCustomError(
      rosca,
      'NoInvite',
    );
  });
});
