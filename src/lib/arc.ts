import { arc, arcTestnet } from 'viem/chains';
import { formatUnits, parseUnits } from 'viem';

/** ERC-20 interface for Arc USDC. 6 decimals. Same address on testnet and mainnet. */
export const USDC = '0x3600000000000000000000000000000000000000' as const;

export const EURC = {
  testnet: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  mainnet: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
} as const;

export function isMainnet() {
  return import.meta.env.VITE_ARC_NETWORK === 'mainnet';
}

export function arcChain() {
  return isMainnet() ? arc : arcTestnet;
}

/** Same-origin proxy. The public Arc RPC rejects some browser fetches. */
export function arcRpcUrl() {
  return `/api/rpc?network=${isMainnet() ? 'mainnet' : 'testnet'}`;
}

export const VAULTS = [
  { name: 'Pot', address: '0xD0a0C703b8b9d422660dFc8Ff1c8c636Cb5e60bF' },
  { name: 'Bill split', address: '0x8A58036e94bE3677e35C2E420B20460115c01f0a' },
  { name: 'Circles', address: '0x358552861E57811F45c9b6fbe95f53bd886fc0C6' },
  { name: 'Loans', address: '0x2796bce3c02e6c8fE3BF6A2424c00052d05216C8' },
  { name: 'Allowance', address: '0xd6C365e0DD991D51662AdFF006C1b4c384ff09cF' },
] as const;

export const NAMES = '0x33c602542f0e9d26BcbB1eee1AF8d6B4519B737E' as const;

export const namesAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimFor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'messageFor',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'name', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'handleOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

export function eurcAddress() {
  return isMainnet() ? EURC.mainnet : EURC.testnet;
}

export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/** Display units from the 6-decimal ERC-20 view. Never mix with the 18-decimal native gas view. */
export function formatUsd(raw: bigint, digits = 2) {
  const n = Number(formatUnits(raw, 6));
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function parseUsd(amount: number) {
  return parseUnits(amount.toFixed(6), 6);
}

/** Gas is the native view of the same USDC, at 18 decimals. */
export function formatGas(wei: bigint) {
  const n = Number(formatUnits(wei, 18));
  if (n <= 0) return '$0.00';
  if (n < 0.0001) return '< $0.0001';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function explorerTx(hash: string) {
  const host = isMainnet() ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io';
  return `${host}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  const host = isMainnet() ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io';
  return `${host}/address/${address}`;
}
