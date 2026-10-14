import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const key = process.env.PRIVATE_KEY || process.env.FUNDING_PRIVATE_KEY || '';
const accounts = key ? [key] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    hardhat: { chainId: 31337 },
    arcTestnet: {
      url: process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.io',
      chainId: 5042002,
      accounts,
    },
    arc: {
      url: process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io',
      chainId: 5042,
      accounts,
    },
  },
  mocha: { timeout: 120000 },
};

export default config;
