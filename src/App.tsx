import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { type ReactNode, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { balanceLabel, useSession, type Draft } from '@/shell/session';
import { ToastStack, useToasts } from '@/shell/toasts';
import { readLedger, type ActivityItem, type Kind } from '@/lib/ledger';
import { useChainActivity } from '@/lib/chainActivity';
import { parseIntent } from '@/lib/parse';
import { explorerAddress, VAULTS } from '@/lib/arc';
import { AuthFrame, Avatar, Brand, GoogleMark, Icon, Splash } from '@/ui/mark';
import { Spinner } from '@/ui/spinner';
import { telegram } from '@/lib/telegram';

const SERVICES: { label: string; kind: Kind; icon: string }[] = [
  { label: 'Send', kind: 'send', icon: 'send' },
  { label: 'Request', kind: 'request', icon: 'request_quote' },
  { label: 'Split', kind: 'split', icon: 'call_split' },
  { label: 'Tip', kind: 'tip', icon: 'volunteer_activism' },
  { label: 'Collect', kind: 'collect', icon: 'group_add' },
  { label: 'Loans', kind: 'tab', icon: 'handshake' },
  { label: 'Circles', kind: 'circle', icon: 'donut_large' },
];

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function isoToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function prettyDay(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const CADENCE = [
  { days: 7, label: 'Weekly' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
];

function namesOf(value: string) {
  return [...new Set(value.split(/[\s,]+/).map((part) => part.replace(/^@/, '').trim().toLowerCase()).filter(Boolean))];
}

function sharePage(url: string, title: string) {
  const tg = telegram() as { openTelegramLink?: (link: string) => void } | null;
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(link);
  else window.open(link, '_blank', 'noopener');
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function Shell({ children, tabs = true, footer, overlay }: { children: ReactNode; tabs?: boolean; footer?: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div className={`min-h-0 flex-1 overflow-y-auto scroll-touch ${tabs ? '' : 'pb-safe'}`}>{children}</div>
      {footer}
      {tabs && <TabBar />}
      {overlay}
    </div>
  );
}

function TabBar() {
  const tabs = [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/chat', label: 'Chat', icon: 'chat_bubble', end: false },
    { to: '/activity', label: 'Activity', icon: 'swap_horiz', end: false },
    { to: '/me', label: 'Me', icon: 'person', end: false },
  ];
  return (
    <nav className="flex shrink-0 items-center justify-around border-t border-surface-variant bg-surface-container-lowest px-4 py-2 pb-safe">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            isActive
              ? 'flex min-h-12 min-w-16 flex-col items-center justify-center rounded-xl bg-primary-fixed px-3 py-1 text-primary'
              : 'flex min-h-12 min-w-16 flex-col items-center justify-center rounded-xl px-3 py-1 text-on-surface-variant'
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={tab.icon} className="text-[24px]" filled={isActive} />
              <span className="mt-1 text-[11px] font-medium">{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function PageHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-variant bg-background px-container-padding py-2">
      {onBack ? (
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface" aria-label="Back">
          <Icon name="arrow_back" className="text-[22px]" />
        </button>
      ) : (
        <span className="h-11 w-11" />
      )}
      <div className="flex-1 text-center">
        <h1 className="text-headline-sm font-semibold text-primary">{title}</h1>
        {subtitle && <p className="text-[11px] font-medium text-on-surface-variant">{subtitle}</p>}
      </div>
      <span className="h-11 w-11" />
    </header>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <input
        className="w-full rounded-[16px] border border-surface-variant bg-surface-container-lowest px-4 py-3 text-body-md outline-none placeholder:text-outline-variant focus:border-primary-container focus:ring-1 focus:ring-primary-container"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function othersOf(friends: { handle: string }[], handle: string) {
  const me = handle.replace(/^@/, '').toLowerCase();
  return friends.filter((f) => f.handle.replace(/^@/, '').toLowerCase() !== me);
}

function EmptyState({ icon, title, body, cta, onCta }: { icon: string; title: string; body: string; cta: string; onCta: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-[24px] border border-dashed border-surface-variant bg-surface-container-lowest px-6 py-10 text-center soft-shadow">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-fixed text-primary">
        <Icon name={icon} className="text-[28px]" filled />
      </div>
      <p className="text-headline-sm font-semibold text-on-surface">{title}</p>
      <p className="mt-2 max-w-[260px] text-body-sm text-on-surface-variant">{body}</p>
      <button type="button" onClick={onCta} className="mt-5 rounded-full bg-cta px-5 py-2.5 text-label-md font-semibold text-on-primary active:scale-[0.98]">
        {cta}
      </button>
    </div>
  );
}

function Primary({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center justify-center rounded-full bg-cta py-4 text-headline-sm font-semibold text-on-primary active:scale-[0.98]" type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function Confirm() {
  const { draft, closeDraft, confirmDraft, balance, gasHint, balanceError } = useSession();
  if (!draft) return null;
  const now = balance === null ? 0 : Number(balance) / 1e6;
  const people = draft.shares?.length ? draft.shares : [{ who: draft.who, amount: draft.amount }];
  const outgoing = draft.kind !== 'request' && draft.kind !== 'split';
  const total = people.reduce((sum, row) => sum + row.amount, 0);
  const after = outgoing ? now - total : now;
  const who = people.length === 1 ? people[0].who.replace(/^@/, '') : `${people.length} people`;
  const title = draft.kind === 'tab' ? 'Loan' : draft.kind[0].toUpperCase() + draft.kind.slice(1);
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-on-surface/50">
      <div className="w-full rounded-t-[28px] border border-surface-variant bg-surface-container-lowest px-5 pb-6 pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant/60" />
        <p className="text-center text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{title}</p>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={who} className="h-12 w-12" />
          <p className="text-headline-sm font-semibold text-primary">@{who}</p>
        </div>
        <div className="mt-4 rounded-[24px] border border-primary bg-primary p-5 text-on-primary soft-shadow">
          <p className="text-[11px] font-medium uppercase tracking-wider text-primary-fixed">{outgoing ? "You'll pay" : "You'll request"}</p>
          <p className="text-[40px] font-bold leading-[48px] tracking-tight">{money(total)}</p>
          {draft.note && <p className="mt-1 text-body-sm text-primary-fixed">{draft.note}</p>}
          {draft.due && <p className="mt-1 text-body-sm text-primary-fixed">Due {prettyDay(draft.due)}</p>}
          {people.length > 1 && (
            <ul className="mt-2 space-y-1 text-body-sm text-primary-fixed">
              {people.map((row) => <li key={row.who}>@{row.who.replace(/^@/, '')} · {money(row.amount)}</li>)}
            </ul>
          )}
        </div>
        <dl className="mt-4 space-y-2 text-body-sm">
          <div className="flex justify-between"><dt className="text-on-surface-variant">Network fee (USDC)</dt><dd>{gasHint}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">New balance</dt><dd className="font-semibold text-tertiary">{balance === null ? '—' : money(Math.max(0, after))}</dd></div>
          {balanceError && <p className="text-body-sm text-error">{balanceError}</p>}
        </dl>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary-fixed px-3 py-3 text-body-sm">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-container-lowest text-primary">
            <Icon name="send" className="text-[18px]" filled />
          </span>
          <span>
            <span className="block font-semibold text-primary">Stays on Arc</span>
            <span className="text-on-surface-variant">Fast. Low fees. USDC is the balance and the fee.</span>
          </span>
        </div>
        <button className="mt-4 w-full rounded-full bg-cta py-4 text-headline-sm font-semibold text-on-primary" onClick={() => void confirmDraft()} type="button">
          {outgoing ? 'Confirm & pay' : 'Send request'}
        </button>
        <button className="mt-2 w-full py-2 text-body-sm font-medium text-on-surface-variant" onClick={closeDraft} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Processing({ title, detail, onCancel }: { title: string; detail: string; onCancel?: () => void }) {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-[390px] flex-col items-center justify-center bg-background px-container-padding text-center" aria-busy="true">
      <Brand subtitle="Sign in to get started" />
      <div className="mt-8">
        <Spinner label={title} />
      </div>
      <p className="mt-6 text-headline-sm text-on-surface">{title}</p>
      <p className="mt-2 max-w-[280px] text-body-md text-on-surface-variant">{detail}</p>
      {onCancel ? (
        <button className="mt-6 text-body-sm font-semibold text-primary" onClick={onCancel} type="button">
          Cancel
        </button>
      ) : null}
      <ToastStack className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col gap-2 px-container-padding" />
    </div>
  );
}

function Login() {
  const { signIn, createPasskey, signInWithPasskey } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'google' | 'passkey' | 'create' | null>(null);
  const run = async (kind: 'google' | 'passkey' | 'create', task: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="relative h-full">
      <AuthFrame>
        <h2 className="text-headline-sm text-on-surface">Sign in</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">Google and a passkey each open their own wallet.</p>
        <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-surface-variant bg-surface-container-lowest py-3.5 text-label-md disabled:opacity-60" aria-busy={busy === 'google'} disabled={busy !== null} onClick={() => void run('google', () => signIn('Google'))} type="button">
          {busy === 'google' ? <Spinner label="Opening Google" small /> : <GoogleMark />}
          {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-surface-variant bg-surface-container-lowest py-3.5 text-label-md disabled:opacity-60" aria-busy={busy === 'passkey'} disabled={busy !== null} onClick={() => void run('passkey', () => signInWithPasskey())} type="button">
          {busy === 'passkey' ? <Spinner label="Signing in" small /> : <Icon name="passkey" className="text-[18px] text-logo" />}
          {busy === 'passkey' ? 'Signing in…' : 'Sign in with a passkey'}
        </button>
        <p className="my-4 text-center text-body-sm text-outline">or create one</p>
        <label className="w-full">
          <span className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">Your name</span>
          <input className="w-full rounded-[16px] border border-surface-variant bg-surface-container-lowest px-4 py-3 outline-none" placeholder="e.g. goldenboy" value={name} onChange={(e) => setName(e.target.value)} disabled={busy !== null} />
        </label>
        <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-logo py-4 font-semibold text-white disabled:opacity-60" aria-busy={busy === 'create'} disabled={busy !== null} onClick={() => void run('create', () => createPasskey(name))} type="button">
          {busy === 'create' ? <Spinner label="Creating passkey" small /> : null}
          {busy === 'create' ? 'Creating passkey…' : 'Create a passkey'}
        </button>
      </AuthFrame>
      <ToastStack className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col gap-2 px-container-padding" />
    </div>
  );
}

function Claim() {
  const { finishHandle, skipClaim, address, walletKind } = useSession();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const clean = handle.replace(/^@/, '').trim().toLowerCase();
  const lengthOk = clean.length >= 3 && clean.length <= 20;
  const charsOk = clean.length > 0 && /^[a-z0-9_]+$/.test(clean);
  const valid = lengthOk && charsOk;
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet opening';
  const walletLabel = walletKind === 'passkey' ? 'Passkey wallet' : walletKind === 'google' ? 'Google wallet' : 'This wallet';

  useEffect(() => {
    const back = telegram()?.BackButton;
    if (!back) return;
    back.show();
    back.onClick(skipClaim);
    return () => {
      back.offClick(skipClaim);
      back.hide();
    };
  }, [skipClaim]);

  useEffect(() => {
    if (!valid) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setAvailability('checking');
      void fetch(`/api/registry?handle=${encodeURIComponent(clean)}`, { signal: ctrl.signal })
        .then(async (response) => (response.ok ? response.json() : {}))
        .then((data: { address?: string }) => setAvailability(data.address ? 'taken' : 'free'))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setAvailability('idle');
        });
    }, 300);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [clean, valid]);

  const shownAvailability = valid ? availability : 'idle';

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[390px] flex-col bg-background">
      <header className="flex items-center justify-between px-container-padding py-3">
        <p className="text-label-sm font-semibold text-primary">Stablegram</p>
        <button type="button" onClick={skipClaim} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface">
          <Icon name="close" className="text-[22px]" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-container-padding pb-6">
        <h1 className="text-headline-md text-primary">Claim your @handle</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">Friends pay this name instead of a long address. It is written on Arc once, and you do not need USDC.</p>
        <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-surface-variant bg-surface-container-lowest px-3 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-fixed text-primary">
            <Icon name="account_balance_wallet" className="text-[20px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-label-md font-semibold text-on-surface">{walletLabel}</span>
            <span className="block truncate font-mono text-[12px] text-on-surface-variant">{short}</span>
          </span>
        </div>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || shownAvailability === 'taken') return;
            setBusy(true);
            void finishHandle(clean).finally(() => setBusy(false));
          }}
        >
          <label htmlFor="claim-handle" className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
            Name
          </label>
          <input
            id="claim-handle"
            name="handle"
            className="w-full rounded-[16px] border border-surface-variant bg-surface-container-lowest px-4 py-3 text-base outline-none focus-visible:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            placeholder="yourname"
            value={handle}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            required
            minLength={3}
            maxLength={20}
            pattern="[A-Za-z0-9_]{3,20}"
            aria-describedby="claim-help"
            aria-invalid={shownAvailability === 'taken'}
            onChange={(event) => {
              setAvailability('idle');
              setHandle(event.target.value);
            }}
          />
          <p id="claim-help" className="mt-2 text-body-sm text-on-surface-variant" aria-live="polite">
            {shownAvailability === 'taken'
              ? `@${clean} is already on Arc.`
              : shownAvailability === 'free'
                ? `@${clean} is free.`
                : shownAvailability === 'checking'
                  ? 'Checking Arc…'
                  : '3 to 20 letters, numbers, or underscores.'}
          </p>
          <ul className="mt-3 space-y-2">
            <Rule ok={lengthOk} label="3 to 20 characters" />
            <Rule ok={charsOk} label="Letters, numbers, and underscores" />
            <Rule ok={shownAvailability === 'free'} label="Not already claimed" />
          </ul>
          <button className="mt-4 w-full rounded-full bg-cta py-4 font-semibold text-on-primary disabled:opacity-60" disabled={busy} type="submit">
            {busy ? 'Claiming…' : 'Claim on Arc'}
          </button>
          <button className="mt-2 w-full py-3 text-body-sm font-medium text-on-surface-variant" type="button" onClick={skipClaim}>
            Not now
          </button>
        </form>
        <ul className="mt-2 space-y-2">
          {[
            { icon: 'alternate_email', title: 'One name for this wallet', body: 'Nobody else can take it, and this address cannot claim a second name.' },
            { icon: 'group', title: 'How friends pay you', body: 'Send, request, and payment links use the name instead of the address.' },
            { icon: 'toll', title: 'No USDC required', body: 'Google signs the claim. A passkey uses the paymaster. Gas is covered.' },
          ].map((item) => (
            <li key={item.title} className="flex items-start gap-3 rounded-[20px] border border-surface-variant bg-surface-container-lowest px-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-fixed text-primary">
                <Icon name={item.icon} className="text-[20px]" />
              </span>
              <span>
                <span className="block text-label-md font-semibold text-on-surface">{item.title}</span>
                <span className="mt-0.5 block text-body-sm text-on-surface-variant">{item.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ToastStack />
    </div>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-body-sm ${ok ? 'text-tertiary' : 'text-on-surface-variant'}`}>
      <Icon name={ok ? 'check_circle' : 'radio_button_unchecked'} className="text-[18px]" filled={ok} />
      {label}
    </li>
  );
}

function openAction(navigate: ReturnType<typeof useNavigate>, kind: Kind) {
  if (kind === 'collect') navigate('/collect');
  else if (kind === 'circle') navigate('/circles');
  else if (kind === 'tab') navigate('/tabs');
  else navigate('/send', { state: { kind } });
}

function dollars(balance: bigint | null) {
  return balance === null ? '—' : balanceLabel(balance);
}

function Home() {
  const { balance, balanceError, refreshBalance, friends, handle, address, reopenClaim } = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ActivityItem[]>(() => readLedger().activity);
  useEffect(() => {
    const sync = () => setRows(readLedger().activity);
    window.addEventListener('dg-ledger', sync);
    return () => window.removeEventListener('dg-ledger', sync);
  }, []);
  const q = query.trim().toLowerCase();
  const services = SERVICES.filter((a) => !q || a.label.toLowerCase().includes(q));
  const people = othersOf(friends, handle).filter((f) => !q || f.handle.includes(q.replace(/^@/, '')));
  const pending = rows.filter((r) => r.status === 'pending');
  const owed = pending.filter((r) => r.direction === 'in');
  const owe = pending.filter((r) => r.direction === 'out' && r.kind === 'request');
  const shown = dollars(balance);
  const letter = (handle.replace(/^@/, '')[0] || 'S').toUpperCase();

  return (
    <Shell>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-variant bg-background px-container-padding py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-variant bg-primary-fixed text-sm font-bold text-primary">{letter}</div>
          <div>
            <span className="block text-body-sm text-on-surface-variant">{greeting()}</span>
            <span className="text-headline-sm font-semibold text-primary">{handle ? `@${handle}` : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Your wallet'}</span>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/activity')} className="relative flex h-11 w-11 items-center justify-center rounded-full text-primary" aria-label="Activity">
          <Icon name="notifications" className="text-[24px]" />
          {pending.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-background bg-error" />}
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-5 px-container-padding pt-4">
        <label className="relative block">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[22px] text-outline" />
          <input className="w-full rounded-xl border border-surface-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-body-sm outline-none placeholder:text-outline-variant focus:border-primary-container" placeholder="Search services & friends" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {!q && (
          <section className="rounded-[24px] border border-primary bg-primary p-5 text-on-primary soft-shadow">
            <span className="text-[11px] font-medium uppercase tracking-wider text-primary-fixed">Total balance</span>
            <p className="text-[40px] font-bold leading-[48px] tracking-tight">${shown}</p>
            <p className="text-[11px] text-primary-fixed">USDC on Arc</p>
            {balanceError && (
              <button type="button" onClick={() => void refreshBalance()} className="mt-1 text-left text-[11px] font-semibold text-primary-fixed">
                {balanceError} Retry
              </button>
            )}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => navigate('/chat')} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-cta py-3 text-[12px] font-bold uppercase tracking-wide text-white active:scale-[0.98]">
                <Icon name="chat" className="text-[18px]" filled /> Open Chat
              </button>
              <button type="button" onClick={() => navigate('/me', { state: { fund: true } })} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/40 bg-primary-container py-3 text-[12px] font-bold uppercase tracking-wide text-white active:scale-[0.98]">
                <Icon name="add" className="text-[18px]" /> Add USDC
              </button>
            </div>
          </section>
        )}
        {!q && !handle && (
          <button type="button" onClick={reopenClaim} className="flex items-center gap-3 rounded-[20px] border border-surface-variant bg-surface-container-lowest px-3 py-3 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary-fixed text-primary">
              <Icon name="alternate_email" className="text-[20px]" />
            </span>
            <span>
              <span className="block text-label-md font-semibold text-primary">Claim a name</span>
              <span className="block text-body-sm text-on-surface-variant">Friends pay @you instead of an address.</span>
            </span>
          </button>
        )}
        {(owe.length > 0 || owed.length > 0) && (
          <section className="grid grid-cols-2 gap-2">
            <OweCard title="You owe" rows={owe} tone="bg-error-container/40 text-error" />
            <OweCard title="Owed to you" rows={owed} tone="bg-tertiary-fixed/40 text-tertiary" />
          </section>
        )}
        <div className="grid grid-cols-4 gap-x-2 gap-y-5">
          {services.map((s) => (
            <button key={s.label} type="button" onClick={() => openAction(navigate, s.kind)} className="flex flex-col items-center gap-2 active:scale-95">
              <span className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-surface-variant bg-primary-fixed text-primary">
                <Icon name={s.icon} className="text-[24px]" />
              </span>
              <span className="text-[11px] font-medium text-on-surface-variant">{s.label}</span>
            </button>
          ))}
        </div>
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-headline-sm font-semibold">Friends</h2>
            <button type="button" className="text-[11px] font-medium text-primary-container" onClick={() => navigate('/friends')}>See all</button>
          </div>
          <div className="scroll-none -mx-container-padding flex gap-4 overflow-x-auto px-container-padding pb-2">
            <button type="button" onClick={() => navigate('/friends')} className="flex min-w-[64px] flex-col items-center gap-2">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-outline-variant text-outline">
                <Icon name="add" className="text-[24px]" />
              </span>
              <span className="text-[11px] text-on-surface-variant">Add</span>
            </button>
            {people.map((f) => (
              <button key={f.handle} type="button" onClick={() => navigate('/send', { state: { kind: 'send', who: f.handle } })} className="flex min-w-[64px] flex-col items-center gap-2">
                <Avatar name={f.handle} className="h-14 w-14" />
                <span className="max-w-[64px] truncate text-[11px] text-on-surface-variant">{f.handle}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </Shell>
  );
}

function OweCard({ title, rows, tone }: { title: string; rows: ActivityItem[]; tone: string }) {
  const sum = rows.reduce((n, r) => n + r.amount, 0);
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center ${tone}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">{title}</p>
      <p className="text-label-md font-semibold">{money(sum)}</p>
    </div>
  );
}

function Send() {
  const { openDraft, friends, handle, balance, address } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { kind?: Kind; who?: string; amount?: string };
  const params = new URLSearchParams(location.search);
  const queried = params.get('kind');
  const kind: Kind = queried === 'request' || queried === 'split' || queried === 'tip' || queried === 'send' ? queried : (state.kind ?? 'send');
  const title = SERVICES.find((s) => s.kind === kind)?.label ?? 'Send';
  const people = othersOf(friends, handle);
  const presetAmount = params.get('amount') || state.amount || '';
  const [amount, setAmount] = useState(/^\d+(\.\d{1,2})?$/.test(presetAmount) ? presetAmount : '');
  const [who, setWho] = useState((state.who || params.get('who') || '').replace(/^@/, ''));
  const [note, setNote] = useState('');
  const { rows: history } = useChainActivity(address);
  const n = Number(amount) || 0;
  const verb = kind === 'request' ? 'request from' : kind === 'split' ? 'split with' : 'send to';
  const cleanWho = who.replace(/^@/, '').toLowerCase();
  const withThem = history.filter((row) => row.who.replace(/^@/, '').toLowerCase() === cleanWho).slice(0, 3);
  const review = () => {
    if (!who || !n) return;
    if (kind === 'split') {
      const names = namesOf(who);
      if (names.length < 1) return;
      const share = Math.round((n / (names.length + 1)) * 100) / 100;
      openDraft({
        kind: 'split',
        amount: Number((share * names.length).toFixed(2)),
        who: names.join(', '),
        shares: names.map((name) => ({ who: name, amount: share })),
        note: note || `Split $${n.toFixed(2)}`,
      });
      return;
    }
    openDraft({ kind, amount: n, who, note: note || `${title} ${verb} @${who.replace(/^@/, '')}` });
  };
  return (
    <Shell
      tabs={false}
      footer={
        <div className="border-t border-surface-variant bg-surface-container-lowest px-container-padding py-3 pb-safe">
          <Primary label={n && who ? `Review ${money(n)}` : 'Review'} onClick={review} />
        </div>
      }
    >
      <PageHeader title={title} subtitle="USDC on Arc" onBack={() => navigate(-1)} />
      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-5 px-container-padding py-4">
        <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5 soft-shadow">
          <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">Amount</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[40px] font-bold tracking-tight text-primary">$</span>
            <input
              className="w-full bg-transparent text-[40px] font-bold tracking-tight text-on-surface outline-none placeholder:text-outline-variant"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </div>
          <p className="mt-1 text-body-sm text-on-surface-variant">{kind === 'request' ? 'They pay this' : `Available $${dollars(balance)}`}</p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {['5', '10', '20', '50'].map((value) => (
              <button key={value} type="button" onClick={() => setAmount(value)} className={`rounded-full py-2 text-label-sm ${amount === value ? 'bg-primary font-semibold text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                ${value}
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5 soft-shadow">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">{kind === 'split' ? 'With' : 'To'}</p>
          {people.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {people.map((f) => (
                <button key={f.handle} type="button" onClick={() => setWho(kind === 'split' ? `${who} ${f.handle}`.trim() : f.handle)} className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12px] ${namesOf(who).includes(f.handle) ? 'bg-primary-fixed font-semibold text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                  <Avatar name={f.handle} className="h-7 w-7 text-[11px]" />@{f.handle}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => navigate('/friends')} className="mb-3 flex items-center gap-2 rounded-full bg-primary-fixed px-3 py-2 text-label-sm text-primary">
              <Icon name="person_add" className="text-[18px]" /> Add a friend first
            </button>
          )}
          <input
            className="w-full rounded-[16px] border border-surface-variant bg-background px-4 py-3 text-body-md outline-none placeholder:text-outline-variant focus:border-primary-container"
            placeholder={kind === 'split' ? '@maya @lee' : '@friend'}
            value={kind === 'split' ? who : who ? `@${who.replace(/^@/, '')}` : ''}
            onChange={(e) => setWho(kind === 'split' ? e.target.value : e.target.value.replace(/^@/, ''))}
          />
          <div className="mt-4">
            <Field label="Note" value={note} onChange={setNote} placeholder="Lunch, rent, the ride home" />
          </div>
        </section>
        <section>
          <h2 className="text-headline-sm font-semibold">{cleanWho ? `With @${cleanWho}` : 'Recent'}</h2>
          { (cleanWho ? withThem : history.slice(0, 3)).length === 0 ? (
            <p className="mt-2 text-body-sm text-on-surface-variant">{cleanWho ? `No payments with @${cleanWho} yet.` : 'Payments you confirm show up here.'}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(cleanWho ? withThem : history.slice(0, 3)).map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => { setWho(row.who); setAmount(String(row.amount)); }} className="flex w-full items-center gap-3 rounded-2xl border border-surface-variant bg-surface-container-lowest px-3 py-3 text-left">
                    <Avatar name={row.who || row.kind} className="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold">{row.who.startsWith('0x') ? row.who : `@${row.who || row.kind}`}</span>
                      <span className="block truncate text-label-sm capitalize text-on-surface-variant">{row.kind} · {row.status}</span>
                    </span>
                    <span className="text-body-sm font-semibold">{money(row.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </Shell>
  );
}

type ChatLine = { id: string; mine?: string; card?: { text: string; draft: Draft } };

function readChat(): ChatLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('dg.chat') || '[]') as ChatLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const PROMPTS = ['send 12 to @maya', 'request 8 from @lee', 'split 30 with @sam @lee', 'tip 5 to @maya'];

function Chat() {
  const { openDraft, balance, handle, address } = useSession();
  const [text, setText] = useState('');
  const [lines, setLines] = useState<ChatLine[]>(readChat);
  const shown = dollars(balance);
  const submit = (raw: string) => {
    const intent = parseIntent(raw);
    const id = `${Date.now()}`;
    if (!intent) {
      setLines((prev) => [...prev, { id, mine: raw }]);
      return;
    }
    const draft: Draft = intent.kind === 'split'
      ? {
          kind: 'split',
          amount: Number((Math.round((intent.amount / (intent.who.length + 1)) * 100) / 100 * intent.who.length).toFixed(2)),
          who: intent.who.join(', '),
          shares: intent.who.map((name) => ({ who: name, amount: Math.round((intent.amount / (intent.who.length + 1)) * 100) / 100 })),
          note: `Split $${intent.amount.toFixed(2)}`,
        }
      : { kind: intent.kind, amount: intent.amount, who: intent.who };
    const cardText = intent.kind === 'split'
      ? `Split $${intent.amount.toFixed(2)} with ${intent.who.map((name) => `@${name}`).join(' ')}`
      : `${intent.kind[0].toUpperCase()}${intent.kind.slice(1)} $${intent.amount.toFixed(2)} to @${intent.who}`;
    setLines((prev) => [
      ...prev,
      { id, mine: raw },
      { id: `${id}-c`, card: { text: cardText, draft } },
    ]);
  };
  useEffect(() => {
    localStorage.setItem('dg.chat', JSON.stringify(lines));
  }, [lines]);
  const send = () => {
    if (!text.trim()) return;
    submit(text.trim());
    setText('');
  };
  return (
    <Shell
      footer={
        <div className="border-t border-surface-variant bg-surface-container-lowest px-container-padding pb-2 pt-2">
          <div className="scroll-none mb-2 flex gap-2 overflow-x-auto">
            {['Send', 'Request', 'Split', 'Tip'].map((label) => (
              <button key={label} className="rounded-full bg-primary-fixed px-3 py-1.5 text-[12px] font-medium text-primary" type="button" onClick={() => setText(`${label.toLowerCase()} `)}>
                {label}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input className="min-w-0 flex-1 rounded-full border border-surface-variant bg-background px-4 py-3 text-body-sm outline-none" placeholder="send 12 to @maya" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" disabled={!text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:bg-surface-container disabled:text-outline" aria-label="Send">
              <Icon name="arrow_upward" className="text-[22px]" filled />
            </button>
          </form>
        </div>
      }
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-surface-variant bg-background px-container-padding py-3">
        <Avatar name={handle || 'Stablegram'} />
        <div>
          <p className="font-semibold text-primary">Chat</p>
          <p className="text-label-sm text-on-surface-variant">${shown} USDC · {handle ? `@${handle}` : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'No name yet'}</p>
        </div>
      </header>
      <div className="flex flex-col gap-3 px-container-padding py-4">
        {lines.length === 0 && (
          <div className="pt-6">
            <EmptyState
              icon="chat"
              title="Pay in a sentence"
              body="Type send, request, split, or tip. Stablegram turns it into a confirm card."
              cta="Try an example"
              onCta={() => submit(PROMPTS[0])}
            />
            <div className="mt-4 flex flex-col gap-2">
              {PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => submit(prompt)} className="rounded-2xl border border-surface-variant bg-surface-container-lowest px-4 py-3 text-left text-body-sm text-primary">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((line) =>
          line.mine ? (
            <p key={line.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary-fixed px-3 py-2 text-body-sm text-primary">{line.mine}</p>
          ) : line.card ? (
            <div key={line.id} className="max-w-[85%] rounded-[20px] border border-surface-variant bg-surface-container-lowest p-3 soft-shadow">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-fixed text-primary"><Icon name="send" className="text-[16px]" filled /></span>
                <p className="text-body-sm font-semibold">{line.card.text}</p>
              </div>
              <button className="mt-3 w-full rounded-full bg-cta py-2.5 text-label-md text-on-primary" type="button" onClick={() => openDraft(line.card!.draft)}>Confirm</button>
            </div>
          ) : null,
        )}
      </div>
    </Shell>
  );
}

const FILTERS: Array<Kind | 'all'> = ['all', 'send', 'request', 'tip', 'split', 'tab', 'collect', 'circle'];

function when(at: number) {
  const d = Date.now() - at;
  if (d < 60_000) return 'Now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  if (d < 172_800_000) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Activity() {
  const { openDraft, address } = useSession();
  const navigate = useNavigate();
  const { rows, error } = useChainActivity(address);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const shown = rows.filter((r) => filter === 'all' || r.kind === filter);
  const pending = shown.filter((row) => row.status === 'pending');
  const pendingSum = pending.reduce((sum, row) => sum + row.amount, 0);
  const label = (id: (typeof FILTERS)[number]) => (id === 'tab' ? 'Loans' : id === 'circle' ? 'Circles' : id);
  return (
    <Shell>
      <div className="px-container-padding pb-6 pt-4">
        <h1 className="text-headline-md text-primary">Activity</h1>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-primary-fixed px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Pending</p>
            <p className="mt-1 text-headline-sm font-semibold text-primary">{money(pendingSum)}</p>
          </div>
          <div className="rounded-2xl bg-surface-container px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Shown</p>
            <p className="mt-1 text-headline-sm font-semibold">{shown.length}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((id) => (
            <button key={id} className={`rounded-full px-3 py-1.5 text-[12px] capitalize ${filter === id ? 'bg-primary-fixed font-semibold text-primary' : 'bg-surface-container text-on-surface-variant'}`} type="button" onClick={() => setFilter(id)}>
              {label(id)}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon="receipt_long" title={error || 'Nothing on Arc yet'} body="USDC transfers to and from this wallet show up here." cta="Send USDC" onCta={() => navigate('/send')} />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {shown.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openDraft({ kind: row.kind, amount: row.amount, who: row.who || row.kind, note: row.title })}
                  className="flex w-full items-center gap-3 rounded-[20px] border border-surface-variant bg-surface-container-lowest px-3 py-3 text-left"
                >
                  <Avatar name={row.who || row.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{row.who.startsWith('0x') ? row.who : `@${row.who.replace(/^@/, '')}`}</span>
                    <span className="block truncate text-body-sm capitalize text-on-surface-variant">{label(row.kind)} · {row.status}</span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-semibold ${row.direction === 'in' ? 'text-tertiary' : 'text-on-surface'}`}>{row.direction === 'in' ? '+' : '−'}{money(row.amount)}</span>
                    <span className="block text-label-sm text-outline">{when(row.at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function Friends() {
  const { friends, saveFriend, removeFriend, address } = useSession();
  const toasts = useToasts();
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const { rows } = useChainActivity(address);
  const q = query.trim().toLowerCase().replace(/^@/, '');
  const list = friends.filter((f) => !q || f.handle.includes(q));
  const known = new Set(list.map((f) => f.handle.toLowerCase()));
  const recent = rows.filter((row) => known.has(row.who.replace(/^@/, '').toLowerCase())).slice(0, 4);
  return (
    <Shell>
      <PageHeader title="Friends" onBack={() => navigate(-1)} />
      <div className="px-container-padding pt-4">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline" />
          <input className="w-full rounded-xl border border-surface-variant bg-surface-container-lowest py-3 pl-10 pr-4 text-body-sm" placeholder="Search friends" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = handle.replace(/^@/, '').trim().toLowerCase();
            if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
              toasts.push({ kind: 'error', message: 'Use 3 to 20 letters, numbers, or underscores.' });
              return;
            }
            setAdding(true);
            void fetch(`/api/registry?handle=${encodeURIComponent(clean)}`)
              .then(async (response) => (response.ok ? response.json() : {}))
              .then((data: { address?: string }) => {
                if (!data.address) {
                  toasts.push({ kind: 'error', message: `@${clean} is not on Arc yet.` });
                  return;
                }
                saveFriend(clean, data.address);
                setHandle('');
              })
              .catch(() => toasts.push({ kind: 'error', message: 'Could not check that name.' }))
              .finally(() => setAdding(false));
          }}
        >
          <input className="flex-1 rounded-[16px] border border-surface-variant bg-surface-container-lowest px-4 py-3" placeholder="Add an @name" value={handle} onChange={(e) => setHandle(e.target.value)} disabled={adding} />
          <button className="rounded-full bg-cta px-5 font-semibold text-on-primary disabled:opacity-60" type="submit" disabled={adding} aria-busy={adding}>{adding ? 'Checking…' : 'Add'}</button>
        </form>
        {list.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon="group" title={friends.length === 0 ? 'No friends yet' : 'No match'} body="Add an @name, then send or request without typing it again." cta="Invite from Chat" onCta={() => navigate('/chat')} />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {list.map((f) => (
              <li key={f.handle} className="flex items-center gap-3 rounded-[20px] border border-surface-variant bg-surface-container-lowest px-3 py-3">
                <Avatar name={f.handle} />
                <p className="min-w-0 flex-1 truncate font-medium">@{f.handle}</p>
                <button className="rounded-full bg-primary-fixed px-3 py-1.5 text-label-sm font-semibold text-primary" type="button" onClick={() => navigate('/send', { state: { kind: 'request', who: f.handle } })}>Request</button>
                <button className="rounded-full bg-cta px-3 py-1.5 text-label-sm font-semibold text-on-primary" type="button" onClick={() => navigate('/send', { state: { kind: 'send', who: f.handle } })}>Send</button>
                <button className="text-label-sm text-error" type="button" onClick={() => removeFriend(f.handle)} aria-label={`Remove @${f.handle}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <section className="mt-6 pb-4">
          <h2 className="text-headline-sm font-semibold">Recent</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-body-sm text-on-surface-variant">Payments with these friends show up here. Request and Send stay on the row.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {recent.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => navigate('/send', { state: { kind: row.kind === 'request' || row.kind === 'split' || row.kind === 'tip' ? row.kind : 'send', who: row.who, amount: String(row.amount) } })}
                    className="flex w-full items-center gap-3 rounded-[20px] border border-surface-variant bg-surface-container-lowest px-3 py-3 text-left"
                  >
                    <Avatar name={row.who} className="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold">{row.who.startsWith('0x') ? row.who : `@${row.who}`}</span>
                      <span className="block truncate text-label-sm capitalize text-on-surface-variant">{row.kind} · {row.status}</span>
                    </span>
                    <span className="text-body-sm font-semibold">{money(row.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}

type Pot = { id: string; name: string; goal: number; raised: number; owner: string };
type Round = { id: string; name: string; amount: number; members: string; periodDays: number; startsOn: string };

function loadList<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]') as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function potLink(pot: Pot) {
  const url = new URL('/collect', window.location.origin);
  url.searchParams.set('id', pot.id);
  url.searchParams.set('name', pot.name);
  url.searchParams.set('goal', String(pot.goal));
  url.searchParams.set('owner', pot.owner);
  return url.toString();
}

function circleLink(round: Round) {
  const url = new URL('/circles', window.location.origin);
  url.searchParams.set('id', round.id);
  url.searchParams.set('name', round.name);
  url.searchParams.set('amount', String(round.amount));
  url.searchParams.set('period', String(round.periodDays));
  url.searchParams.set('start', round.startsOn);
  url.searchParams.set('members', round.members);
  return url.toString();
}

function loanLink(from: string, amount: number, due: string, note?: string) {
  const url = new URL('/tabs', window.location.origin);
  url.searchParams.set('from', from.replace(/^@/, ''));
  url.searchParams.set('amount', String(amount));
  if (due) url.searchParams.set('due', due);
  if (note) url.searchParams.set('note', note);
  return url.toString();
}

function circleDates(round: Round) {
  return namesOf(round.members).map((name, index) => ({
    name,
    on: addDays(round.startsOn || isoToday(), index * (round.periodDays || 7)),
  }));
}

function nextPayout(round: Round) {
  const today = isoToday();
  const dates = circleDates(round);
  return dates.find((row) => row.on >= today) ?? dates[dates.length - 1];
}

function Collect() {
  const { handle, openDraft } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [pots, setPots] = useState<Pot[]>(() => loadList<Pot>('dg.pots').map((pot) => ({ ...pot, owner: pot.owner || '', raised: pot.raised || 0 })));
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState('');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const save = (next: Pot[]) => {
    setPots(next);
    localStorage.setItem('dg.pots', JSON.stringify(next));
  };
  useEffect(() => {
    const onPot = (event: Event) => {
      const detail = (event as CustomEvent<{ potId?: string; amount?: number }>).detail;
      if (!detail?.potId || !detail.amount) return;
      setPots((prev) => {
        const next = prev.map((pot) => (pot.id === detail.potId ? { ...pot, raised: pot.raised + detail.amount! } : pot));
        localStorage.setItem('dg.pots', JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener('dg-pot', onPot);
    return () => window.removeEventListener('dg-pot', onPot);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const importedName = params.get('name');
    if (!importedName) return;
    const imported: Pot = {
      id: params.get('id') || `pot-${importedName}`,
      name: importedName,
      goal: Number(params.get('goal') || 0),
      raised: 0,
      owner: (params.get('owner') || '').replace(/^@/, ''),
    };
    setPots((prev) => {
      if (prev.some((pot) => pot.id === imported.id)) return prev;
      const next = [imported, ...prev];
      localStorage.setItem('dg.pots', JSON.stringify(next));
      return next;
    });
    setOpenId(imported.id);
  }, [location.search]);
  const opened = pots.find((pot) => pot.id === openId);
  if (creating) {
    return (
      <Shell tabs={false}>
        <PageHeader title="Create a pot" onBack={() => setCreating(false)} />
        <div className="space-y-4 px-container-padding py-4">
          <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5">
            <Field label="Pot name" value={name} onChange={setName} placeholder="Weekend" />
            <div className="mt-4">
              <Field label="Goal (USDC)" value={goal} onChange={setGoal} placeholder="100" />
            </div>
          </section>
          <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">Preview</p>
            <p className="mt-2 font-semibold">{name.trim() || 'Untitled pot'}</p>
            <p className="text-body-sm text-on-surface-variant">$0.00 of {money(Number(goal) || 0)}</p>
          </section>
          <Primary
            label="Create pot"
            onClick={() => {
              if (!name.trim() || !handle) return;
              const pot: Pot = { id: `${Date.now()}`, name: name.trim(), goal: Number(goal) || 0, raised: 0, owner: handle.replace(/^@/, '') };
              save([pot, ...pots]);
              setCreating(false);
              setName('');
              setGoal('');
              setOpenId(pot.id);
            }}
          />
        </div>
      </Shell>
    );
  }
  if (opened) {
    const mine = opened.owner.replace(/^@/, '').toLowerCase() === handle.replace(/^@/, '').toLowerCase();
    const n = Number(addAmount) || 0;
    return (
      <Shell tabs={false}>
        <PageHeader title={opened.name} subtitle={opened.owner ? `@${opened.owner}` : 'Pot'} onBack={() => setOpenId('')} />
        <div className="space-y-4 px-container-padding py-4">
          <section className="rounded-[24px] border border-primary bg-primary p-5 text-on-primary">
            <p className="text-[11px] font-medium uppercase tracking-wider text-primary-fixed">Collected</p>
            <p className="text-[32px] font-bold tracking-tight">{money(opened.raised)}</p>
            <p className="text-body-sm text-primary-fixed">of {money(opened.goal || 0)}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white" style={{ width: `${opened.goal ? Math.min(100, (opened.raised / opened.goal) * 100) : 0}%` }} />
            </div>
          </section>
          <section className="space-y-3 rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5">
            <Field label="Amount (USDC)" value={addAmount} onChange={setAddAmount} placeholder="10" />
            {mine ? (
              <>
                <p className="text-body-sm text-on-surface-variant">This counts USDC you are putting in. It does not send a transfer to yourself. Friends pay you from the shared link.</p>
                <Primary
                  label={n ? `Count ${money(n)}` : 'Count'}
                  onClick={() => {
                    if (!n) return;
                    save(pots.map((pot) => (pot.id === opened.id ? { ...pot, raised: pot.raised + n } : pot)));
                    setAddAmount('');
                  }}
                />
              </>
            ) : (
              <>
                <p className="text-body-sm text-on-surface-variant">This sends USDC to @{opened.owner || 'the owner'}.</p>
                <Primary
                  label={n ? `Pay ${money(n)}` : 'Pay'}
                  onClick={() => {
                    if (!n || !opened.owner) return;
                    openDraft({ kind: 'collect', amount: n, who: opened.owner, note: opened.name, potId: opened.id });
                  }}
                />
              </>
            )}
            <button type="button" className="w-full py-2 text-body-sm font-semibold text-primary" onClick={() => sharePage(potLink(opened), `Add to ${opened.name} on Stablegram`)}>
              Share pot
            </button>
          </section>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <PageHeader title="Collect" onBack={() => navigate(-1)} />
      <div className="space-y-4 px-container-padding pt-4">
        <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5 soft-shadow">
          <h2 className="text-headline-sm font-semibold">New pot</h2>
          <p className="text-body-sm text-on-surface-variant">Friends chip in toward one goal by paying you in USDC.</p>
          <button type="button" onClick={() => setCreating(true)} className="mt-4 w-full rounded-full bg-primary py-3.5 text-[12px] font-bold uppercase tracking-wide text-on-primary" disabled={!handle}>
            Create a pot
          </button>
        </section>
        {pots.length === 0 ? (
          <EmptyState icon="savings" title="No pots yet" body="A lunch, a trip, a gift. Set a goal and share the link." cta="Start a $20 pot" onCta={() => { setName('Lunch'); setGoal('20'); setCreating(true); }} />
        ) : (
          <ul className="space-y-3">
            {pots.map((pot) => (
              <li key={pot.id}>
                <button type="button" onClick={() => setOpenId(pot.id)} className="w-full rounded-[24px] border border-surface-variant bg-surface-container-lowest p-4 text-left">
                  <p className="font-semibold">{pot.name}</p>
                  <p className="text-body-sm text-on-surface-variant">{money(pot.raised)} of {money(pot.goal || 0)}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container">
                    <div className="h-full rounded-full bg-cta" style={{ width: `${pot.goal ? Math.min(100, (pot.raised / pot.goal) * 100) : 0}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function Circles() {
  const { handle, openDraft } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [rounds, setRounds] = useState<Round[]>(() => loadList<Round>('dg.circles').map((round) => ({ ...round, periodDays: round.periodDays || 7, startsOn: round.startsOn || isoToday() })));
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [members, setMembers] = useState('');
  const [periodDays, setPeriodDays] = useState(7);
  const [startsOn, setStartsOn] = useState(isoToday);
  const save = (next: Round[]) => {
    setRounds(next);
    localStorage.setItem('dg.circles', JSON.stringify(next));
  };
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const importedName = params.get('name');
    if (!importedName) return;
    const imported: Round = {
      id: params.get('id') || `circle-${importedName}`,
      name: importedName,
      amount: Number(params.get('amount') || 0),
      members: params.get('members') || '',
      periodDays: Number(params.get('period') || 7),
      startsOn: params.get('start') || isoToday(),
    };
    setRounds((prev) => {
      if (prev.some((round) => round.id === imported.id)) return prev;
      const next = [imported, ...prev];
      localStorage.setItem('dg.circles', JSON.stringify(next));
      return next;
    });
    setOpenId(imported.id);
  }, [location.search]);
  const previewMembers = namesOf(members);
  const preview = previewMembers.map((member, index) => ({ name: member, on: addDays(startsOn || isoToday(), index * periodDays) }));
  const opened = rounds.find((round) => round.id === openId);
  if (creating) {
    return (
      <Shell tabs={false}>
        <PageHeader title="Start a circle" onBack={() => setCreating(false)} />
        <div className="space-y-4 px-container-padding py-4">
          <section className="space-y-4 rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5">
            <Field label="Name" value={name} onChange={setName} placeholder="Friday circle" />
            <Field label="Each (USDC)" value={amount} onChange={setAmount} placeholder="20" />
            <Field label="Members" value={members} onChange={setMembers} placeholder="@maya @lee" />
            <div>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">How often</p>
              <div className="grid grid-cols-3 gap-2">
                {CADENCE.map((option) => (
                  <button key={option.days} type="button" onClick={() => setPeriodDays(option.days)} className={`rounded-full py-2 text-label-sm ${periodDays === option.days ? 'bg-primary font-semibold text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="First payout" value={startsOn} onChange={setStartsOn} type="date" />
          </section>
          <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">Payout dates</p>
            {preview.length === 0 ? (
              <p className="mt-2 text-body-sm text-on-surface-variant">Add two or more @names.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {preview.map((row) => (
                  <li key={row.name} className="flex items-center justify-between text-body-sm">
                    <span className="font-semibold">@{row.name}</span>
                    <span className="text-on-surface-variant">{prettyDay(row.on)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-body-sm text-on-surface-variant">{money(Number(amount) || 0)} from each person. Creating the circle does not move USDC.</p>
          </section>
          <Primary
            label="Create circle"
            onClick={() => {
              if (!name.trim() || previewMembers.length < 2) return;
              const round: Round = { id: `${Date.now()}`, name: name.trim(), amount: Number(amount) || 0, members: previewMembers.join(' '), periodDays, startsOn: startsOn || isoToday() };
              save([round, ...rounds]);
              setCreating(false);
              setOpenId(round.id);
            }}
          />
        </div>
      </Shell>
    );
  }
  if (opened) {
    const dates = circleDates(opened);
    const next = nextPayout(opened);
    const cadence = CADENCE.find((option) => option.days === opened.periodDays)?.label ?? `Every ${opened.periodDays} days`;
    const mine = next?.name === handle.replace(/^@/, '').toLowerCase();
    return (
      <Shell tabs={false}>
        <PageHeader title={opened.name} subtitle={cadence} onBack={() => setOpenId('')} />
        <div className="space-y-4 px-container-padding py-4">
          <section className="rounded-[24px] border border-primary bg-primary p-5 text-on-primary">
            <p className="text-[11px] font-medium uppercase tracking-wider text-primary-fixed">Each round</p>
            <p className="text-[32px] font-bold tracking-tight">{money(opened.amount)}</p>
            <p className="text-body-sm text-primary-fixed">{next ? `Next: @${next.name} on ${prettyDay(next.on)}` : 'Add members'}</p>
          </section>
          <ul className="space-y-2">
            {dates.map((row) => (
              <li key={`${row.name}-${row.on}`} className="flex items-center justify-between rounded-[20px] border border-surface-variant bg-surface-container-lowest px-4 py-3">
                <span className="font-semibold">@{row.name}</span>
                <span className="text-body-sm text-on-surface-variant">{prettyDay(row.on)}</span>
              </li>
            ))}
          </ul>
          {mine ? (
            <p className="text-body-sm text-on-surface-variant">You receive this round. Everyone else pays you {money(opened.amount)}.</p>
          ) : next ? (
            <Primary label={`Pay @${next.name} ${money(opened.amount)}`} onClick={() => openDraft({ kind: 'circle', amount: opened.amount, who: next.name, note: opened.name })} />
          ) : null}
          <button type="button" className="w-full py-2 text-body-sm font-semibold text-primary" onClick={() => sharePage(circleLink(opened), `${opened.name} on Stablegram`)}>
            Share circle
          </button>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <PageHeader title="Circles" onBack={() => navigate(-1)} />
      <div className="space-y-4 px-container-padding pt-4">
        <section className="rounded-[24px] border border-primary bg-primary p-5 text-on-primary">
          <p className="text-[11px] font-medium uppercase tracking-wider text-primary-fixed">A round</p>
          <p className="mt-1 text-headline-sm font-semibold">Everyone puts in the same amount. One person receives it on each date.</p>
          <button type="button" onClick={() => setCreating(true)} className="mt-4 rounded-full bg-cta px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-white">
            Start a circle
          </button>
        </section>
        {rounds.length === 0 ? (
          <EmptyState icon="donut_large" title="No circles yet" body="Pick how often, the first payout date, and at least two @names." cta="Start a circle" onCta={() => setCreating(true)} />
        ) : (
          <ul className="space-y-3">
            {rounds.map((round) => {
              const next = nextPayout(round);
              const cadence = CADENCE.find((option) => option.days === (round.periodDays || 7))?.label ?? 'Weekly';
              return (
                <li key={round.id}>
                  <button type="button" onClick={() => setOpenId(round.id)} className="w-full rounded-[24px] border border-surface-variant bg-surface-container-lowest p-4 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{round.name}</p>
                        <p className="text-body-sm text-on-surface-variant">{money(round.amount)} · {cadence}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-body-sm text-outline">{next ? `Next @${next.name} · ${prettyDay(next.on)}` : 'Add members'}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function TabsPage() {
  const { handle, openDraft } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<ActivityItem[]>(() => readLedger().activity.filter((row) => row.kind === 'tab'));
  const [lending, setLending] = useState(false);
  const [who, setWho] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState(() => addDays(isoToday(), 30));
  const owedFrom = new URLSearchParams(location.search).get('from') || '';
  const owedAmount = Number(new URLSearchParams(location.search).get('amount') || '');
  const owedDue = new URLSearchParams(location.search).get('due') || '';
  const owedNote = new URLSearchParams(location.search).get('note') || '';
  useEffect(() => {
    const sync = () => setRows(readLedger().activity.filter((row) => row.kind === 'tab'));
    window.addEventListener('dg-ledger', sync);
    return () => window.removeEventListener('dg-ledger', sync);
  }, []);
  const owedToYou = rows.filter((row) => row.direction === 'out').reduce((sum, row) => sum + row.amount, 0);
  const youOwe = rows.filter((row) => row.direction === 'in').reduce((sum, row) => sum + row.amount, 0);
  if (lending) {
    return (
      <Shell tabs={false}>
        <PageHeader title="Lend" subtitle="USDC moves when you confirm" onBack={() => setLending(false)} />
        <div className="space-y-4 px-container-padding py-4">
          <section className="space-y-4 rounded-[24px] border border-surface-variant bg-surface-container-lowest p-5">
            <Field label="To" value={who} onChange={setWho} placeholder="@friend" />
            <Field label="Amount (USDC)" value={amount} onChange={setAmount} placeholder="0.00" />
            <Field label="Due" value={due} onChange={setDue} type="date" />
            <Field label="Note" value={note} onChange={setNote} placeholder="Optional" />
          </section>
          <section className="rounded-[24px] bg-primary-fixed p-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">They receive</p>
            <p className="mt-1 text-headline-sm font-semibold text-primary">{money(Number(amount) || 0)}</p>
            <p className="text-body-sm text-on-surface-variant">{who.trim() ? `@${who.replace(/^@/, '')} gets this USDC` : 'Add who this is for'}</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">Due {prettyDay(due)}</p>
          </section>
          <Primary
            label={Number(amount) ? `Review ${money(Number(amount))}` : 'Review'}
            onClick={() => {
              const n = Number(amount);
              if (!who || !n || !due) return;
              openDraft({ kind: 'tab', amount: n, who, note: note || undefined, due });
            }}
          />
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <PageHeader title="Loans" onBack={() => navigate(-1)} />
      <div className="space-y-4 px-container-padding pt-4">
        {owedFrom && owedAmount > 0 && (
          <section className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-4">
            <p className="font-semibold">You owe @{owedFrom.replace(/^@/, '')}</p>
            <p className="text-body-sm text-on-surface-variant">{money(owedAmount)}{owedDue ? ` · due ${prettyDay(owedDue)}` : ''}{owedNote ? ` · ${owedNote}` : ''}</p>
            <button
              type="button"
              className="mt-3 rounded-full bg-cta px-5 py-2 text-label-md text-on-primary"
              onClick={() => openDraft({ kind: 'send', amount: owedAmount, who: owedFrom, note: owedNote || `Repay @${owedFrom.replace(/^@/, '')}` })}
            >
              Repay {money(owedAmount)}
            </button>
          </section>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-error-container/40 px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">You owe</p>
            <p className="mt-1 text-headline-sm font-semibold text-error">{money(youOwe)}</p>
          </div>
          <div className="rounded-2xl bg-tertiary-fixed/40 px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Owed to you</p>
            <p className="mt-1 text-headline-sm font-semibold text-tertiary">{money(owedToYou)}</p>
          </div>
        </div>
        <button type="button" onClick={() => setLending(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[12px] font-bold uppercase tracking-wide text-on-primary">
          <Icon name="handshake" className="text-[18px]" /> Lend to a friend
        </button>
        {rows.length === 0 ? (
          <EmptyState icon="handshake" title="No loans yet" body="Lending sends USDC. The due date is on the loan, and they can repay from the link." cta="Lend $25" onCta={() => { setAmount('25'); setLending(true); }} />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-[24px] border border-surface-variant bg-surface-container-lowest p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={row.who} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">@{row.who}</p>
                    <p className="text-body-sm text-on-surface-variant">{row.direction === 'out' ? 'owes you' : 'you owe'} · {row.status}{row.due ? ` · due ${prettyDay(row.due)}` : ''}</p>
                  </div>
                  <p className="font-semibold">{money(row.amount)}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  {row.direction === 'in' && (
                    <button type="button" className="rounded-full bg-cta px-4 py-2 text-label-sm text-on-primary" onClick={() => openDraft({ kind: 'send', amount: row.amount, who: row.who, note: `Repay @${row.who}` })}>
                      Repay
                    </button>
                  )}
                  {row.direction === 'out' && handle && (
                    <button type="button" className="rounded-full bg-primary-fixed px-4 py-2 text-label-sm font-semibold text-primary" onClick={() => sharePage(loanLink(handle, row.amount, row.due || '', row.title), `Repay @${handle} on Stablegram`)}>
                      Share repay link
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

type SpendLimit = { who: string; cap: string; days: string };

function readLimits(): SpendLimit[] {
  try {
    const raw = JSON.parse(localStorage.getItem('dg.limits') || '[]') as SpendLimit[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function payUrl(kind: string, handle: string, amount?: string) {
  const url = new URL('/send', window.location.origin);
  url.searchParams.set('kind', kind);
  url.searchParams.set('who', handle.replace(/^@/, ''));
  if (amount) url.searchParams.set('amount', amount);
  return url.toString();
}

function Me() {
  const { handle, address, email, walletKind, balance, balanceError, refreshBalance, signOut, reopenClaim } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const toasts = useToasts();
  const [sheet, setSheet] = useState<'fund' | 'links' | 'allowance' | 'about' | 'commands' | null>(null);
  const [limits, setLimits] = useState<SpendLimit[]>(readLimits);
  const [limitWho, setLimitWho] = useState('');
  const [limitCap, setLimitCap] = useState('');
  const [limitDays, setLimitDays] = useState('30');
  const shown = dollars(balance);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'After your wallet opens';
  useEffect(() => {
    const state = location.state as { fund?: boolean } | null;
    if (state?.fund) setSheet('fund');
  }, [location.state]);

  const copy = async (value: string, message = 'Copied') => {
    try {
      await navigator.clipboard.writeText(value);
      toasts.push({ kind: 'success', message });
    } catch {
      toasts.push({ kind: 'error', message: 'Could not copy.' });
    }
  };

  const share = async (url: string, title: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return;
      }
    }
    await copy(url, 'Link copied');
  };

  const saveLimit = () => {
    const who = limitWho.replace(/^@/, '').trim().toLowerCase();
    const cap = Number(limitCap);
    const days = Number(limitDays);
    if (!who || !cap || !days) return;
    const next = [{ who, cap: cap.toFixed(2), days: String(days) }, ...limits.filter((row) => row.who !== who)];
    setLimits(next);
    localStorage.setItem('dg.limits', JSON.stringify(next));
    setLimitWho('');
    setLimitCap('');
    toasts.push({ kind: 'success', message: `Limit saved for @${who}. USDC stays in your wallet.` });
  };

  const links = [
    { label: 'Pay me', desc: `Anyone can send USDC to @${handle}`, url: payUrl('send', handle) },
    { label: 'Tip jar', desc: 'A link that opens a tip', url: payUrl('tip', handle) },
    { label: 'Pay $25', desc: 'Fixed amount, still needs their confirm', url: payUrl('send', handle, '25') },
  ];

  const overlay = sheet === 'fund' ? (
    <Sheet title="Add USDC" onClose={() => setSheet(null)}>
      <p className="text-center text-body-sm text-on-surface-variant">Send USDC on Arc. Scan the code or copy the address. The same USDC pays the fee.</p>
      {address ? (
        <>
          <div className="mx-auto mt-4 w-fit rounded-2xl border border-surface-variant bg-white p-4">
            <QRCodeSVG value={address} size={200} level="M" />
          </div>
          <p className="mt-3 break-all text-center font-mono text-[12px] leading-relaxed text-on-surface">{address}</p>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-full bg-cta py-3 font-semibold text-on-primary" type="button" onClick={() => void copy(address, 'Address copied')}>Copy</button>
            <a className="flex flex-1 items-center justify-center rounded-full border border-primary py-3 font-semibold text-primary" href={explorerAddress(address)} target="_blank" rel="noreferrer">Explorer</a>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-2xl bg-surface-container-low px-3 py-3 text-center text-body-sm">Your wallet address appears after sign-in.</p>
      )}
    </Sheet>
  ) : sheet === 'links' ? (
    <Sheet title="Payment links" onClose={() => setSheet(null)}>
      <div className="flex flex-col gap-3">
        {links.map((row) => (
          <div key={row.label} className="rounded-2xl bg-surface-container-low p-3">
            <p className="text-body-md font-medium">{row.label}</p>
            <p className="text-body-sm text-on-surface-variant">{row.desc}</p>
            <p className="mt-1 break-all font-mono text-[11px] leading-snug text-outline">{row.url}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="flex-1 rounded-full border border-primary py-2 text-label-sm text-primary" onClick={() => void copy(row.url, 'Link copied')}>Copy</button>
              <button type="button" className="flex-1 rounded-full bg-primary py-2 text-label-sm text-on-primary" onClick={() => void share(row.url, `${row.label} on Stablegram`)}>Share</button>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  ) : sheet === 'allowance' ? (
    <Sheet title="Spend limits" onClose={() => setSheet(null)}>
      <p className="text-body-sm text-on-surface-variant">A reminder of what a friend may spend. USDC stays in your wallet until you confirm a payment.</p>
      <div className="mt-3 space-y-2">
        <Field label="Friend" value={limitWho} onChange={setLimitWho} placeholder="@friend" />
        <Field label="Cap (USDC)" value={limitCap} onChange={setLimitCap} placeholder="50" />
        <Field label="Days" value={limitDays} onChange={setLimitDays} placeholder="30" />
        <Primary label="Save limit" onClick={saveLimit} />
      </div>
      {limits.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {limits.map((row) => (
            <li key={row.who} className="flex items-center justify-between rounded-2xl bg-surface-container-low px-3 py-2.5">
              <span>
                <span className="block text-body-md font-medium">@{row.who}</span>
                <span className="text-body-sm text-on-surface-variant">${row.cap} · {row.days} days</span>
              </span>
              <button
                type="button"
                className="text-label-sm text-error"
                onClick={() => {
                  const next = limits.filter((item) => item.who !== row.who);
                  setLimits(next);
                  localStorage.setItem('dg.limits', JSON.stringify(next));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  ) : sheet === 'commands' ? (
    <Sheet title="Chat commands" onClose={() => setSheet(null)}>
      <ul className="flex flex-col gap-2">
        {PROMPTS.map((cmd) => (
          <li key={cmd} className="rounded-xl border border-surface-variant bg-surface-container-low px-3 py-2.5 font-mono text-[12px]">{cmd}</li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-label-md font-semibold text-on-primary"
        onClick={() => navigate('/chat')}
      >
        <Icon name="chat" className="text-[20px]" filled /> Open Chat
      </button>
    </Sheet>
  ) : sheet === 'about' ? (
    <Sheet title="About Stablegram" onClose={() => setSheet(null)}>
      <p className="text-body-sm leading-relaxed text-on-surface-variant">Stablegram settles on Arc. USDC is the balance and the fee. You approve each payment.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {VAULTS.map((vault) => (
          <li key={vault.address}>
            <a href={explorerAddress(vault.address)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-surface-variant px-3 py-2.5">
              <span className="text-body-sm font-medium">{vault.name}</span>
              <span className="font-mono text-[11px] text-primary">{vault.address.slice(0, 6)}…{vault.address.slice(-4)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Sheet>
  ) : null;

  return (
    <Shell overlay={overlay}>
      <div className="px-container-padding pb-6 pt-4">
        <div className="flex items-center gap-3">
          <Avatar name={handle || 'Stablegram'} className="h-12 w-12" />
          <div>
            <p className="text-headline-sm font-semibold text-primary">{handle ? `@${handle}` : 'No name yet'}</p>
            <p className="text-label-sm text-on-surface-variant">{walletKind === 'passkey' ? 'Passkey wallet' : email || (walletKind === 'google' ? 'Google wallet' : 'USDC on Arc')}</p>
          </div>
        </div>
        <section className="mt-4 rounded-[24px] border border-primary bg-primary p-5 text-on-primary">
          <p className="text-[11px] font-medium uppercase tracking-wider text-primary-fixed">Total balance</p>
          <p className="text-[32px] font-bold tracking-tight">${shown}</p>
          {balanceError && (
            <button type="button" onClick={() => void refreshBalance()} className="mt-1 text-left text-[11px] font-semibold text-primary-fixed">
              {balanceError} Retry
            </button>
          )}
        </section>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Send', icon: 'send', onClick: () => navigate('/send') },
            { label: 'Receive', icon: 'qr_code_2', onClick: () => setSheet('fund') },
            { label: 'Add', icon: 'add_card', onClick: () => setSheet('fund') },
          ].map((action) => (
            <button key={action.label} type="button" onClick={action.onClick} className="flex flex-col items-center gap-2 rounded-2xl border border-surface-variant bg-surface-container-lowest py-3.5 active:scale-[0.98]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary">
                <Icon name={action.icon} className="text-[22px]" />
              </span>
              <span className="text-label-md">{action.label}</span>
            </button>
          ))}
        </div>
        <ul className="mt-4 overflow-hidden rounded-[24px] border border-surface-variant bg-surface-container-lowest">
          {!handle && <Menu icon="alternate_email" label="Claim your @handle" hint="One name on Arc" onClick={reopenClaim} />}
          <Menu icon="add_card" label="Add USDC" hint="QR and address" onClick={() => setSheet('fund')} />
          <Menu icon="link" label="Payment links" hint={handle ? `Pay @${handle}` : 'Claim a name first'} onClick={() => (handle ? setSheet('links') : reopenClaim())} />
          <Menu icon="account_balance_wallet" label="Spend limits" hint={limits.length ? `${limits.length} saved` : 'On this device'} onClick={() => setSheet('allowance')} />
          <Menu icon="chat" label="Chat commands" onClick={() => setSheet('commands')} />
          <Menu icon="group" label="Friends" onClick={() => navigate('/friends')} />
          <Menu icon="qr_code_2" label="Wallet address" hint={short} onClick={() => setSheet('fund')} />
          <Menu icon="info" label="About" hint="USDC on Arc" onClick={() => setSheet('about')} />
          <Menu icon="logout" label="Sign out" onClick={signOut} />
        </ul>
      </div>
    </Shell>
  );
}

function Menu({ icon, label, hint, onClick, href }: { icon: string; label: string; hint?: string; onClick?: () => void; href?: string }) {
  const className = 'flex w-full items-center justify-between gap-3 border-b border-surface-variant px-4 py-3.5 text-left last:border-0 hover:bg-surface-container-low';
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
          <Icon name={icon} className="text-[20px]" />
        </span>
        <span>
          <span className="block text-body-lg">{label}</span>
          {hint && <span className="block text-body-sm text-on-surface-variant">{hint}</span>}
        </span>
      </span>
      <Icon name="chevron_right" className="text-outline" />
    </>
  );
  if (href) return <li><a className={className} href={href} target="_blank" rel="noreferrer">{body}</a></li>;
  return <li><button className={className} type="button" onClick={onClick}>{body}</button></li>;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-on-surface/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[min(88%,calc(100%-1rem))] w-full overflow-y-auto rounded-t-[28px] border border-surface-variant bg-surface-container-lowest px-5 pb-8 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant/60" />
        <div className="flex items-center justify-between">
          <h2 className="text-headline-md">{title}</h2>
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container" type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function App() {
  const { booting, handle, signedIn, claimLater, googleStatus, cancelGoogle, passkeyStatus, cancelPasskey } = useSession();
  const location = useLocation();
  if (!signedIn && passkeyStatus === 'waiting') {
    return <Processing title="Waiting for your passkey" detail="Finish in the browser that just opened, then come back to this screen." onCancel={cancelPasskey} />;
  }
  if (!signedIn && passkeyStatus === 'signing') {
    return <Processing title="Opening your passkey" detail="Checking the passkey from the browser." />;
  }
  if (!signedIn && googleStatus === 'waiting') {
    return <Processing title="Waiting for Google" detail="Sign in with the browser that just opened, then come back to this screen." onCancel={cancelGoogle} />;
  }
  if (!signedIn && googleStatus === 'signing') {
    return <Processing title="Signing you in" detail="Checking your Google account." />;
  }
  if (booting) return <Splash />;
  if (!signedIn) return <Login />;
  if (!handle && !claimLater) return <Claim />;
  return (
    <div className="relative mx-auto h-full w-full max-w-[390px] border-x border-surface-variant bg-background">
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/me" element={<Me />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/send" element={<Send />} />
        <Route path="/collect" element={<Collect />} />
        <Route path="/circles" element={<Circles />} />
        <Route path="/tabs" element={<TabsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastStack />
      <Confirm />
    </div>
  );
}
