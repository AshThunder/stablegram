import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Creates a funding wallet + N tester wallets.
 * Writes secrets to contracts/.wallets/ (gitignored).
 * Prints the funding address — send Arb ETH + USDC here first.
 */
async function main() {
  const count = Number(process.env.TEST_WALLET_COUNT || 5);
  const dir = path.join(__dirname, '..', '.wallets');
  fs.mkdirSync(dir, { recursive: true });

  const funding = ethers.Wallet.createRandom();
  const testers = Array.from({ length: count }, () => ethers.Wallet.createRandom());

  const payload = {
    createdAt: new Date().toISOString(),
    warning: 'SECRET — fund funding.address on Arbitrum, then run wallets:fund. Never commit this file.',
    funding: {
      address: funding.address,
      privateKey: funding.privateKey,
      mnemonic: funding.mnemonic?.phrase,
    },
    testers: testers.map((w, i) => ({
      index: i + 1,
      address: w.address,
      privateKey: w.privateKey,
      mnemonic: w.mnemonic?.phrase,
    })),
  };

  const out = path.join(dir, 'wallets.local.json');
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));

  const envHint = path.join(dir, 'FUNDING_KEY.env.snippet');
  fs.writeFileSync(
    envHint,
    `FUNDING_PRIVATE_KEY=${funding.privateKey}\n# Fund this address on Arbitrum with ETH (gas) + USDC:\n# ${funding.address}\n`,
  );

  console.log('\n=== Stablegram test wallets created ===\n');
  console.log(`Saved: ${out}`);
  console.log(`\nFUNDING ADDRESS (send Arb ETH + USDC here):\n  ${funding.address}\n`);
  console.log('Tester addresses:');
  for (const t of payload.testers) {
    console.log(`  [${t.index}] ${t.address}`);
  }
  console.log('\nNext:');
  console.log('  1. Copy FUNDING_PRIVATE_KEY into contracts/.env');
  console.log('  2. Fund the funding address with Arb ETH + USDC');
  console.log('  3. npm run wallets:fund --network arbitrumSepolia  (or arbitrum)');
  console.log('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
