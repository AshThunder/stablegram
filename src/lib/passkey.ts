import {
  ContractAddress,
  WebAuthnMode,
  encodeTransfer,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
} from '@circle-fin/modular-wallets-core';
import { createPublicClient, encodeFunctionData, parseUnits, type Address, type Hex, type Transport } from 'viem';
import { createBundlerClient, toWebAuthnAccount } from 'viem/account-abstraction';
import { arcChain, isMainnet, NAMES, namesAbi } from '@/lib/arc';
import { inTelegram, telegram, telegramUserId } from '@/lib/telegram';

const CLIENT_KEY = import.meta.env.VITE_CIRCLE_CLIENT_KEY || '';
const CLIENT_URL = import.meta.env.VITE_CIRCLE_CLIENT_URL || 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';

type StoredCredential = { id: string; publicKey: string; rpId?: string };

export type PasskeyWallet = {
  address: Address;
  sendUsdc: (to: Address, amount: number) => Promise<Hex>;
  claimName: (name: string) => Promise<Hex>;
};

function requireClientKey() {
  if (!CLIENT_KEY) {
    throw new Error('Create a Modular Wallets client key, set the passkey domain, then add VITE_CIRCLE_CLIENT_KEY.');
  }
}

function chainPath() {
  return isMainnet() ? 'arc' : 'arcTestnet';
}

async function openAccount(credential: StoredCredential, name?: string | null): Promise<PasskeyWallet> {
  requireClientKey();
  const chain = arcChain();
  const modular = toModularTransport(`${CLIENT_URL}/${chainPath()}`, CLIENT_KEY) as unknown as Transport;
  const client = createPublicClient({ chain, transport: modular });
  const owner = toWebAuthnAccount({
    credential: { id: credential.id, publicKey: credential.publicKey as Hex },
  });
  const account = (await toCircleSmartAccount({
    client: client as never,
    owner: owner as never,
    name: name || undefined,
  })) as { address: Address };
  const bundler = createBundlerClient({ chain, transport: modular, account: account as never }) as {
    sendUserOperation: (args: { account: unknown; calls: unknown; paymaster: boolean }) => Promise<Hex>;
    waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{ receipt: { transactionHash: Hex } }>;
  };
  return {
    address: account.address,
    async sendUsdc(to, amount) {
      const token = isMainnet() ? ContractAddress.Arc_USDC : ContractAddress.ArcTestnet_USDC;
      const call = encodeTransfer(to, token, parseUnits(amount.toFixed(2), 6));
      const hash = await bundler.sendUserOperation({
        account,
        calls: [call],
        paymaster: true,
      });
      const { receipt } = await bundler.waitForUserOperationReceipt({ hash });
      return receipt.transactionHash;
    },
    async claimName(name: string) {
      const data = encodeFunctionData({ abi: namesAbi, functionName: 'claim', args: [name] });
      const hash = await bundler.sendUserOperation({
        account,
        calls: [{ to: NAMES, data }],
        paymaster: true,
      });
      const { receipt } = await bundler.waitForUserOperationReceipt({ hash });
      return receipt.transactionHash;
    },
  };
}

const PENDING_KEY = 'dg.passkeyPending';

export type SavedCredential = { id: string; publicKey: string; rpId?: string };
type PasskeyPending = { state: string; name: string; mode: 'create' | 'signin'; expires: number };

function remember(credential: SavedCredential, name?: string) {
  localStorage.setItem('dg.passkey', JSON.stringify({ id: credential.id, publicKey: credential.publicKey, rpId: credential.rpId }));
  if (name) localStorage.setItem('dg.passkeyName', name);
}

function circleUsername(displayName: string) {
  const clean = displayName.trim().replace(/[^A-Za-z0-9_@.:+-]/g, '').slice(0, 44);
  const base = clean || 'stablegram';
  return `${base}-${crypto.randomUUID().slice(0, 4)}`.slice(0, 50);
}

function errorText(err: unknown) {
  const raw = err instanceof Error ? err.message : 'Passkey did not finish.';
  const details = raw.match(/Details:\s*([\s\S]*?)(?:\s*Version:|$)/i);
  return (details?.[1] || raw).replace(/\s+/g, ' ').trim();
}

export function explainPasskeyError(err: unknown) {
  const message = errorText(err);
  if (/invalid credentials/i.test(message)) {
    const host = window.location.hostname;
    return `Circle blocked ${host}. The client key allowed domain and the passkey domain both need to be ${host}, with no https.`;
  }
  if (/username is invalid/i.test(message)) {
    return 'Use 5 to 50 letters or numbers. Spaces are left out of the passkey name.';
  }
  if (/duplicate/i.test(message)) {
    return 'That passkey name was already started. Tap Create passkey again.';
  }
  if (/web authentication service|notallowed|notreadable|authenticator/i.test(message)) {
    return inTelegram()
      ? 'Telegram can’t open the passkey prompt. Finish it in the browser window, then come back.'
      : 'This browser couldn’t open the passkey prompt. Use Chrome or Safari on a device with a screen lock.';
  }
  if (/webauthn protocol/i.test(message)) {
    const host = window.location.hostname;
    return `Set the passkey domain in Circle to ${host}. Hostname only, no port.`;
  }
  if (/unknown RPC error|viem@/i.test(message)) return 'The passkey could not be created. Try again.';
  return message;
}

export function readSavedPasskey(): SavedCredential | null {
  try {
    const credential = JSON.parse(localStorage.getItem('dg.passkey') || '') as SavedCredential;
    if (!credential?.id || !credential.publicKey) return null;
    return credential;
  } catch {
    return null;
  }
}

export function readPasskeyPending(): PasskeyPending | null {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '') as PasskeyPending;
    if (!pending?.state || pending.expires < Date.now()) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

export function clearPasskeyPending() {
  localStorage.removeItem(PENDING_KEY);
}

export function beginExternalPasskey(mode: 'create' | 'signin', name: string) {
  const tg = telegram();
  if (!tg?.openLink) throw new Error('Open Stablegram from the bot menu, then try the passkey again.');
  const state = `${crypto.randomUUID()}.${telegramUserId() || '0'}`;
  const pending: PasskeyPending = { state, name, mode, expires: Date.now() + 3 * 60 * 1000 };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const url = new URL(window.location.origin);
  url.searchParams.set('passkey', mode);
  url.searchParams.set('state', state);
  if (name) url.searchParams.set('name', name);
  tg.openLink(url.toString());
}

export async function createPasskey(displayName: string): Promise<PasskeyWallet> {
  requireClientKey();
  const transport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY);
  let credential: SavedCredential | null = null;
  let last: unknown;
  for (let attempt = 0; attempt < 2 && !credential; attempt += 1) {
    try {
      credential = await toWebAuthnCredential({
        transport,
        mode: WebAuthnMode.Register,
        username: circleUsername(displayName),
      }) as SavedCredential;
    } catch (err) {
      last = err;
      if (!/duplicate/i.test(errorText(err))) throw err;
    }
  }
  if (!credential) throw last instanceof Error ? last : new Error('Passkey did not finish.');
  remember(credential, displayName.trim());
  return openAccount(credential, displayName.trim());
}

export async function signInPasskey(): Promise<PasskeyWallet> {
  requireClientKey();
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(CLIENT_URL, CLIENT_KEY),
    mode: WebAuthnMode.Login,
  }) as SavedCredential;
  remember(credential);
  return openAccount(credential, localStorage.getItem('dg.passkeyName'));
}

export async function openHandedPasskey(credential: SavedCredential, name?: string) {
  remember(credential, name);
  return openAccount(credential, name || localStorage.getItem('dg.passkeyName'));
}

export async function waitForPasskey(state: string, signal: AbortSignal) {
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal.aborted) return 'aborted' as const;
    try {
      const response = await fetch('/api/auth/passkey-return', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
        signal,
      });
      const data = (await response.json().catch(() => ({}))) as { credential?: SavedCredential; name?: string };
      if (data.credential?.id && data.credential.publicKey) return { credential: data.credential, name: data.name || '' };
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return 'aborted' as const;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
  return 'timeout' as const;
}

export async function restorePasskey(): Promise<PasskeyWallet | null> {
  if (!CLIENT_KEY) return null;
  const raw = localStorage.getItem('dg.passkey');
  if (!raw) return null;
  const credential = JSON.parse(raw) as StoredCredential;
  if (!credential?.id || !credential.publicKey) return null;
  return openAccount(credential, localStorage.getItem('dg.passkeyName'));
}
