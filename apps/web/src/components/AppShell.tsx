'use client';
import { HeartPulse, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useList } from '@/lib/hooks';
import { NAV } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { CommandPalette } from './CommandPalette';
import { Loading } from './ui';

export function Logo({ className }: { className?: string }) {
  return <span className={cn('flex items-center gap-2 font-semibold', className)}><span className="rounded-lg bg-gradient-to-br from-primary-500 to-brand-blue p-1.5 text-white"><HeartPulse className="h-4 w-4" /></span>JMSURF <span className="text-primary-600 dark:text-primary-400">HMIS</span></span>;
}

function FacilitySwitcher() {
  const { facilityId, setFacility, user } = useAuth();
  const { data } = useList<any>('/facilities', { pageSize: 100 });
  const list = (data?.data ?? []).filter((f: any) => !user?.facilityIds?.length || user.facilityIds.includes(f.id) || user.roles.includes('ADMIN'));
  if (!list.length) return null;
  return (
    <select className="input w-auto max-w-[12rem] py-1.5" value={facilityId ?? ''} onChange={(e) => { setFacility(e.target.value); window.location.reload(); }} aria-label="Facility">
      {list.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasRole } = useAuth();
  const router = useRouter(); const path = usePathname();
  const { dark, toggle } = useTheme();
  const [mobile, setMobile] = useState(false); const [palette, setPalette] = useState(false);
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [loading, user, router, path]);
  useEffect(() => setMobile(false), [path]);
  const groups = useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || hasRole(...i.roles)) })).filter((g) => g.items.length), [hasRole]);
  if (loading || !user) return <div className="flex h-screen items-center justify-center"><Loading /></div>;

  const isActive = (href: string) => href === '/admin' ? path === '/admin' : path === href || path.startsWith(href + '/');
  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800"><Link href="/dashboard"><Logo /></Link>
        <button className="lg:hidden" onClick={() => setMobile(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', isActive(i.href) ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800')}>
                <i.icon className="h-4 w-4" />{i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 p-3 text-xs dark:border-slate-800">
        <p className="font-medium">{user.firstName} {user.lastName}</p>
        <p className="truncate text-slate-500">{user.roles.join(', ')}</p>
      </div>
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">{sidebar}</aside>
      {mobile && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobile(false)} /><aside className="absolute inset-y-0 left-0 w-64 bg-white dark:bg-slate-900">{sidebar}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/90">
          <button className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <button onClick={() => setPalette(true)} className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-left text-sm text-slate-400 sm:max-w-md dark:border-slate-700">
            <Search className="h-4 w-4" /><span className="flex-1 truncate">Search patients…</span><kbd className="hidden rounded border px-1.5 text-[10px] sm:inline dark:border-slate-700">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:block"><FacilitySwitcher /></span>
            <button className="btn-secondary px-2" onClick={toggle} aria-label="Toggle theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <button className="btn-secondary px-2" onClick={logout} aria-label="Log out"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-6">{children}</main>
      </div>
      <CommandPalette open={palette} setOpen={setPalette} />
    </div>
  );
}
