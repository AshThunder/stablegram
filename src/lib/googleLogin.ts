import { inTelegram, telegram, telegramUserId } from '@/lib/telegram';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const PENDING_KEY = 'dg.googlePending';

type Pending = { state: string; nonce: string; expires: number };

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function googleOAuthUrl(state: string, nonce: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin,
    scope: 'openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    state,
    response_type: 'id_token token',
    nonce,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function prepareCirclePage() {
  if (window.location.hash.includes('id_token=')) return;
  localStorage.removeItem('socialLoginProvider');
  localStorage.removeItem('state');
  localStorage.removeItem('nonce');
  if (window.location.hash.includes('tgWebApp')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export function clearCircleOAuth() {
  localStorage.removeItem('socialLoginProvider');
  localStorage.removeItem('state');
  localStorage.removeItem('nonce');
}

export function readGooglePending(): Pending | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || '') as Pending;
    if (!parsed?.state || !parsed.nonce || parsed.expires < Date.now()) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearGooglePending() {
  localStorage.removeItem(PENDING_KEY);
}

export function rememberGoogleReturn(idToken: string, state: string, nonce: string) {
  localStorage.setItem('socialLoginProvider', 'Google');
  localStorage.setItem('state', state);
  localStorage.setItem('nonce', nonce);
  localStorage.removeItem(PENDING_KEY);
  const hash = `#id_token=${encodeURIComponent(idToken)}&state=${encodeURIComponent(state)}`;
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(true), ms);
    const stop = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    if (signal.aborted) {
      stop();
      return;
    }
    signal.addEventListener('abort', stop, { once: true });
  });
}

export async function waitForGoogleLogin(state: string, signal: AbortSignal) {
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal.aborted) return 'aborted' as const;
    try {
      const res = await fetch('/api/auth/google-return', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
        signal,
      });
      const data = (await res.json().catch(() => ({}))) as { idToken?: string };
      if (typeof data.idToken === 'string' && data.idToken.split('.').length === 3) return data.idToken;
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return 'aborted' as const;
    }
    const keep = await delay(1200, signal);
    if (!keep) return 'aborted' as const;
  }
  return 'timeout' as const;
}

export async function beginGoogleSignIn(sdk: { performLogin: (provider: 'Google') => Promise<void> } | null) {
  const tg = telegram();
  if (inTelegram()) {
    const chatId = telegramUserId();
    if (!tg?.openLink || !chatId || !CLIENT_ID) {
      throw new Error('Open Stablegram from the bot menu, then try Google again.');
    }
    const state = `${uuid()}.${chatId}`;
    const nonce = uuid();
    const pending: Pending = { state, nonce, expires: Date.now() + 3 * 60 * 1000 };
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    clearCircleOAuth();
    tg.openLink(googleOAuthUrl(state, nonce));
    return 'external' as const;
  }
  if (!sdk) throw new Error('Sign-in is still starting. Try again in a moment.');
  await sdk.performLogin('Google');
  return 'inline' as const;
}
