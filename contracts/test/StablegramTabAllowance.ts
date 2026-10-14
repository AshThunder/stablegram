import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { deployFixture } from './helpers';

describe('StablegramTab + Allowance', () => {
  it('lend then partial/full repay; contract holds no residual', async () => {
    const { tab, usdc, alice, bob, approve, parse, assertBalanced } = await loadFixture(deployFixture);
    const tabAddr = await tab.getAddress();
    await approve(alice, tabAddr, '100');

    const b0 = await usdc.balanceOf(bob.address);
    await tab.connect(alice).lend(bob.address, parse('50'), 0, 'transport');
    expect(await usdc.balanceOf(bob.address)).to.equal(b0 + parse('50'));
    await assertBalanced(tab);
    expect(await tab.totalEscrowed()).to.equal(0n);

    await approve(bob, tabAddr, '100');
    const a0 = await usdc.balanceOf(alice.address);
    await tab.connect(bob).repay(1, parse('20'));
    expect(await usdc.balanceOf(alice.address)).to.equal(a0 + parse('20'));
    expect(await tab.outstanding(1)).to.equal(parse('30'));

    await tab.connect(bob).repay(1, parse('30'));
    expect(await tab.outstanding(1)).to.equal(0n);
    await assertBalanced(tab);

    const asB = await tab.debtsAsBorrower(bob.address);
    const asL = await tab.debtsAsLender(alice.address);
    expect(asB[0]).to.equal(1n);
    expect(asL[0]).to.equal(1n);
  });

  it('allowance spend + guardian close withdraws remainder', async () => {
    const { allowance, usdc, creator, alice, bob, approve, parse, assertBalanced, time } =
      await loadFixture(deployFixture);
    const addr = await allowance.getAddress();
    await approve(creator, addr, '100');
    await allowance.connect(creator).open(alice.address, parse('40'), 7 * 24 * 3600);

    await allowance.connect(alice).spend(1, bob.address, parse('15'));
    expect(await usdc.balanceOf(bob.address)).to.be.greaterThan(0n);
    await assertBalanced(allowance);

    const g0 = await usdc.balanceOf(creator.address);
    await allowance.connect(creator).closeAndWithdraw(1);
    expect(await usdc.balanceOf(creator.address)).to.equal(g0 + parse('25'));
    await assertBalanced(allowance);
    expect(await allowance.totalEscrowed()).to.equal(0n);

    // expired purse cannot spend
    await approve(creator, addr, '100');
    await allowance.connect(creator).open(alice.address, parse('10'), 3600);
    await time.increase(3601);
    await expect(allowance.connect(alice).spend(2, bob.address, parse('1'))).to.be.reverted;
    await allowance.connect(creator).closeAndWithdraw(2);
    await assertBalanced(allowance);
  });
});
