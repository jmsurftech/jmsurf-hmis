'use client';
import { CalendarDays, FlaskConical, History, Home, LogOut, Pill, Receipt, UserCircle2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PoweredBy } from '@/components/AppShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar, Loading } from '@/components/ui';
import { cn } from '@/lib/cn';
import { portalStore, type PortalAccount } from '@/lib/portal';

const TABS = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/portal/results', label: 'Results', icon: FlaskConical },
  { href: '/portal/medicines', label: 'Medicines', icon: Pill },
  { href: '/portal/bills', label: 'Bills', icon: Receipt },
  { href: '/portal/visits', label: 'Visits', icon: History },
  { href: '/portal/account', label: 'Account', icon: UserCircle2 },
];
const BOTTOM = ['/portal', '/portal/bookings', '/portal/results', '/portal/bills'];
const on = (path: string, href: string) => (href === '/portal' ? path === href : path.startsWith(href));

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const path = usePathname(); const [acct, setAcct] = useState<PortalAccount | null | undefined>(undefined);
  useEffect(() => { const a = portalStore.get(); if (!a) router.replace('/portal/login'); setAcct(a); }, [router]);
  if (!acct) return <div className="grid min-h-screen place-items-center"><div className="w-72"><Loading rows={3} /></div></div>;
  const name = `${acct.patient.firstName} ${acct.patient.lastName}`;
  const signOut = () => { portalStore.clear(); router.replace('/portal/login'); };
  return (
    <div className="portal min-h-screen">
      <div className="glass-bubbles" aria-hidden>{[[-4, 8, 220, 0], [86, -6, 260, 3], [70, 62, 180, 6]].map(([l, t, s, d]) => <span key={`${l}-${t}`} style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, animationDelay: `-${d}s` }} />)}</div>
      <header className="portal-top no-print">
        <Link href="/portal" className="flex min-w-0 items-center gap-3 text-inherit no-underline">
          <span className="brand-logo grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow"><img src={acct.hospital.logoUrl || '/hmis-logo.svg'} alt="" className="h-7 w-7" /></span>
          <span className="min-w-0"><b className="block truncate">{acct.hospital.name}</b><small className="block truncate text-slate-500">Patient portal</small></span>
        </Link>
        <nav className="portal-tabs hide-sm" aria-label="Portal">{TABS.map((t) => <Link key={t.href} href={t.href} className={cn('tab', on(path, t.href) && 'on')}><t.icon className="h-4 w-4" />{t.label}</Link>)}</nav>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Link href="/portal/account" className="hidden items-center gap-2 text-inherit no-underline sm:flex"><Avatar name={name} size={34} /><span className="hidden text-sm font-bold lg:block">{acct.patient.firstName}</span></Link>
          <button className="iconbtn" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>
      <main className="portal-main"><div className="page" key={path}>{children}</div><PoweredBy className="mt-10" /></main>
      <nav className="notch-nav lg-hide no-print" aria-label="Portal">
        {BOTTOM.map((h) => { const t = TABS.find((x) => x.href === h)!; return <Link key={h} href={h} className={cn('notch-item', on(path, h) && 'is-active')}><span className="notch-ico"><t.icon /></span><span>{t.label}</span></Link>; })}
        <Link href="/portal/account" className={cn('notch-item', ['/portal/medicines', '/portal/visits', '/portal/account'].some((h) => on(path, h)) && 'is-active')}><span className="notch-ico"><UserCircle2 /></span><span>More</span></Link>
      </nav>
    </div>
  );
}
