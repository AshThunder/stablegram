import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('StablegramNames', () => {
  async function deploy() {
    const [alice, bob] = await ethers.getSigners();
    const names = await (await ethers.getContractFactory('StablegramNames')).deploy();
    await names.waitForDeployment();
    return { names, alice, bob };
  }

  it('lets a wallet claim once, and blocks a second name or a taken name', async () => {
    const { names, alice, bob } = await deploy();
    await names.connect(alice).claim('maya');
    expect(await names.handleOf(alice.address)).to.equal('maya');
    expect(await names.ownerOf(ethers.keccak256(ethers.toUtf8Bytes('maya')))).to.equal(alice.address);

    await expect(names.connect(alice).claim('other')).to.be.revertedWithCustomError(names, 'AddressHasName');
    await expect(names.connect(bob).claim('maya')).to.be.revertedWithCustomError(names, 'NameTaken');
    await expect(names.connect(bob).claim('M')).to.be.revertedWithCustomError(names, 'InvalidName');
    await expect(names.connect(bob).claim('Maya')).to.be.revertedWithCustomError(names, 'InvalidName');
  });

  it('accepts a signed claim and rejects a bad signature', async () => {
    const { names, alice, bob } = await deploy();
    const message = await names.messageFor(alice.address, 'lee');
    const signature = await alice.signMessage(message);
    await names.connect(bob).claimFor(alice.address, 'lee', signature);
    expect(await names.handleOf(alice.address)).to.equal('lee');

    const forged = await bob.signMessage(await names.messageFor(alice.address, 'sam'));
    await expect(names.connect(bob).claimFor(alice.address, 'sam', forged)).to.be.revertedWithCustomError(names, 'BadSignature');
  });
});
