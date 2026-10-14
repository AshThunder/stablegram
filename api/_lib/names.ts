import { createPublicClient, createWalletClient, http, isAddress, keccak256, toBytes, verifyMessage, zeroAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arc, arcTestnet } from 'viem/chains';
import { circleClient } from './circle.js';

export const NAMES = '0x33c602542f0e9d26BcbB1eee1AF8d6B4519B737E' as const;

const namesAbi = [
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
] as const;

export function cleanName(raw: string) {
  return raw.replace(/^@/, '').trim().toLowerCase();
}

export function validName(name: string) {
  return /^[a-z0-9_]{3,20}$/.test(name);
}

export function claimMessage(chainId: number, address: string, name: string) {
  return `Stablegram claim\n${chainId}\n${address.toLowerCase()}\n${name}`;
}

function envValue(name: string) {
  const bag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return bag?.[name] ?? '';
}

export function namesChain() {
  return envValue('ARC_NETWORK') === 'mainnet' || envValue('VITE_ARC_NETWORK') === 'mainnet' ? arc : arcTestnet;
}

export function namesClient() {
  const chain = namesChain();
  const rpc = chain.id === arc.id ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io';
  return createPublicClient({ chain, transport: http(rpc) });
}

export async function ownerOfName(name: string) {
  const owner = await namesClient().readContract({
    address: NAMES,
    abi: namesAbi,
    functionName: 'ownerOf',
    args: [keccak256(toBytes(name))],
  });
  return owner.toLowerCase() === zeroAddress ? '' : owner;
}

export async function handleOfAddress(address: Address) {
  return namesClient().readContract({ address: NAMES, abi: namesAbi, functionName: 'handleOf', args: [address] });
}

export async function walletOwns(userToken: string, address: string) {
  const listed = await circleClient().listWallets({ userToken });
  const wallets = listed.data?.wallets ?? [];
  return wallets.some((wallet) => wallet.address?.toLowerCase() === address.toLowerCase());
}

export async function submitClaim(address: Address, name: string, signature: Hex) {
  const chain = namesChain();
  const ok = await verifyMessage({ address, message: claimMessage(chain.id, address, name), signature });
  if (!ok) {
    const error = new Error('That signature does not match this wallet.');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const key = envValue('RELAYER_PRIVATE_KEY');
  if (!key || !isAddress(address)) {
    const error = new Error(key ? 'Address required.' : 'Set RELAYER_PRIVATE_KEY on the server.');
    (error as Error & { status?: number }).status = key ? 400 : 503;
    throw error;
  }
  const account = privateKeyToAccount(key.startsWith('0x') ? (key as Hex) : (`0x${key}` as Hex));
  const rpc = chain.id === arc.id ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io';
  const relayer = createWalletClient({ account, chain, transport: http(rpc) });
  return relayer.writeContract({
    address: NAMES,
    abi: namesAbi,
    functionName: 'claimFor',
    args: [address, name, signature],
  });
}
