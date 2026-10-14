#!/usr/bin/env ts-node
/**
 * Prints VITE_* lines from deployments/arbitrum.json for the app .env
 * Usage: npx ts-node scripts/printAppEnv.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const file = path.join(__dirname, '..', 'deployments', 'arbitrum.json');
if (!fs.existsSync(file)) {
  console.error('Missing deployments/arbitrum.json — run: npm run deploy:arb');
  process.exit(1);
}

const d = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;

const lines = [
  '# Paste into repo-root .env after Arbitrum One deploy',
  'VITE_ARC_NETWORK=mainnet',
  `VITE_USDC_ADDRESS=${d.usdc}`,
  `VITE_POT=${d.StablegramPot}`,
  `VITE_BILL_ESCROW=${d.StablegramBillEscrow}`,
  `VITE_ROSCA=${d.StablegramRosca}`,
  `VITE_TAB=${d.StablegramTab}`,
  `VITE_ALLOWANCE=${d.StablegramAllowance}`,
];

console.log(lines.join('\n'));
