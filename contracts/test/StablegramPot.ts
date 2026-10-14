import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { deployFixture } from './helpers';

const WEEK = 7 * 24 * 3600;

describe('StablegramPot', () => {
  it('release pays beneficiary and zeros escrow', async () => {
    const { pot, usdc, creator, alice, bob, approve, parse, assertBalanced } = await loadFixture(deployFixture);
    const potAddr = await pot.getAddress();
    await pot.connect(creator).createPot(creator.address, parse('100'), WEEK);
    await approve(alice, potAddr, '100');
    await approve(bob, potAddr, '100');
    await pot.connect(alice).contribute(1, parse('40'));
    await pot.connect(bob).contribute(1, parse('60'));
    await assertBalanced(pot);

    const before = await usdc.balanceOf(creator.address);
    await pot.connect(creator).release(1);
    expect(await usdc.balanceOf(creator.address)).to.equal(before + parse('100'));
    await assertBalanced(pot);
    expect(await pot.totalEscrowed()).to.equal(0n);
  });

  it('contributor can withdraw anytime; cancel soft-closes', async () => {
    const { pot, usdc, creator, alice, bob, approve, parse, assertBalanced } = await loadFixture(deployFixture);
    const potAddr = await pot.getAddress();
    await pot.connect(creator).createPot(creator.address, parse('100'), WEEK);
    await approve(alice, potAddr, '100');
    await approve(bob, potAddr, '100');
    await pot.connect(alice).contribute(1, parse('30'));
    await pot.connect(bob).contribute(1, parse('20'));

    const a0 = await usdc.balanceOf(alice.address);
    await pot.connect(alice).withdrawContribution(1);
    expect(await usdc.balanceOf(alice.address)).to.equal(a0 + parse('30'));

    await pot.connect(creator).cancel(1);
    const b0 = await usdc.balanceOf(bob.address);
    await pot.connect(bob).withdrawContribution(1);
    expect(await usdc.balanceOf(bob.address)).to.equal(b0 + parse('20'));
    await assertBalanced(pot);
    expect(await pot.totalEscrowed()).to.equal(0n);
  });

  it('enforces goal cap; releaseIfFunded works', async () => {
    const { pot, usdc, creator, alice, approve, parse, assertBalanced } = await loadFixture(deployFixture);
    const potAddr = await pot.getAddress();
    await pot.connect(creator).createPot(creator.address, parse('50'), WEEK);
    await approve(alice, potAddr, '100');
    await expect(pot.connect(alice).contribute(1, parse('51'))).to.be.revertedWithCustomError(
      pot,
      'GoalExceeded',
    );
    await pot.connect(alice).contribute(1, parse('50'));
    const before = await usdc.balanceOf(creator.address);
    await pot.connect(alice).releaseIfFunded(1);
    expect(await usdc.balanceOf(creator.address)).to.equal(before + parse('50'));
    await assertBalanced(pot);
  });

  it('after expiry release blocked; withdraw still works', async () => {
    const { pot, usdc, creator, alice, approve, parse, assertBalanced, time } = await loadFixture(deployFixture);
    await pot.connect(creator).createPot(creator.address, parse('100'), 3600);
    await approve(alice, await pot.getAddress(), '100');
    await pot.connect(alice).contribute(1, parse('25'));
    await time.increase(3601);
    await expect(pot.connect(creator).release(1)).to.be.revertedWithCustomError(pot, 'PotExpired');
    const a0 = await usdc.balanceOf(alice.address);
    await pot.connect(alice).withdrawContribution(1);
    expect(await usdc.balanceOf(alice.address)).to.equal(a0 + parse('25'));
    await assertBalanced(pot);
  });
});
