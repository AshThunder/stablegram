/**
 * Redeploy StablegramRosca only (invite/accept/decline ABI) and patch deployments JSON.
 * Usage: npx hardhat run scripts/deployRosca.ts --network arbitrum
 */
import { ethers, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Deploying Rosca from ${deployer.address} on ${network.name}`);
  console.log(`Balance: ${ethers.formatEther(bal)} ETH`);

  const outDir = path.join(__dirname, '..', 'deployments');
  const out = path.join(outDir, `${network.name}.json`);
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(out)) {
    existing = JSON.parse(fs.readFileSync(out, 'utf8')) as Record<string, unknown>;
  }

  const usdc =
    network.name === 'arbitrum'
      ? USDC_ARB
      : String(process.env.USDC_ADDRESS || existing.usdc || '');
  if (!usdc || !/^0x[a-fA-F0-9]{40}$/.test(usdc)) {
    throw new Error('USDC address missing — set USDC_ADDRESS or use arbitrum');
  }

  const guardian =
    process.env.RESCUE_GUARDIAN ||
    (typeof existing.rescueGuardian === 'string' ? existing.rescueGuardian : '') ||
    deployer.address;

  const Rosca = await ethers.getContractFactory('StablegramRosca');
  const rosca = await Rosca.deploy(usdc, guardian);
  await rosca.waitForDeployment();
  const address = await rosca.getAddress();
  console.log(`StablegramRosca: ${address}`);

  const addresses = {
    ...existing,
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    usdc,
    rescueGuardian: guardian,
    StablegramRosca: address,
    deployer: deployer.address,
    previousStablegramRosca: existing.StablegramRosca ?? null,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(addresses, null, 2));
  console.log(`Wrote ${out}`);
  console.log(`\nVITE_ROSCA=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
