import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployFixture } from './helpers';

/**
 * Cross-cutting invariant suite: after every happy/sad path, USDC balance == totalEscrowed.
 * Fails the build if any path leaves user funds stranded or accounting under-collateralized.
 */
describe('invariants: no stuck funds', () => {
  it('pot/bill/rosca/tab/allowance all end at zero escrow after lifecycle', async () => {
    const f = await loadFixture(deployFixture);
    const {
      usdc,
      pot,
      bill,
      rosca,
      tab,
      allowance,
      creator,
      alice,
      bob,
      carol,
      approve,
      parse,
      assertBalanced,
    } = f;

    const contracts = [pot, bill, rosca, tab, allowance];
    for (const c of contracts) {
      await assertBalanced(c);
    }

    const WEEK = 7 * 24 * 3600;

    // Pot lifecycle
    await pot.connect(creator).createPot(carol.address, parse('50'), WEEK);
    await approve(alice, await pot.getAddress(), '1000');
    await pot.connect(alice).contribute(1, parse('50'));
    await pot.connect(creator).release(1);

    // Bill lifecycle
    await bill
      .connect(creator)
      .createBill(carol.address, [alice.address, bob.address], [parse('5'), parse('5')], WEEK);
    await approve(alice, await bill.getAddress(), '1000');
    await approve(bob, await bill.getAddress(), '1000');
    await bill.connect(alice).payShare(1, parse('5'));
    await bill.connect(bob).payShare(1, parse('5'));
    await bill.connect(creator).release(1);

    // ROSCA dissolve + pull refund
    await rosca.connect(alice).createCircle(parse('3'), 86400);
    await rosca.connect(alice).inviteMember(1, bob.address);
    await rosca.connect(bob).acceptInvite(1);
    await approve(alice, await rosca.getAddress(), '1000');
    await rosca.connect(alice).contribute(1);
    await rosca.connect(alice).proposeDissolve(1);
    await rosca.connect(bob).voteDissolve(1);
    await rosca.connect(alice).claimRoundRefund(1, 0);

    // Tab
    await approve(alice, await tab.getAddress(), '1000');
    await tab.connect(alice).lend(bob.address, parse('9'), 0, 'x');
    await approve(bob, await tab.getAddress(), '1000');
    await tab.connect(bob).repay(1, parse('9'));

    // Allowance
    await approve(creator, await allowance.getAddress(), '1000');
    await allowance.connect(creator).open(alice.address, parse('12'), 86400);
    await allowance.connect(alice).spend(1, bob.address, parse('4'));
    await allowance.connect(creator).closeAndWithdraw(1);

    for (const c of contracts) {
      await assertBalanced(c);
      expect(await c.totalEscrowed()).to.equal(0n);
      expect(await usdc.balanceOf(await c.getAddress())).to.equal(0n);
    }
  });

  it('rescue cannot drain escrowed principal on pot', async () => {
    const { pot, usdc, guardian, creator, carol, alice, approve, parse } =
      await loadFixture(deployFixture);
    await pot.connect(creator).createPot(carol.address, parse('50'), 7 * 24 * 3600);
    await approve(alice, await pot.getAddress(), '1000');
    await pot.connect(alice).contribute(1, parse('10'));

    // Mistaken direct transfer (not via contribute accounting)
    await usdc.mint(await pot.getAddress(), parse('3'));

    const esc = await pot.totalEscrowed();
    const bal = await usdc.balanceOf(await pot.getAddress());
    expect(bal).to.equal(esc + parse('3'));
    await pot.connect(guardian).rescueToken(await usdc.getAddress(), guardian.address, parse('3'));
    expect(await usdc.balanceOf(await pot.getAddress())).to.equal(esc);
    await expect(pot.connect(guardian).rescueToken(await usdc.getAddress(), guardian.address, parse('1'))).to
      .be.reverted;
  });
});
