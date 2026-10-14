type Tg = {
  ready: () => void;
  expand: () => void;
  initData?: string;
  initDataUnsafe?: { user?: { id?: number } };
  openLink?: (url: string) => void;
  HapticFeedback?: {
    notificationOccurred: (type: 'success' | 'error' | 'warning') => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
};

export function telegram(): Tg | null {
  const w = window as Window & { Telegram?: { WebApp?: Tg } };
  return w.Telegram?.WebApp ?? null;
}

export function haptic(kind: 'success' | 'error') {
  telegram()?.HapticFeedback?.notificationOccurred(kind);
}

export function telegramUserId() {
  const tg = telegram();
  const direct = tg?.initDataUnsafe?.user?.id;
  if (typeof direct === 'number') return String(direct);
  const user = new URLSearchParams(tg?.initData || '').get('user');
  if (!user) return '';
  try {
    const parsed = JSON.parse(user) as { id?: number };
    return typeof parsed.id === 'number' ? String(parsed.id) : '';
  } catch {
    return '';
  }
}

export function inTelegram() {
  return Boolean(telegram()?.initData);
}
