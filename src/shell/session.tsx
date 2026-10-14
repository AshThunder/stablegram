import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPublicClient, http, isAddress } from 'viem';
import { arcChain, arcRpcUrl, erc20Abi, explorerTx, formatGas, formatUsd, USDC } from '@/lib/arc';
import { beginExternalPasskey, clearPasskeyPending, createPasskey, explainPasskeyError, openHandedPasskey, readPasskeyPending, restorePasskey, signInPasskey, waitForPasskey, type PasskeyWallet } from '@/lib/passkey';
import { inTelegram } from '@/lib/telegram';
import { addFriend, claimHandle, forgetHandle, pushActivity, patchActivity, readLedger, removeFriend, type Friend, type Kind } from '@/lib/ledger';
import { beginGoogleSignIn, clearCircleOAuth, clearGooglePending, prepareCirclePage, readGooglePending, rememberGoogleReturn, waitForGoogleLogin } from '@/lib/googleLogin';
import { useToasts } from '@/shell/toasts';

type Login = { userToken: string; encryptionKey: string; email?: string };
type Wallet = { id: string; address: string };
type WalletKind = 'google' | 'passkey';
type SavedWallet = { kind: WalletKind; id: string; address: string };

const WALLET_KEY = 'dg.wallet';
const SKIP_KEY = 'dg.skipClaim';

function readSkip(address: string) {
  try {
    const bag = JSON.parse(localStorage.getItem(SKIP_KEY) || '{}') as Record<string, boolean>;
    return bag[address.toLowerCase()] === true;
  } catch {
    return false;
  }
}

function writeSkip(address: string, skipped: boolean) {
  let bag: Record<string, boolean> = {};
  try {
    bag = JSON.parse(localStorage.getItem(SKIP_KEY) || '{}') as Record<string, boolean>;
  } catch {
    bag = {};
  }
  if (skipped) bag[address.toLowerCase()] = true;
  else delete bag[address.toLowerCase()];
  localStorage.setItem(SKIP_KEY, JSON.stringify(bag));
}

function readPrimary(): SavedWallet | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(WALLET_KEY) || '') as SavedWallet;
    if (!parsed?.address || (parsed.kind !== 'google' && parsed.kind !== 'passkey')) return null;
    return parsed;
  } catch {
    return null;
  }
}

type Sdk = {
  getDeviceId: () => Promise<string>;
  updateConfigs: (config: unknown) => void;
  performLogin: (provider: 'Google') => Promise<void>;
  setAuthentication: (auth: Login) => void;
  execute: (challengeId: string, cb: (error: unknown, result?: CircleResult) => void) => void;
};

type CircleResult = {
  data?: { signature?: string; txHash?: string };
};

function circleSignature(result?: CircleResult) {
  const raw = result?.data?.signature?.trim() ?? '';
  if (!raw) return '';
  return raw.startsWith('0x') ? raw : `0x${raw}`;
}

function circleTxHash(result?: CircleResult) {
  return result?.data?.txHash || result?.data?.signature || '';
}

export type Draft = {
  kind: Kind;
  amount: number;
  who: string;
  note?: string;
  due?: string;
  potId?: string;
  shares?: { who: string; amount: number }[];
};

type Session = {
  booting: boolean;
  handle: string;
  address: string;
  email: string;
  walletKind: WalletKind | '';
  balance: bigint | null;
  gasHint: string;
  friends: Friend[];
  draft: Draft | null;
  openDraft: (draft: Draft) => void;
  closeDraft: () => void;
  signIn: (provider: 'Google') => Promise<void>;
  googleStatus: 'idle' | 'waiting' | 'signing';
  cancelGoogle: () => void;
  createPasskey: (name: string) => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  passkeyStatus: 'idle' | 'waiting' | 'signing';
  cancelPasskey: () => void;
  finishHandle: (handle: string) => Promise<void>;
  claimLater: boolean;
  skipClaim: () => void;
  reopenClaim: () => void;
  saveFriend: (handle: string, address?: string) => void;
  removeFriend: (handle: string) => void;
  confirmDraft: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  signOut: () => void;
  balanceError: string;
  signedIn: boolean;
};

const Ctx = createContext<Session | null>(null);

const APP_ID = import.meta.env.VITE_CIRCLE_APP_ID || '';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function socialConfigs(deviceToken: string, deviceEncryptionKey: string) {
  return {
    deviceToken,
    deviceEncryptionKey,
    ...(GOOGLE_CLIENT_ID
      ? { google: { clientId: GOOGLE_CLIENT_ID, redirectUri: window.location.origin, selectAccountPrompt: true } }
      : {}),
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

type DeviceCreds = { deviceToken: string; deviceEncryptionKey: string };

let deviceTokenInflight: Promise<DeviceCreds> | null = null;

function readDeviceToken(): DeviceCreds | null {
  const deviceToken = localStorage.getItem('dg.deviceToken') || '';
  const deviceEncryptionKey = localStorage.getItem('dg.deviceEncryptionKey') || '';
  if (!deviceToken || !deviceEncryptionKey) return null;
  return { deviceToken, deviceEncryptionKey };
}

function requestDeviceToken(deviceId: string) {
  if (!deviceTokenInflight) {
    localStorage.removeItem('dg.deviceToken');
    localStorage.removeItem('dg.deviceEncryptionKey');
    deviceTokenInflight = post<DeviceCreds>('/api/wallet/device-token', { deviceId })
      .then((data) => {
        localStorage.setItem('dg.deviceToken', data.deviceToken);
        localStorage.setItem('dg.deviceEncryptionKey', data.deviceEncryptionKey);
        return data;
      })
      .finally(() => {
        deviceTokenInflight = null;
      });
  }
  return deviceTokenInflight;
}

function payLink(who: string, amount: number) {
  const url = new URL('/send', window.location.origin);
  url.searchParams.set('kind', 'send');
  url.searchParams.set('who', who.replace(/^@/, ''));
  url.searchParams.set('amount', amount.toFixed(2));
  return url.toString();
}

function spendCapMessage(who: string, amount: number) {
  const clean = who.replace(/^@/, '').toLowerCase();
  let limits: { who: string; cap: string; days: string }[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem('dg.limits') || '[]') as { who: string; cap: string; days: string }[];
    limits = Array.isArray(parsed) ? parsed : [];
  } catch {
    return '';
  }
  const limit = limits.find((row) => row.who === clean);
  if (!limit) return '';
  const cap = Number(limit.cap);
  const days = Number(limit.days);
  if (!cap || !days) return '';
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const spent = readLedger().activity
    .filter((row) => row.who.replace(/^@/, '').toLowerCase() === clean && row.direction === 'out' && row.status === 'confirmed' && row.at >= since)
    .reduce((sum, row) => sum + row.amount, 0);
  if (spent + amount > cap) return `@${clean} is limited to $${cap.toFixed(2)} over ${days} days. $${spent.toFixed(2)} is already sent.`;
  return '';
}

function errorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  const details = raw.match(/Details:\s*([\s\S]*?)(?:\s*Version:|$)/i);
  const message = (details?.[1] || raw).replace(/\s+/g, ' ').trim();
  if (!message || /unknown RPC error|viem@/i.test(message)) return fallback;
  return message;
}

function explainLoginError(error: unknown) {
  const message = errorMessage(error, 'Sign-in did not finish.');
  if (/invalid credentials/i.test(message)) {
    return `Google rejected this sign-in. In Circle, Social Logins must use the same Google client id as this app. In Google Cloud, the redirect URI must be exactly ${window.location.origin}.`;
  }
  if (/Failed to validate the idToken/i.test(message)) {
    return 'Google sign-in did not match this session. Tap Continue with Google and try again.';
  }
  return message;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const toasts = useToasts();
  const toastRef = useRef(toasts);
  toastRef.current = toasts;
  const sdkRef = useRef<Sdk | null>(null);
  const initError = useRef('');
  const tokenRetry = useRef(false);
  const passkeyRef = useRef<PasskeyWallet | null>(null);
  const signedOut = useRef(false);
  const [login, setLogin] = useState<Login | null>(null);
  const [passkeyOn, setPasskeyOn] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(() => {
    const saved = readPrimary();
    return saved ? { id: saved.id, address: saved.address } : null;
  });
  const [walletKind, setWalletKind] = useState<WalletKind | ''>(() => readPrimary()?.kind ?? '');
  const [handle, setHandle] = useState(() => readLedger().handle);
  const [claimLater, setClaimLater] = useState(() => {
    const saved = readPrimary();
    return saved?.address ? readSkip(saved.address) : false;
  });
  const [friends, setFriends] = useState<Friend[]>(() => readLedger().friends);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [gasHint, setGasHint] = useState('~$0.001');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [booting, setBooting] = useState(true);
  const [passkeyStatus, setPasskeyStatus] = useState<'idle' | 'waiting' | 'signing'>(() => (readPasskeyPending() ? 'waiting' : 'idle'));
  const [googleStatus, setGoogleStatus] = useState<'idle' | 'waiting' | 'signing'>(() => {
    if (window.location.hash.includes('id_token=')) return 'signing';
    return readGooglePending() ? 'waiting' : 'idle';
  });

  const adoptWallet = useCallback((next: SavedWallet) => {
    const current = readPrimary();
    const same = current?.address.toLowerCase() === next.address.toLowerCase();
    if (current && !same && current.kind !== next.kind) {
      toastRef.current.push({
        kind: 'error',
        message: 'Google and a passkey are different wallets. Sign out to switch.',
      });
      if (current.kind !== 'passkey') passkeyRef.current = null;
      setWallet({ id: current.id, address: current.address });
      setWalletKind(current.kind);
      return current;
    }
    localStorage.setItem(WALLET_KEY, JSON.stringify(next));
    if (!same) {
      forgetHandle();
      setHandle('');
    }
    if (next.kind !== 'passkey') passkeyRef.current = null;
    setWallet({ id: next.id, address: next.address });
    setWalletKind(next.kind);
    return next;
  }, []);

  const client = useMemo(
    () => createPublicClient({ chain: arcChain(), transport: http(arcRpcUrl()) }),
    [],
  );

  const refreshBalance = useCallback(async () => {
    if (!wallet?.address || !isAddress(wallet.address)) return;
    try {
      const raw = await client.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet.address as `0x${string}`],
      });
      setBalance(raw);
      setBalanceError('');
    } catch {
      setBalanceError('Could not reach Arc.');
    }
  }, [client, wallet?.address]);

  useEffect(() => {
    prepareCirclePage();
    let gone = false;
    (async () => {
      try {
        const mod = await import('@circle-fin/w3s-pw-web-sdk');
        const onLogin = async (error: unknown, result: unknown) => {
          if (error) {
            setGoogleStatus('idle');
            clearCircleOAuth();
            clearGooglePending();
            if (window.location.hash.includes('id_token')) {
              history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            const message = explainLoginError(error);
            if (/device token is invalid/i.test(message) && !tokenRetry.current && sdkRef.current) {
              tokenRetry.current = true;
              try {
                const id = localStorage.getItem('dg.deviceId') || (await sdkRef.current.getDeviceId());
                const creds = await requestDeviceToken(id);
                sdkRef.current.updateConfigs({
                  appSettings: { appId: APP_ID },
                  loginConfigs: socialConfigs(creds.deviceToken, creds.deviceEncryptionKey),
                });
                const again = await beginGoogleSignIn(sdkRef.current);
                if (again === 'external') setGoogleStatus('waiting');
                return;
              } catch (err) {
                toastRef.current.push({ kind: 'error', message: errorMessage(err, 'Google sign-in did not finish.') });
                return;
              }
            }
            toastRef.current.push({ kind: 'error', message });
            return;
          }
          if (!result || typeof result !== 'object') return;
          const raw = result as Login & { oAuthInfo?: { socialUserInfo?: { email?: string } } };
          if (!raw.userToken || !raw.encryptionKey) return;
          const next: Login = { userToken: raw.userToken, encryptionKey: raw.encryptionKey, email: raw.oAuthInfo?.socialUserInfo?.email };
          setLogin(next);
          sessionStorage.setItem('dg.login', JSON.stringify(next));
        };
        const storedId = localStorage.getItem('dg.deviceId') || '';
        const cached = readDeviceToken();
        const sdk = new mod.W3SSdk(
          storedId && cached
            ? { appSettings: { appId: APP_ID }, loginConfigs: socialConfigs(cached.deviceToken, cached.deviceEncryptionKey) }
            : { appSettings: { appId: APP_ID } },
          onLogin,
        ) as unknown as Sdk;
        sdkRef.current = sdk;
        const id = storedId || (await sdk.getDeviceId());
        if (!storedId) localStorage.setItem('dg.deviceId', id);
        if (!cached) {
          const creds = await requestDeviceToken(id);
          sdk.updateConfigs({
            appSettings: { appId: APP_ID },
            loginConfigs: socialConfigs(creds.deviceToken, creds.deviceEncryptionKey),
          });
        }
        const saved = sessionStorage.getItem('dg.login');
        if (saved && !gone) setLogin(JSON.parse(saved) as Login);
      } catch (err) {
        initError.current = err instanceof Error ? err.message : 'Sign-in could not start.';
      } finally {
        if (!gone) setBooting(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    if (!login?.userToken) return;
    void (async () => {
      try {
        const data = await post<{ wallets?: Wallet[]; challengeId?: string; code?: number }>('/api/wallet/initialize', {
          userToken: login.userToken,
        });
        const opened = (row?: { wallets?: Wallet[] }) => {
          const wallet = row?.wallets?.find((item) => item.address);
          if (!wallet) return false;
          adoptWallet({ kind: 'google', id: wallet.id, address: wallet.address });
          return true;
        };
        if (opened(data)) return;
        if (!data.challengeId) return;
        sdkRef.current?.setAuthentication(login);
        sdkRef.current?.execute(data.challengeId, (error) => {
          if (error) {
            toastRef.current.push({ kind: 'error', message: 'Wallet setup did not finish. Try again.' });
            return;
          }
          void post<{ wallets?: Wallet[] }>('/api/wallet/initialize', { userToken: login.userToken })
            .then((again) => {
              if (!opened(again)) toastRef.current.push({ kind: 'error', message: 'Wallet setup did not finish. Try again.' });
            })
            .catch((err: unknown) => {
              toastRef.current.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not open your wallet.' });
            });
        });
      } catch (err) {
        toastRef.current.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not open your wallet.' });
      }
    })();
  }, [adoptWallet, login]);

  useEffect(() => {
    const primary = readPrimary();
    if (primary?.kind === 'google') return;
    if (login && primary?.kind !== 'passkey') return;
    let gone = false;
    void restorePasskey()
      .then((opened) => {
        if (gone || signedOut.current || !opened) return;
        const chosen = adoptWallet({ kind: 'passkey', id: 'passkey', address: opened.address });
        if (chosen.kind === 'passkey') passkeyRef.current = opened;
        setPasskeyOn(true);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [adoptWallet, login]);

  useEffect(() => {
    void refreshBalance();
    const id = window.setInterval(() => void refreshBalance(), 20_000);
    return () => window.clearInterval(id);
  }, [refreshBalance]);

  useEffect(() => {
    void (async () => {
      try {
        const fees = await client.estimateFeesPerGas();
        const max = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
        setGasHint(formatGas(max * 65000n));
      } catch {
        setGasHint('~$0.001');
      }
    })();
  }, [client]);

  const adoptPasskey = useCallback((opened: PasskeyWallet) => {
    signedOut.current = false;
    const chosen = adoptWallet({ kind: 'passkey', id: 'passkey', address: opened.address });
    if (chosen.kind === 'passkey') passkeyRef.current = opened;
    setPasskeyOn(true);
  }, [adoptWallet]);

  const signOut = useCallback(() => {
    signedOut.current = true;
    sessionStorage.removeItem('dg.login');
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem('dg.passkey');
    localStorage.removeItem('dg.passkeyName');
    clearPasskeyPending();
    setPasskeyStatus('idle');
    forgetHandle();
    clearGooglePending();
    clearCircleOAuth();
    setGoogleStatus('idle');
    passkeyRef.current = null;
    setLogin(null);
    setPasskeyOn(false);
    setWallet(null);
    setWalletKind('');
    setHandle('');
    setClaimLater(false);
    setBalance(null);
    setBalanceError('');
    setDraft(null);
  }, []);

  const signIn = useCallback(async (provider: 'Google') => {
    signedOut.current = false;
    if (provider === 'Google' && !GOOGLE_CLIENT_ID) {
      toastRef.current.push({
        kind: 'error',
        message: 'Add the Google client id in Circle Social Logins, then set VITE_GOOGLE_CLIENT_ID.',
      });
      return;
    }
    if (!sdkRef.current) {
      toastRef.current.push({
        kind: 'error',
        message: initError.current || 'Sign-in is still starting. Try again in a moment.',
      });
      return;
    }
    const sdk = sdkRef.current;
    try {
      prepareCirclePage();
      const id = localStorage.getItem('dg.deviceId') || (await sdk.getDeviceId());
      localStorage.setItem('dg.deviceId', id);
      const creds = await requestDeviceToken(id);
      sdk.updateConfigs({
        appSettings: { appId: APP_ID },
        loginConfigs: socialConfigs(creds.deviceToken, creds.deviceEncryptionKey),
      });
      const mode = await beginGoogleSignIn(sdk);
      if (mode === 'external') setGoogleStatus('waiting');
    } catch (err) {
      clearGooglePending();
      toastRef.current.push({ kind: 'error', message: explainLoginError(err) });
    }
  }, []);

  const createPasskeyAccount = useCallback(async (name: string) => {
    const clean = name.trim();
    if (!clean) {
      toastRef.current.push({ kind: 'error', message: 'Name the passkey first.' });
      return;
    }
    try {
      if (inTelegram()) {
        beginExternalPasskey('create', clean);
        setPasskeyStatus('waiting');
        return;
      }
      adoptPasskey(await createPasskey(clean));
    } catch (err) {
      toastRef.current.push({ kind: 'error', message: explainPasskeyError(err) });
    }
  }, [adoptPasskey]);

  const cancelPasskey = useCallback(() => {
    clearPasskeyPending();
    setPasskeyStatus('idle');
  }, []);

  useEffect(() => {
    if (passkeyStatus !== 'waiting') return;
    const pending = readPasskeyPending();
    if (!pending) {
      setPasskeyStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    void waitForPasskey(pending.state, ctrl.signal).then(async (result) => {
      if (ctrl.signal.aborted || result === 'aborted') return;
      if (result === 'timeout') {
        clearPasskeyPending();
        setPasskeyStatus('idle');
        toastRef.current.push({ kind: 'error', message: 'Passkey setup timed out. Try again.' });
        return;
      }
      try {
        setPasskeyStatus('signing');
        adoptPasskey(await openHandedPasskey(result.credential, result.name || pending.name));
        clearPasskeyPending();
        setPasskeyStatus('idle');
      } catch (err) {
        clearPasskeyPending();
        setPasskeyStatus('idle');
        toastRef.current.push({ kind: 'error', message: explainPasskeyError(err) });
      }
    });
    return () => ctrl.abort();
  }, [adoptPasskey, passkeyStatus]);

  const cancelGoogle = useCallback(() => {
    clearGooglePending();
    clearCircleOAuth();
    setGoogleStatus('idle');
  }, []);

  useEffect(() => {
    if (googleStatus !== 'waiting') return;
    const pending = readGooglePending();
    if (!pending) {
      setGoogleStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    void waitForGoogleLogin(pending.state, ctrl.signal).then((result) => {
      if (ctrl.signal.aborted) return;
      if (result === 'aborted') return;
      if (result === 'timeout') {
        clearGooglePending();
        setGoogleStatus('idle');
        toastRef.current.push({ kind: 'error', message: 'Google sign-in timed out. Try again.' });
        return;
      }
      const creds = readDeviceToken();
      if (!creds || !sdkRef.current) {
        clearCircleOAuth();
        setGoogleStatus('idle');
        toastRef.current.push({ kind: 'error', message: 'Sign-in is still starting. Try Google again.' });
        return;
      }
      rememberGoogleReturn(result, pending.state, pending.nonce);
      setGoogleStatus('signing');
      sdkRef.current.updateConfigs({
        appSettings: { appId: APP_ID },
        loginConfigs: socialConfigs(creds.deviceToken, creds.deviceEncryptionKey),
      });
    });
    return () => ctrl.abort();
  }, [googleStatus]);

  const signInWithPasskey = useCallback(async () => {
    try {
      if (inTelegram()) {
        beginExternalPasskey('signin', '');
        setPasskeyStatus('waiting');
        return;
      }
      adoptPasskey(await signInPasskey());
    } catch (err) {
      toastRef.current.push({ kind: 'error', message: explainPasskeyError(err) });
    }
  }, [adoptPasskey]);

  useEffect(() => {
    if (!wallet?.address || !isAddress(wallet.address)) return;
    let gone = false;
    void fetch(`/api/registry?address=${encodeURIComponent(wallet.address)}`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { handle?: string };
        if (gone) return;
        setHandle(data.handle ? claimHandle(data.handle) : '');
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [wallet?.address]);

  const finishHandle = useCallback(async (next: string) => {
    const clean = next.replace(/^@/, '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      toastRef.current.push({ kind: 'error', message: 'Use 3 to 20 letters, numbers, or underscores.' });
      return;
    }
    if (!wallet?.address) {
      toastRef.current.push({ kind: 'error', message: 'Sign in before claiming a name.' });
      return;
    }
    try {
      if (walletKind === 'passkey') {
        if (!passkeyRef.current) throw new Error('Sign in with your passkey to claim this name.');
        await passkeyRef.current.claimName(clean);
      } else {
        if (!login || walletKind !== 'google') throw new Error('Sign in with Google to claim this name.');
        const started = await post<{ challengeId?: string }>('/api/names/sign', {
          userToken: login.userToken,
          walletId: wallet.id,
          address: wallet.address,
          name: clean,
        });
        if (!started.challengeId || !sdkRef.current) throw new Error('Google could not start the signature.');
        sdkRef.current.setAuthentication(login);
        const signature = await new Promise<string>((resolve, reject) => {
          sdkRef.current?.execute(started.challengeId!, (error, result) => {
            const signed = circleSignature(result);
            if (error) reject(error instanceof Error ? error : new Error('The signature was not approved.'));
            else if (!signed) reject(new Error('Circle did not return a signature.'));
            else resolve(signed);
          });
        });
        await post('/api/names/claim', { userToken: login.userToken, address: wallet.address, name: clean, signature });
      }
      if (wallet.address) writeSkip(wallet.address, false);
      setClaimLater(false);
      setHandle(claimHandle(clean));
      toastRef.current.push({ kind: 'success', message: `@${clean} is on Arc.` });
    } catch (err) {
      toastRef.current.push({ kind: 'error', message: err instanceof Error ? err.message : 'The name was not claimed.' });
    }
  }, [login, wallet, walletKind]);

  const skipClaim = useCallback(() => {
    if (wallet?.address) writeSkip(wallet.address, true);
    setClaimLater(true);
  }, [wallet?.address]);

  const reopenClaim = useCallback(() => {
    if (wallet?.address) writeSkip(wallet.address, false);
    setClaimLater(false);
  }, [wallet?.address]);

  useEffect(() => {
    setClaimLater(wallet?.address ? readSkip(wallet.address) : false);
  }, [wallet?.address]);

  const saveFriend = useCallback((next: string, address?: string) => {
    setFriends(addFriend(next, address));
  }, []);

  const dropFriend = useCallback((next: string) => {
    setFriends(removeFriend(next));
  }, []);

  const confirmDraft = useCallback(async () => {
    if (!draft) return;
    const asks = draft.kind === 'request' || draft.kind === 'split';
    const targets = (draft.shares?.length ? draft.shares : [{ who: draft.who, amount: draft.amount }])
      .map((row) => ({ who: row.who.replace(/^@/, '').toLowerCase(), amount: row.amount }))
      .filter((row) => row.who && row.amount > 0);
    if (targets.length === 0) return;
    for (const target of targets) {
      if (asks) continue;
      const blocked = spendCapMessage(target.who, target.amount);
      if (blocked) {
        toastRef.current.push({ kind: 'error', message: blocked });
        return;
      }
    }
    if (asks && !handle) {
      toastRef.current.push({ kind: 'error', message: 'Claim a name before you request.' });
      return;
    }
    const label = targets.length === 1 ? `@${targets[0].who}` : `${targets.length} people`;
    const toastId = toastRef.current.push({
      kind: 'pending',
      message: asks ? `Requesting $${draft.amount.toFixed(2)} from ${label}` : `Sending $${draft.amount.toFixed(2)} to ${label}`,
    });
    setDraft(null);
    try {
      if (!wallet) throw new Error('Sign in before paying.');
      const payFromWallet = async (destination: `0x${string}`, amount: number) => {
        if (walletKind === 'passkey') {
          if (!passkeyRef.current) throw new Error('Sign in with your passkey to pay from this wallet.');
          return passkeyRef.current.sendUsdc(destination, amount);
        }
        if (!login || walletKind !== 'google') throw new Error('Sign in with Google to pay from this wallet.');
        const created = await post<{ challengeId: string }>('/api/wallet/transfer', {
          userToken: login.userToken,
          walletId: wallet.id,
          destinationAddress: destination,
          amount: amount.toFixed(2),
        });
        sdkRef.current?.setAuthentication(login);
        return await new Promise<string>((resolve, reject) => {
          sdkRef.current?.execute(created.challengeId, (error, result) => {
            if (error) reject(error instanceof Error ? error : new Error('Payment was not approved'));
            else resolve(circleTxHash(result));
          });
        });
      };
      if (asks) {
        const links = targets.map((target) => {
          pushActivity({
            kind: draft.kind,
            title: draft.kind === 'split' ? `Split with @${target.who}` : `Request from @${target.who}`,
            amount: target.amount,
            who: target.who,
            direction: 'in',
            status: 'confirmed',
            due: draft.due,
          });
          return `@${target.who} ${payLink(handle, target.amount)}`;
        });
        toastRef.current.update(toastId, {
          kind: 'success',
          message: `Ask ${label} with this link.`,
          action: {
            label: 'Copy link',
            onClick: () => void navigator.clipboard.writeText(links.join('\n')),
          },
        });
        return;
      }
      let lastHash = '';
      for (const target of targets) {
        const id = pushActivity({
          kind: draft.kind,
          title: `${draft.kind} to @${target.who}`,
          amount: target.amount,
          who: target.who,
          direction: 'out',
          status: 'pending',
          due: draft.due,
        }).id;
        const lookup = await fetch(`/api/registry?handle=${encodeURIComponent(target.who)}`).then((r) => r.json()) as { address?: string };
        if (!lookup.address || !isAddress(lookup.address)) throw new Error(`@${target.who} has not claimed a wallet yet.`);
        if (lookup.address.toLowerCase() === wallet.address.toLowerCase()) throw new Error('That wallet is yours.');
        const hash = await payFromWallet(lookup.address, target.amount);
        lastHash = hash;
        patchActivity(id, { status: 'confirmed', txHash: hash });
      }
      if (draft.kind === 'collect' && draft.potId) {
        window.dispatchEvent(new CustomEvent('dg-pot', { detail: { potId: draft.potId, amount: draft.amount } }));
      }
      toastRef.current.update(toastId, {
        kind: 'success',
        message: `Sent $${draft.amount.toFixed(2)} to ${label}`,
        action: lastHash
          ? { label: 'Receipt', onClick: () => window.open(explorerTx(lastHash), '_blank', 'noopener') }
          : { label: 'Activity', onClick: () => window.location.assign('/activity') },
      });
      await refreshBalance();
    } catch (err) {
      toastRef.current.update(toastId, {
        kind: 'error',
        message: err instanceof Error ? err.message : 'Payment did not go through.',
        action: { label: 'Add USDC', onClick: () => window.location.assign('/me') },
      });
    }
  }, [draft, handle, login, refreshBalance, wallet, walletKind]);

  const value: Session = {
    booting,
    handle,
    address: wallet?.address ?? '',
    email: login?.email ?? '',
    walletKind,
    balance,
    gasHint,
    friends,
    draft,
    openDraft: setDraft,
    closeDraft: () => setDraft(null),
    signIn,
    googleStatus,
    cancelGoogle,
    createPasskey: createPasskeyAccount,
    signInWithPasskey,
    passkeyStatus,
    cancelPasskey,
    finishHandle,
    claimLater,
    skipClaim,
    reopenClaim,
    saveFriend,
    removeFriend: dropFriend,
    confirmDraft,
    refreshBalance,
    signOut,
    balanceError,
    signedIn: Boolean(login) || passkeyOn,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('SessionProvider missing');
  return ctx;
}

export function balanceLabel(raw: bigint | null) {
  if (raw === null) return '—';
  return formatUsd(raw);
}
