import { Blockchain, initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';

function envValue(name: string) {
  const bag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return bag?.[name] ?? '';
}

export function circleClient() {
  const apiKey = envValue('CIRCLE_API_KEY');
  if (!apiKey) {
    const error = new Error('Set CIRCLE_API_KEY before payments can be approved.');
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  return initiateUserControlledWalletsClient({ apiKey });
}

export function arcBlockchain() {
  return envValue('ARC_NETWORK') === 'mainnet' ? Blockchain.Arc : Blockchain.ArcTestnet;
}

export const USDC = '0x3600000000000000000000000000000000000000';
