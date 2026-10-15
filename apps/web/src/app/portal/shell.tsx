'use client';
import { CalendarDays, FlaskConical, Home, LogOut, Receipt, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { portalStore, usePortal } from '@/lib/portal';
import { usePwaRegister } from '@/components/OfflineIndicator';
import { PortalLogin } from './login';

const TABS = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/appointments', label: 'Visits', icon: CalendarDays },
  { href: '/portal/results', label: 'Results', icon: FlaskConical },
  { href: '/portal/bills', label: 'Bills', icon: Receipt },
  { href: '/portal/me', label: 'Me', icon: User },
];

function FamilySwitcher() {
  const qc = useQueryClient();
  const { data } = usePortal<any[]>('/portal/family', {}, false);
  const [sel, setSel] = useState<string>('');
  useEffect(() => { setSel(portalStore.subject() ?? ''); }, []);
  if (!data || data.length < 2) return null;
  return (
    <select className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs text-white" value={sel}
      onChange={(e) => { portalStore.setSubject(e.target.value || null); setSel(e.target.value); qc.invalidateQueries({ queryKey: ['portal'] }); }}>
      {data.map((p) => <option key={p.id} value={p.isAccountHolder ? '' : p.id} className="text-slate-900">{p.firstName}{p.isAccountHolder ? ' (me)' : ''}</option>)}
    </select>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  usePwaRegister();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => { setAuthed(!!portalStore.token()); setReady(true); }, []);
  const me = usePortal<any>(authed ? '/portal/me' : null, {}, false);
  if (!ready) return null;
  if (!authed) return <PortalLogin onDone={() => setAuthed(true)} />;
  const color = me.data?.tenant?.primaryColor || '#0d7c80';
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 text-white" style={{ background: color }}>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{me.data?.tenant?.name ?? 'Patient portal'}</p><p className="truncate text-xs opacity-80">Hello, {me.data?.firstName ?? '…'}</p></div>
        <FamilySwitcher />
        <button aria-label="Log out" onClick={() => { portalStore.clear(); setAuthed(false); }}><LogOut className="h-5 w-5" /></button>
      </header>
      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((t) => { const active = t.href === '/portal' ? path === '/portal' : path?.startsWith(t.href); return (
          <Link key={t.href} href={t.href} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]', active ? 'text-primary-600' : 'text-slate-500')}>
            <t.icon className="h-5 w-5" />{t.label}</Link>); })}
      </nav>
    </div>
  );
}
