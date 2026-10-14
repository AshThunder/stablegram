/**
 * Arbitrum Sepolia live rehearsal:
 * 1) Deploy MockUSDC + all Stablegram vaults
 * 2) Mint USDC + send gas ETH to tester wallets
 * 3) Run full happy-path lifecycles on every vault
 * 4) Assert contract USDC balance == totalEscrowed == 0 (no stuck funds)
 */
import { ethers, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

type Vault = {
  getAddress: () => Promise<string>;
  totalEscrowed: () => Promise<bigint>;
};

function loadWallets() {
  const walletsPath = path.join(__dirname, '..', '.wallets', 'wallets.local.json');
  if (!fs.existsSync(walletsPath)) {
    throw new Error('Missing .wallets/wallets.local.json — run npm run wallets:create');
  }
  return JSON.parse(fs.readFileSync(walletsPath, 'utf8')) as {
    funding: { address: string; privateKey: string };
    testers: Array<{ address: string; privateKey: string }>;
  };
}

async function assertClean(label: string, usdc: { balanceOf: (a: string) => Promise<bigint> }, c: Vault) {
  const addr = await c.getAddress();
  const bal = await usdc.balanceOf(addr);
  const esc = await c.totalEscrowed();
  if (bal !== esc) {
    throw new Error(`[${label}] imbalance: balance=${bal} escrowed=${esc}`);
  }
  if (bal !== 0n) {
    throw new Error(`[${label}] STUCK FUNDS: balance=${bal} (expected 0 after lifecycle)`);
  }
  console.log(`  ✓ ${label}: balance=0 escrowed=0`);
}

async function main() {
  if (network.name === 'arbitrum') {
    throw new Error('Refusing live rehearsal on Arbitrum One — use MockUSDC on Sepolia');
  }

  const data = loadWallets();
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== data.funding.address.toLowerCase()) {
    throw new Error(
      `Signer ${deployer.address} != funding ${data.funding.address}. Check FUNDING_PRIVATE_KEY.`,
    );
  }

  const alice = new ethers.Wallet(data.testers[0].privateKey, ethers.provider);
  const bob = new ethers.Wallet(data.testers[1].privateKey, ethers.provider);
  const carol = new ethers.Wallet(data.testers[2].privateKey, ethers.provider);

  console.log(`\n=== Live rehearsal on ${network.name} ===`);
  console.log(`Funding: ${deployer.address}`);
  console.log(`ETH:     ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);

  // --- Deploy MockUSDC ---
  const Mock = await ethers.getContractFactory('MockUSDC');
  const usdc = await Mock.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  const mintTotal = ethers.parseUnits('1000000', 6);
  await (await usdc.mint(deployer.address, mintTotal)).wait();
  console.log(`MockUSDC: ${usdcAddr}`);

  const guardian = process.env.RESCUE_GUARDIAN || deployer.address;

  // --- Deploy vaults ---
  const pot = await (await ethers.getContractFactory('StablegramPot')).deploy(usdcAddr, guardian);
  const bill = await (await ethers.getContractFactory('StablegramBillEscrow')).deploy(usdcAddr, guardian);
  const rosca = await (await ethers.getContractFactory('StablegramRosca')).deploy(usdcAddr, guardian);
  const tab = await (await ethers.getContractFactory('StablegramTab')).deploy(usdcAddr, guardian);
  const allowance = await (await ethers.getContractFactory('StablegramAllowance')).deploy(usdcAddr, guardian);
  await Promise.all([
    pot.waitForDeployment(),
    bill.waitForDeployment(),
    rosca.waitForDeployment(),
    tab.waitForDeployment(),
    allowance.waitForDeployment(),
  ]);

  const addresses = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    usdc: usdcAddr,
    mockUsdc: true,
    rescueGuardian: guardian,
    StablegramPot: await pot.getAddress(),
    StablegramBillEscrow: await bill.getAddress(),
    StablegramRosca: await rosca.getAddress(),
    StablegramTab: await tab.getAddress(),
    StablegramAllowance: await allowance.getAddress(),
    deployer: deployer.address,
    rehearsal: true,
  };

  const outDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(out, JSON.stringify(addresses, null, 2));
  console.log(`Wrote ${out}`);

  // --- Fund testers: ETH gas + mint MockUSDC ---
  const ethEach = ethers.parseEther(process.env.FUND_ETH_EACH || '0.0004');
  const usdcEach = ethers.parseUnits(process.env.FUND_USDC_EACH || '500', 6);
  for (const t of data.testers.slice(0, 3)) {
    const tx = await deployer.sendTransaction({ to: t.address, value: ethEach });
    await tx.wait();
    await (await usdc.mint(t.address, usdcEach)).wait();
    console.log(`Funded ${t.address}`);
  }

  const parse = (h: string) => ethers.parseUnits(h, 6);

  // ========== Pot ==========
  console.log('\nPot lifecycle…');
  await (await pot.connect(deployer).createPot(carol.address, parse('20'), 7 * 24 * 3600)).wait();
  await (await usdc.connect(alice).approve(await pot.getAddress(), parse('100'))).wait();
  await (await pot.connect(alice).contribute(1, parse('20'))).wait();
  await (await pot.connect(deployer).release(1)).wait();
  await assertClean('pot', usdc, pot);

  // ========== Bill ==========
  console.log('\nBill lifecycle…');
  await (
    await bill
      .connect(deployer)
      .createBill(carol.address, [alice.address, bob.address], [parse('5'), parse('5')], 7 * 24 * 3600)
  ).wait();
  await (await usdc.connect(alice).approve(await bill.getAddress(), parse('100'))).wait();
  await (await usdc.connect(bob).approve(await bill.getAddress(), parse('100'))).wait();
  await (await bill.connect(alice).payShare(1, parse('5'))).wait();
  await (await bill.connect(bob).payShare(1, parse('5'))).wait();
  await (await bill.connect(deployer).release(1)).wait();
  await assertClean('bill', usdc, bill);

  // ========== ROSCA ==========
  console.log('\nROSCA lifecycle…');
  await (await rosca.connect(alice).createCircle(parse('8'), 86400)).wait();
  await (await rosca.connect(alice).inviteMember(1, bob.address)).wait();
  await (await rosca.connect(bob).acceptInvite(1)).wait();
  await (await usdc.connect(alice).approve(await rosca.getAddress(), parse('100'))).wait();
  await (await usdc.connect(bob).approve(await rosca.getAddress(), parse('100'))).wait();
  await (await rosca.connect(alice).contribute(1)).wait();
  await (await rosca.connect(bob).contribute(1)).wait(); // auto-payout
  await (await rosca.connect(alice).contribute(1)).wait();
  await (await rosca.connect(bob).contribute(1)).wait(); // auto-payout + complete
  await assertClean('rosca', usdc, rosca);

  // ========== Tab ==========
  console.log('\nTab lifecycle…');
  await (await usdc.connect(alice).approve(await tab.getAddress(), parse('100'))).wait();
  await (await tab.connect(alice).lend(bob.address, parse('9'), 0, 'rehearsal')).wait();
  await (await usdc.connect(bob).approve(await tab.getAddress(), parse('100'))).wait();
  await (await tab.connect(bob).repay(1, parse('9'))).wait();
  await assertClean('tab', usdc, tab);

  // ========== Allowance ==========
  console.log('\nAllowance lifecycle…');
  await (await usdc.connect(deployer).approve(await allowance.getAddress(), parse('100'))).wait();
  await (await allowance.connect(deployer).open(alice.address, parse('12'), 7 * 24 * 3600)).wait();
  await (await allowance.connect(alice).spend(1, bob.address, parse('4'))).wait();
  await (await allowance.connect(deployer).closeAndWithdraw(1)).wait();
  await assertClean('allowance', usdc, allowance);

  // Final sweep check on all
  console.log('\n=== Final stuck-funds check ===');
  for (const [label, c] of [
    ['pot', pot],
    ['bill', bill],
    ['rosca', rosca],
    ['tab', tab],
    ['allowance', allowance],
  ] as const) {
    await assertClean(label, usdc, c);
  }

  const report = {
    ...addresses,
    result: 'PASS',
    note: 'All vaults ended with USDC balance == totalEscrowed == 0',
  };
  fs.writeFileSync(path.join(outDir, `${network.name}.rehearsal.json`), JSON.stringify(report, null, 2));
  console.log('\nPASS — no funds stuck. Deployments saved.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
