import hre from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

type Deployment = {
  usdc: string;
  rescueGuardian: string;
  StablegramPot: string;
  StablegramBillEscrow: string;
  StablegramRosca: string;
  StablegramTab: string;
  StablegramAllowance: string;
};

async function verifyOne(name: string, address: string, usdc: string, guardian: string) {
  try {
    await hre.run('verify:verify', {
      address,
      constructorArguments: [usdc, guardian],
    });
    console.log(`✓ Verified ${name} at ${address}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already verified|Already Verified/i.test(msg)) {
      console.log(`✓ ${name} already verified at ${address}`);
      return;
    }
    console.error(`✗ ${name} (${address}):`, msg);
  }
}

async function main() {
  const depPath = path.join(__dirname, '..', 'deployments', 'arbitrum.json');
  if (!fs.existsSync(depPath)) {
    throw new Error('Missing deployments/arbitrum.json — run npm run deploy:arb first');
  }
  const dep = JSON.parse(fs.readFileSync(depPath, 'utf8')) as Deployment;

  if (!process.env.ARBISCAN_API_KEY?.trim()) {
    throw new Error('Set ARBISCAN_API_KEY in contracts/.env (free at arbiscan.io/myapikey)');
  }

  const { usdc, rescueGuardian: guardian } = dep;
  const entries: [string, string][] = [
    ['StablegramPot', dep.StablegramPot],
    ['StablegramBillEscrow', dep.StablegramBillEscrow],
    ['StablegramRosca', dep.StablegramRosca],
    ['StablegramTab', dep.StablegramTab],
    ['StablegramAllowance', dep.StablegramAllowance],
  ];

  console.log(`Verifying on ${hre.network.name} — USDC ${usdc}, guardian ${guardian}\n`);

  for (const [name, address] of entries) {
    await verifyOne(name, address, usdc, guardian);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
