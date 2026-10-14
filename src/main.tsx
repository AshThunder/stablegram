import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthFrame, SignedInReturn, Splash } from './ui/mark';
import { SessionProvider } from './shell/session';
import { ToastProvider } from './shell/toasts';
import { prepareCirclePage } from './lib/googleLogin';
import { createPasskey, explainPasskeyError, readSavedPasskey, signInPasskey } from './lib/passkey';
import { telegram } from './lib/telegram';
import { Spinner } from './ui/spinner';
import './index.css';

type Bridge = { state: string; idToken: string };

function takeExternalGoogleHash(): Bridge | null {
  const hash = window.location.hash;
  if (!hash.includes('id_token=')) return null;
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  if (tg?.initData) return null;
  const params = new URLSearchParams(hash.slice(1));
  const idToken = params.get('id_token') || '';
  const state = params.get('state') || '';
  if (!idToken || !/^[0-9a-f-]{36}\.\d{1,20}$/i.test(state)) return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return { state, idToken };
}

function adoptTelegramQuery() {
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  if (!tg?.initData) return;
  const params = new URLSearchParams(window.location.search);
  const idToken = params.get('id_token');
  const state = params.get('state');
  if (!idToken || !state) return;
  const hash = `#id_token=${encodeURIComponent(idToken)}&state=${encodeURIComponent(state)}`;
  history.replaceState(null, '', `${window.location.pathname}${hash}`);
}

type PasskeyLaunch = { mode: 'create' | 'signin'; state: string; name: string };

function takePasskeyLaunch(): PasskeyLaunch | null {
  const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  if (tg?.initData) return null;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('passkey');
  const state = params.get('state') || '';
  if (mode !== 'create' && mode !== 'signin') return null;
  if (!/^[0-9a-f-]{36}\.\d{1,20}$/i.test(state)) return null;
  return { mode, state, name: params.get('name') || '' };
}

function PasskeyBridge({ mode, state, name }: PasskeyLaunch) {
  const hint = mode === 'create' ? 'Create the passkey in this browser.' : 'Sign in with your passkey in this browser.';
  const [message, setMessage] = useState(hint);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const run = async () => {
    if (busy || done) return;
    setBusy(true);
    setProblem('');
    try {
      if (mode === 'create') await createPasskey(name || 'Stablegram');
      else await signInPasskey();
      const credential = readSavedPasskey();
      const savedName = localStorage.getItem('dg.passkeyName') || name;
      if (!credential) throw new Error('Passkey did not finish.');
      const response = await fetch('/api/auth/passkey-return', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state, credential, name: savedName }),
      });
      if (!response.ok) throw new Error('Could not hand the passkey back to Telegram.');
      setDone(true);
      setMessage('You\'re signed in');
    } catch (err) {
      setProblem(explainPasskeyError(err));
    } finally {
      setBusy(false);
    }
  };
  if (done) return <SignedInReturn />;
  return (
    <AuthFrame>
      <h2 className="text-headline-sm text-on-surface">{message}</h2>
      {problem ? <p className="mt-3 text-body-sm text-error" role="alert">{problem}</p> : null}
      <button className="mt-5 w-full rounded-full bg-logo py-4 font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void run()} type="button">
        {busy ? 'Waiting for the passkey…' : mode === 'create' ? 'Create passkey' : 'Sign in with passkey'}
      </button>
    </AuthFrame>
  );
}

const passkeyLaunch = takePasskeyLaunch();
const googleBridge = takeExternalGoogleHash();
adoptTelegramQuery();
prepareCirclePage();

function GoogleBridge({ state, idToken }: Bridge) {
  const [message, setMessage] = useState('Confirming Google…');
  const [done, setDone] = useState(false);
  useEffect(() => {
    void fetch('/api/auth/google-return', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state, idToken }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setDone(response.ok);
        setMessage(response.ok ? '' : data.error || 'Could not confirm Google.');
      })
      .catch(() => setMessage('Could not confirm Google.'));
  }, [idToken, state]);
  if (done) return <SignedInReturn />;
  const waiting = message === 'Confirming Google…';
  return (
    <AuthFrame>
      <div className="flex flex-1 flex-col items-center pt-8 text-center">
        {waiting ? <Spinner label="Confirming Google" /> : null}
        <p className={`mt-6 text-body-md ${waiting ? 'text-on-surface' : 'text-error'}`} role={waiting ? undefined : 'alert'}>{message}</p>
      </div>
    </AuthFrame>
  );
}

function Boot() {
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const tg = telegram();
    tg?.ready();
    tg?.expand();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setSplash(false), reduce ? 700 : 1800);
    return () => window.clearTimeout(t);
  }, []);

  if (splash) return <Splash />;

  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {passkeyLaunch ? <PasskeyBridge mode={passkeyLaunch.mode} state={passkeyLaunch.state} name={passkeyLaunch.name} /> : googleBridge ? <GoogleBridge state={googleBridge.state} idToken={googleBridge.idToken} /> : <Boot />}
  </StrictMode>,
);
