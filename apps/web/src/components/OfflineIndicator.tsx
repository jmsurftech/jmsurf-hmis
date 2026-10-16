'use client';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { facilityStore, tokenStore } from '@/lib/api';
import { OutboxItem, outboxList, outboxRemove, syncOutbox } from '@/lib/offline';
import { cn } from '@/lib/cn';

/** Registers the service worker (production builds only). */
export function usePwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
}

const authHeaders = (): Record<string, string> => {
  const h: Record<string, string> = {};
  const t = tokenStore.get(); if (t) h.Authorization = `Bearer ${t}`;
  const f = facilityStore.get(); if (f) h['X-Facility-Id'] = f;
  return h;
};

/** Top-bar online/offline + pending-sync indicator; replays the outbox on reconnect. */
export function OfflineIndicator() {
  usePwaRegister();
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { outboxList().then(setItems).catch(() => undefined); }, []);
  const sync = useCallback(async () => { setBusy(true); try { await syncOutbox(authHeaders); } finally { setBusy(false); refresh(); } }, [refresh]);
  useEffect(() => {
    setOnline(navigator.onLine); refresh();
    const on = () => { setOnline(true); void sync(); }, off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('outbox-change', refresh);
    const t = setInterval(() => { if (navigator.onLine) void sync(); }, 30_000);
    void sync();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('outbox-change', refresh); clearInterval(t); };
  }, [refresh, sync]);
  const pending = items.filter((i) => i.status === 'PENDING').length, failed = items.filter((i) => i.status === 'FAILED').length;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title={online ? 'Online' : 'Offline: changes are saved on this device'}
        className={cn('flex items-center gap-1 rounded-lg border px-2 py-1 text-xs', online ? 'border-slate-200 text-slate-500 dark:border-slate-700' : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200')}>
        {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{online ? 'Online' : 'Offline'}</span>
        {pending + failed > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-semibold text-white', failed ? 'bg-red-600' : 'bg-amber-500')}>{pending + failed}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">{pending} pending · {failed} failed</span>
            <button className="btn-secondary px-2 py-0.5" disabled={busy || !online} onClick={sync}><RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />Sync</button>
          </div>
          {items.length === 0 ? <p className="text-slate-500">Everything is synced.</p> : (
            <ul className="max-h-64 space-y-1 overflow-auto">{items.map((i) => (
              <li key={i.id} className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
                <div className="flex justify-between"><span>{i.label}</span><span className={i.status === 'FAILED' ? 'text-red-600' : 'text-amber-600'}>{i.status}</span></div>
                <div className="text-slate-500">{new Date(i.createdAt).toLocaleTimeString()}</div>
                {i.error && <div className="mt-0.5 break-words text-red-600">{i.error}</div>}
                {i.status === 'FAILED' && <button className="mt-1 text-[10px] underline" onClick={() => outboxRemove(i.id)}>Discard</button>}
              </li>))}</ul>)}
          <p className="mt-2 text-[10px] text-slate-400">Offline: patient registration, visits, vitals, notes and cash receipts are saved on this device and sent automatically when you reconnect.</p>
        </div>)}
    </div>
  );
}
