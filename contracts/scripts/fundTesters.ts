import { ethers, network } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

/** Arbitrum One native USDC */
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
/** Arbitrum Sepolia — set via env if different */
const USDC_SEPOLIA = process.env.USDC_ADDRESS || '';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  const walletsPath = path.join(__dirname, '..', '.wallets', 'wallets.local.json');
  if (!fs.existsSync(walletsPath)) {
    throw new Error('Missing .wallets/wallets.local.json — run npm run wallets:create first');
  }

  const data = JSON.parse(fs.readFileSync(walletsPath, 'utf8')) as {
    funding: { address: string; privateKey: string };
    testers: Array<{ address: string }>;
  };

  const [signer] = await ethers.getSigners();
  if (signer.address.toLowerCase() !== data.funding.address.toLowerCase()) {
    console.warn(
      `Warning: connected signer ${signer.address} != funding wallet ${data.funding.address}. Using connected signer.`,
    );
  }

  const ethEach = ethers.parseEther(process.env.FUND_ETH_EACH || '0.002');
  const usdcEachHuman = process.env.FUND_USDC_EACH || '25';

  const usdcAddr =
    network.name === 'arbitrum' ? USDC_ARB : USDC_SEPOLIA || process.env.USDC_ADDRESS;
  if (!usdcAddr) {
    throw new Error('Set USDC_ADDRESS for this network (required on Sepolia)');
  }

  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, signer);
  const decimals: number = await usdc.decimals();
  const usdcEach = ethers.parseUnits(usdcEachHuman, decimals);

  const ethBal = await ethers.provider.getBalance(signer.address);
  const usdcBal: bigint = await usdc.balanceOf(signer.address);

  console.log(`Network: ${network.name}`);
  console.log(`Funder:  ${signer.address}`);
  console.log(`ETH:     ${ethers.formatEther(ethBal)}`);
  console.log(`USDC:    ${ethers.formatUnits(usdcBal, decimals)}`);

  const needEth = ethEach * BigInt(data.testers.length);
  const needUsdc = usdcEach * BigInt(data.testers.length);
  if (ethBal < needEth) throw new Error(`Need ~${ethers.formatEther(needEth)} ETH to fund testers`);
  if (usdcBal < needUsdc) {
    throw new Error(`Need ~${ethers.formatUnits(needUsdc, decimals)} USDC to fund testers`);
  }

  for (const t of data.testers) {
    const txEth = await signer.sendTransaction({ to: t.address, value: ethEach });
    await txEth.wait();
    const txUsdc = await usdc.transfer(t.address, usdcEach);
    await txUsdc.wait();
    console.log(`Funded ${t.address} with ${ethers.formatEther(ethEach)} ETH + ${usdcEachHuman} USDC`);
  }

  console.log('\nDone. Testers ready for contract integration tests on this network.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
