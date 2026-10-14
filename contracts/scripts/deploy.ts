import { ethers, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

/** Arc USDC ERC-20 interface. Same address on testnet and mainnet. 6 decimals. */
const ARC_USDC = '0x3600000000000000000000000000000000000000';

async function main() {
  const [deployer] = await ethers.getSigners();
  const onArc = network.name === 'arc' || network.name === 'arcTestnet';
  if (network.name === 'arc') {
    console.warn('MAINNET: this deploy spends real USDC gas on Arc.');
  }
  console.log(`Deploying from ${deployer.address} on ${network.name}`);

  let usdcAddress = '';
  let mock = false;

  if (onArc) {
    usdcAddress = ARC_USDC;
    console.log(`Using Arc USDC: ${usdcAddress}`);
  } else {
    const Mock = await ethers.getContractFactory('MockUSDC');
    const token = await Mock.deploy();
    await token.waitForDeployment();
    usdcAddress = await token.getAddress();
    mock = true;
    const mintAmt = ethers.parseUnits(process.env.MOCK_USDC_MINT || '1000000', 6);
    await (await token.mint(deployer.address, mintAmt)).wait();
    console.log(`MockUSDC: ${usdcAddress}`);
  }

  const guardian = process.env.RESCUE_GUARDIAN || deployer.address;
  const names = [
    'StablegramPot',
    'StablegramBillEscrow',
    'StablegramRosca',
    'StablegramTab',
    'StablegramAllowance',
  ] as const;

  const deployed: Record<string, string> = {};
  for (const name of names) {
    const Factory = await ethers.getContractFactory(name);
    const c = await Factory.deploy(usdcAddress, guardian);
    await c.waitForDeployment();
    deployed[name] = await c.getAddress();
    console.log(`${name}: ${deployed[name]}`);
  }

  const Names = await ethers.getContractFactory('StablegramNames');
  const namesContract = await Names.deploy();
  await namesContract.waitForDeployment();
  deployed.StablegramNames = await namesContract.getAddress();
  console.log(`StablegramNames: ${deployed.StablegramNames}`);

  const addresses = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    usdc: usdcAddress,
    mockUsdc: mock,
    rescueGuardian: guardian,
    ...deployed,
    deployer: deployer.address,
  };

  const outDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(out, JSON.stringify(addresses, null, 2));
  console.log(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
