import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';

export async function deployFixture() {
  const [guardian, creator, alice, bob, carol, stranger] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory('MockUSDC')).deploy();
  await usdc.waitForDeployment();

  const mint = async (user: { address: string }, human: string) => {
    await usdc.mint(user.address, ethers.parseUnits(human, 6));
  };

  await mint(creator, '10000');
  await mint(alice, '10000');
  await mint(bob, '10000');
  await mint(carol, '10000');

  const usdcAddr = await usdc.getAddress();
  const gAddr = guardian.address;

  const pot = await (await ethers.getContractFactory('StablegramPot')).deploy(usdcAddr, gAddr);
  const bill = await (await ethers.getContractFactory('StablegramBillEscrow')).deploy(usdcAddr, gAddr);
  const rosca = await (await ethers.getContractFactory('StablegramRosca')).deploy(usdcAddr, gAddr);
  const tab = await (await ethers.getContractFactory('StablegramTab')).deploy(usdcAddr, gAddr);
  const allowance = await (await ethers.getContractFactory('StablegramAllowance')).deploy(usdcAddr, gAddr);

  await Promise.all([
    pot.waitForDeployment(),
    bill.waitForDeployment(),
    rosca.waitForDeployment(),
    tab.waitForDeployment(),
    allowance.waitForDeployment(),
  ]);

  const approve = async (user: typeof creator, spender: string, human: string) => {
    await usdc.connect(user).approve(spender, ethers.parseUnits(human, 6));
  };

  async function assertBalanced(c: {
    getAddress: () => Promise<string>;
    totalEscrowed: () => Promise<bigint>;
  }) {
    const addr = await c.getAddress();
    const bal = await usdc.balanceOf(addr);
    const esc = await c.totalEscrowed();
    expect(bal).to.equal(esc, `imbalance on ${addr}: bal=${bal} escrowed=${esc}`);
  }

  return {
    usdc,
    pot,
    bill,
    rosca,
    tab,
    allowance,
    guardian,
    creator,
    alice,
    bob,
    carol,
    stranger,
    mint,
    approve,
    assertBalanced,
    parse: (h: string) => ethers.parseUnits(h, 6),
    time,
  };
}
