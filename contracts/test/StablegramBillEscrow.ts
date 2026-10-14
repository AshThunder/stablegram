import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { deployFixture } from './helpers';

const WEEK = 7 * 24 * 3600;

describe('StablegramBillEscrow', () => {
  it('full pay then release; withdraw mid-way', async () => {
    const { bill, usdc, creator, alice, bob, carol, approve, parse, assertBalanced } = await loadFixture(
      deployFixture,
    );
    const billAddr = await bill.getAddress();

    await bill
      .connect(creator)
      .createBill(carol.address, [alice.address, bob.address], [parse('40'), parse('60')], WEEK);

    await approve(alice, billAddr, '100');
    await approve(bob, billAddr, '100');
    await bill.connect(alice).payShare(1, parse('40'));
    await bill.connect(bob).payShare(1, parse('60'));
    await assertBalanced(bill);

    const c0 = await usdc.balanceOf(carol.address);
    await bill.connect(creator).release(1);
    expect(await usdc.balanceOf(carol.address)).to.equal(c0 + parse('100'));
    await assertBalanced(bill);

    // second bill — payer withdraws, then cancel
    await bill
      .connect(creator)
      .createBill(carol.address, [alice.address, bob.address], [parse('10'), parse('10')], WEEK);
    await bill.connect(alice).payShare(2, parse('10'));
    const a0 = await usdc.balanceOf(alice.address);
    await bill.connect(alice).withdrawPayment(2);
    expect(await usdc.balanceOf(alice.address)).to.equal(a0 + parse('10'));
    await bill.connect(creator).cancel(2);
    await assertBalanced(bill);
  });

  it('rejects duplicate payers; releaseIfFunded', async () => {
    const { bill, usdc, creator, alice, carol, approve, parse, assertBalanced } = await loadFixture(
      deployFixture,
    );
    await expect(
      bill
        .connect(creator)
        .createBill(carol.address, [alice.address, alice.address], [parse('5'), parse('5')], WEEK),
    ).to.be.revertedWithCustomError(bill, 'DuplicatePayer');

    await bill.connect(creator).createBill(carol.address, [alice.address], [parse('10')], WEEK);
    await approve(alice, await bill.getAddress(), '100');
    await bill.connect(alice).payShare(1, parse('10'));
    const c0 = await usdc.balanceOf(carol.address);
    await bill.connect(alice).releaseIfFunded(1);
    expect(await usdc.balanceOf(carol.address)).to.equal(c0 + parse('10'));
    await assertBalanced(bill);
  });
});
