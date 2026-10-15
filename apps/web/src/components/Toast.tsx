'use client';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Modal } from './ui';

/** System messages (success / failure / warning / info) and in-app confirm prompts - never browser alerts. */
type Kind = 'success' | 'error' | 'info' | 'warn';
type T = { id: number; msg: string; kind: Kind };
type ConfirmOpts = { title: string; message?: React.ReactNode; confirm?: string; danger?: boolean };
const Ctx = createContext<{ push: (m: string, k?: Kind) => void; confirm: (o: ConfirmOpts) => Promise<boolean> }>({ push: () => {}, confirm: async () => false });
const ICON = { success: CheckCircle2, error: XCircle, warn: AlertTriangle, info: Info };
const CLS = { success: 'ok', error: 'err', warn: 'warn', info: '' };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const [ask, setAsk] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | undefined>(undefined);
  const push = useCallback((msg: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i.slice(-3), { id, msg, kind }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 4000);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((res) => { resolver.current = res; setAsk(o); }), []);
  const done = (v: boolean) => { resolver.current?.(v); setAsk(null); if (!v) push('Cancelled', 'info'); };
  return (
    <Ctx.Provider value={{ push, confirm }}>
      {children}
      <div className="toasts no-print" aria-live="polite">
        {items.map((t) => { const I = ICON[t.kind]; return <div key={t.id} className={cn('toast', CLS[t.kind])}><I />{t.msg}</div>; })}
      </div>
      <Modal open={!!ask} onClose={() => done(false)} title={ask?.title ?? ''}
        footer={<><button className="btn" onClick={() => done(false)}>Cancel</button><button className={cn('btn', ask?.danger ? 'danger' : 'primary')} onClick={() => done(true)} autoFocus>{ask?.confirm ?? 'Confirm'}</button></>}>
        <div className="text-[14.5px] text-slate-600 dark:text-slate-300">{ask?.message ?? 'Are you sure?'}</div>
      </Modal>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
export const useConfirm = () => useContext(Ctx).confirm;
