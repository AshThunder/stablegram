import type { ReactNode } from 'react';

export function Icon({ name, className = '', filled }: { name: string; className?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}>{name}</span>;
}

export function Avatar({ name, className = 'h-10 w-10' }: { name: string; className?: string }) {
  const letter = (name.replace(/^@/, '')[0] || '?').toUpperCase();
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-surface-container-high text-sm font-bold text-primary ${className}`}>
      {letter}
    </span>
  );
}

export function Mark({ size = 80 }: { size?: number }) {
  return <img src="/stablegram-logo.jpg" alt="" width={size} height={size} className="rounded-[22%]" style={{ width: size, height: size }} />;
}

export function Splash() {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-[390px] flex-col items-center justify-center bg-background" aria-busy="true">
      <div className="splash-in">
        <Brand subtitle="Pay friends in Telegram" />
      </div>
      <p className="absolute bottom-12 text-[12px] font-extrabold uppercase tracking-widest text-outline">USDC on Arc</p>
    </div>
  );
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center">
      <Mark />
      <h1 className="mt-4 text-[40px] font-bold leading-none tracking-tight text-logo">Stablegram</h1>
      {subtitle ? <p className="mt-2 max-w-[280px] text-center text-body-md text-on-surface-variant">{subtitle}</p> : null}
    </div>
  );
}

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[390px] flex-col bg-background">
      <div className="flex flex-col items-center bg-[#e7f6fe] px-container-padding pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <Brand subtitle="Pay friends in Telegram" />
      </div>
      <div className="flex flex-1 flex-col px-container-padding pb-8 pt-6">{children}</div>
    </div>
  );
}

export function SignedInReturn() {
  return (
    <AuthFrame>
      <div className="flex flex-1 flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-logo text-white">
          <Icon name="check" className="text-[36px]" />
        </span>
        <h2 className="mt-5 text-[28px] font-bold leading-tight text-logo">You're signed in</h2>
        <p className="mt-2 max-w-[300px] text-body-md text-on-surface-variant">This page is done. Finish in Telegram.</p>
        <ol className="mt-6 w-full space-y-3 text-left">
          <li className="flex gap-3 rounded-2xl bg-surface-container-low px-4 py-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-logo text-sm font-bold text-white">1</span>
            <span>
              <span className="block font-semibold text-on-surface">Switch back to Telegram</span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">Leave this browser. You can close it.</span>
            </span>
          </li>
          <li className="flex gap-3 rounded-2xl bg-surface-container-low px-4 py-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-logo text-sm font-bold text-white">2</span>
            <span>
              <span className="block font-semibold text-on-surface">Open Stablegram</span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">The chat you just left will finish signing you in.</span>
            </span>
          </li>
        </ol>
      </div>
    </AuthFrame>
  );
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9A9 9 0 0 0 0 9c0 1.4.3 2.8.9 4l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}
