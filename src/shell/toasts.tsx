import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { haptic } from '@/lib/telegram';
import { Icon } from '@/ui/mark';

export type ToastKind = 'success' | 'error' | 'pending';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
};

type Api = {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'> & { id?: string }) => string;
  update: (id: string, patch: Partial<Toast>) => void;
  dismiss: (id: string) => void;
};

const Ctx = createContext<Api | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'> & { id?: string }) => {
      const id = toast.id ?? `t-${++seq}`;
      setToasts((list) => {
        const rest = list.filter((t) => t.id !== id);
        return [{ ...toast, id }, ...rest].slice(0, 3);
      });
      if (toast.kind === 'success') haptic('success');
      if (toast.kind === 'error') haptic('error');
      if (toast.kind !== 'pending') {
        window.setTimeout(() => dismiss(id), 4200);
      }
      return id;
    },
    [dismiss],
  );

  const update = useCallback((id: string, patch: Partial<Toast>) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.kind === 'success') haptic('success');
    if (patch.kind === 'error') haptic('error');
    if (patch.kind && patch.kind !== 'pending') {
      window.setTimeout(() => dismiss(id), 4200);
    }
  }, [dismiss]);

  const value = useMemo(() => ({ toasts, push, update, dismiss }), [toasts, push, update, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToasts() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('ToastProvider missing');
  return ctx;
}

export function ToastStack({ className }: { className?: string }) {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className={className ?? 'pointer-events-none absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[390px] flex-col gap-2 px-container-padding'}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-3 py-3 shadow-md ${
            t.kind === 'error'
              ? 'border-error-container bg-error-container/40 text-error'
              : 'border-tertiary/30 bg-surface-container-lowest text-on-surface'
          }`}
        >
          <Icon
            name={t.kind === 'error' ? 'error' : t.kind === 'pending' ? 'schedule' : 'check_circle'}
            filled
            className={`mt-0.5 text-[20px] ${t.kind === 'error' ? 'text-error' : 'text-tertiary'}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm">{t.message}</p>
            {t.action && (
              <button
                className={`mt-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  t.kind === 'error' ? 'bg-error text-on-error' : 'bg-primary text-on-primary'
                }`}
                onClick={t.action.onClick}
                type="button"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button className="text-outline" onClick={() => dismiss(t.id)} type="button" aria-label="Dismiss">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      ))}
    </div>
  );
}
