import { ethers } from 'hardhat';

const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

async function main() {
  const [s] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(s.address);
  const usdc = new ethers.Contract(USDC, ['function balanceOf(address) view returns (uint256)'], ethers.provider);
  const u = (await usdc.balanceOf(s.address)) as bigint;
  const fee = await ethers.provider.getFeeData();
  console.log(
    JSON.stringify(
      {
        address: s.address,
        eth: ethers.formatEther(bal),
        usdc: ethers.formatUnits(u, 6),
        gasPriceWei: fee.gasPrice?.toString() ?? null,
        readyForDeploy: bal >= ethers.parseEther('0.005'),
        note: 'Fund ~0.01 ETH on Arbitrum One for deploy margin; USDC not required for deploy itself',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
