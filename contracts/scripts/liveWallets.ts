/**
 * Arc testnet only. Moves a little USDC between the deployer and two tester wallets,
 * then runs a pot and a bill split on the deployed vaults.
 */
import { ethers, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

const USDC = '0x3600000000000000000000000000000000000000';
const POT = '0xA883B7A2713b6b00a37A1B4c6cB249d72bd2de3F';
const BILL = '0x2aF6EE718Cbd9F27BfA56B0642C4e5B53e9FA029';

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
];
const potAbi = [
  'function createPot(address,uint256,uint256) returns (uint256)',
  'function contribute(uint256,uint256)',
  'function release(uint256)',
  'function nextPotId() view returns (uint256)',
];
const billAbi = [
  'function createBill(address,address[],uint256[],uint256) returns (uint256)',
  'function payShare(uint256,uint256)',
  'function release(uint256)',
  'function nextBillId() view returns (uint256)',
];

function usd6(n: string) {
  return ethers.parseUnits(n, 6);
}

async function wallet(name: string, provider: ethers.Provider) {
  const dir = path.join(__dirname, '..', '.wallets');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'testers.json');
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!existing[name]) {
    const fresh = ethers.Wallet.createRandom();
    existing[name] = { address: fresh.address, privateKey: fresh.privateKey };
    fs.writeFileSync(file, JSON.stringify(existing, null, 2), { mode: 0o600 });
  }
  return new ethers.Wallet(existing[name].privateKey, provider);
}

async function bal(token: ethers.Contract, address: string) {
  const raw: bigint = await token.balanceOf(address);
  return ethers.formatUnits(raw, 6);
}

async function main() {
  if (network.name !== 'arcTestnet') {
    throw new Error(`Refusing to run on ${network.name}. Use --network arcTestnet.`);
  }

  const [deployer] = await ethers.getSigners();
  const alice = await wallet('alice', deployer.provider!);
  const bob = await wallet('bob', deployer.provider!);
  const usdc = new ethers.Contract(USDC, erc20Abi, deployer);
  const pot = new ethers.Contract(POT, potAbi, deployer);
  const bill = new ethers.Contract(BILL, billAbi, deployer);

  console.log('deployer', deployer.address, await bal(usdc, deployer.address));
  console.log('alice   ', alice.address, await bal(usdc, alice.address));
  console.log('bob     ', bob.address, await bal(usdc, bob.address));

  const fund = ethers.parseUnits('1', 18);
  const fundA = await deployer.sendTransaction({ to: alice.address, value: fund });
  console.log('fund alice', fundA.hash);
  await fundA.wait();
  const fundB = await deployer.sendTransaction({ to: bob.address, value: fund });
  console.log('fund bob', fundB.hash);
  await fundB.wait();

  const p2p = await usdc.connect(alice).transfer(bob.address, usd6('0.25'));
  console.log('alice -> bob 0.25 USDC', p2p.hash);
  await p2p.wait();

  const goal = usd6('1');
  const createPotTx = await pot.createPot(bob.address, goal, 2 * 60 * 60);
  const potReceipt = await createPotTx.wait();
  const potId = (await pot.nextPotId()) - 1n;
  console.log('create pot', potId.toString(), createPotTx.hash);

  for (const [who, amount] of [
    [alice, usd6('0.40')],
    [bob, usd6('0.60')],
  ] as const) {
    const approve = await usdc.connect(who).approve(POT, amount);
    await approve.wait();
    const pay = await pot.connect(who).contribute(potId, amount);
    console.log('contribute', who.address.slice(0, 8), ethers.formatUnits(amount, 6), pay.hash);
    await pay.wait();
  }
  const releasePot = await pot.release(potId);
  console.log('release pot to bob', releasePot.hash);
  await releasePot.wait();

  const share = usd6('0.20');
  const createBillTx = await bill.createBill(alice.address, [deployer.address, bob.address], [share, share], 2 * 60 * 60);
  await createBillTx.wait();
  const billId = (await bill.nextBillId()) - 1n;
  console.log('create bill', billId.toString(), createBillTx.hash);

  for (const who of [deployer, bob]) {
    const approve = await usdc.connect(who).approve(BILL, share);
    await approve.wait();
    const pay = await bill.connect(who).payShare(billId, share);
    console.log('pay share', who.address.slice(0, 8), pay.hash);
    await pay.wait();
  }
  const releaseBill = await bill.release(billId);
  console.log('release bill to alice', releaseBill.hash);
  await releaseBill.wait();

  console.log('--- balances (USDC, 6 decimals) ---');
  console.log('deployer', await bal(usdc, deployer.address));
  console.log('alice   ', await bal(usdc, alice.address));
  console.log('bob     ', await bal(usdc, bob.address));
  console.log('pot receipt status', potReceipt?.status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
