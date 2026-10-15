'use client';
import { Bell, ChevronDown, ChevronRight, LayoutGrid, LogOut, Menu, Moon, RefreshCw, CreditCard, Search, Settings, ShieldCheck, Sun, UserCircle2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useGet, useList } from '@/lib/hooks';
import { BOTTOM, NAV, type NavGroup, type NavItem } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { CommandPalette } from './CommandPalette';
import { Avatar, Loading } from './ui';

export function Logo({ className, sub }: { className?: string; sub?: string }) {
  return (
    <span className={cn('brandrow', className)}>
      <span className="brand-logo"><img src="/hmis-logo.svg" alt="" /></span>
      <span className="min-w-0"><b>JMSURF HMIS</b><small>{sub ?? 'Hospital management'}</small></span>
    </span>
  );
}

export function PoweredBy({ className }: { className?: string }) {
  return <div className={cn('powered', className)}>JMSURF HMIS · Powered by <b>JMSURF TECHNOLOGIES</b></div>;
}

const BUBBLES: [number, number, number, number][] = [[-4, 8, 220, 0], [86, -6, 260, 3], [70, 62, 180, 6], [8, 74, 140, 9], [42, 88, 110, 4], [94, 40, 90, 11]];
const isActive = (path: string, href: string) => (href === '/admin' || href === '/platform' ? path === href : path === href || path.startsWith(href + '/'));
function readClosed(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem('hmis.nav.closed') || '{}'); } catch { return {}; } }

function FacilitySwitcher() {
  const { facilityId, setFacility, user, hasRole } = useAuth();
  const { data } = useList<any>('/admin/facilities', {}, hasRole('MANAGER', 'RECEPTION', 'DOCTOR', 'NURSE', 'CASHIER'));
  const list = (data?.data ?? []).filter((f: any) => !user?.facilityIds?.length || user.facilityIds.includes(f.id) || user.roles.includes('ADMIN'));
  if (list.length < 2) return null;
  return (
    <select className="fac-select hide-sm" value={facilityId ?? ''} onChange={(e) => { setFacility(e.target.value); window.location.reload(); }} aria-label="Facility">
      {list.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}

function UserMenu() {
  const { user, logout } = useAuth(); const { dark, toggle } = useTheme(); const router = useRouter();
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`.trim();
  const role = (user.roles[0] ?? '').replace(/_/g, ' ').toLowerCase();
  return (
    <div className="relative" ref={ref}>
      <button className="profile-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={name} size={36} />
        <span className="profile-txt hide-sm"><b>{name}</b><small>{role}{user.roles.length > 1 ? ` +${user.roles.length - 1}` : ''}</small></span>
        <ChevronDown className="hide-sm h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <div className="flex items-center gap-3 px-2.5 py-2"><Avatar name={name} size={38} /><div className="min-w-0"><b className="block truncate">{name}</b><span className="block truncate text-xs text-slate-500">{user.email}</span></div></div>
          {user.tenant?.name && <div className="px-2.5 pb-2 text-xs text-slate-500">{user.tenant.name}</div>}
          <div className="divider" style={{ margin: '4px 0' }} />
          <button onClick={() => { setOpen(false); router.push('/account'); }}><UserCircle2 />My account</button>
          {user.roles.includes('ADMIN') && <button onClick={() => { setOpen(false); router.push('/admin'); }}><Settings />Facility settings</button>}
          {user.isSuperAdmin && <button onClick={() => { setOpen(false); router.push(window.location.pathname.startsWith('/platform') ? '/dashboard' : '/platform'); }}><ShieldCheck />{typeof window !== 'undefined' && window.location.pathname.startsWith('/platform') ? 'Back to my facility' : 'Platform console'}</button>}
          <button onClick={toggle}>{dark ? <Sun /> : <Moon />}{dark ? 'Light mode' : 'Dark mode'}</button>
          <button onClick={logout} style={{ color: 'var(--bad)' }}><LogOut style={{ color: 'var(--bad)' }} />Sign out</button>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { data } = useGet<any>('/reports/dashboard');
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const items = [
    data?.lowStockCount ? { href: '/inventory', title: `${data.lowStockCount} item${data.lowStockCount === 1 ? '' : 's'} below reorder level`, body: 'Raise a requisition before they run out.' } : null,
    data?.claimsPending?.count ? { href: '/claims', title: `${data.claimsPending.count} claim${data.claimsPending.count === 1 ? '' : 's'} pending`, body: 'Submit or follow up with the payer.' } : null,
  ].filter(Boolean) as { href: string; title: string; body: string }[];
  return (
    <div className="relative" ref={ref}>
      <button className="iconbtn" aria-label="Notifications" onClick={() => setOpen(!open)}><Bell className="h-4 w-4" />{items.length > 0 && <span className="dot-count">{items.length}</span>}</button>
      {open && (
        <div className="menu-pop" style={{ width: 340 }}>
          <div className="px-2.5 py-2 font-bold">Alerts</div>
          {items.length === 0 && <p className="m-0 px-2.5 pb-3 text-sm text-slate-500">You are all caught up.</p>}
          {items.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}><b className="text-[13px]">{n.title}</b><span className="text-xs text-slate-500">{n.body}</span></Link>)}
        </div>
      )}
    </div>
  );
}

/** Staff shell. The platform console passes its own nav, home link, bottom bar and subtitle. */
/** Trial ending, payment due or read-only: one line above every page, with a link for those who can pay. */
function SubscriptionBanner() {
  const { user, hasRole } = useAuth();
  const { data: s } = useGet<any>(user?.tenantId ? '/subscription' : null);
  if (!s || s.managed) return null;
  const d = s.daysLeft ?? 0;
  const msg = s.status === 'READ_ONLY' ? 'The subscription has lapsed, so the system is read-only. Pay to restore full access.'
    : s.status === 'GRACE' ? `Payment is due. The system becomes read-only on ${new Date(s.readOnlyAt ?? Date.now()).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}.`
    : s.status === 'TRIAL' && d <= 7 ? `Your free trial ends in ${Math.max(d, 0)} day${d === 1 ? '' : 's'}. Choose a plan to keep going.` : null;
  if (!msg) return null;
  return <div className={cn('alert mb-4 no-print', s.status === 'TRIAL' ? 'info' : s.status === 'GRACE' ? 'warn' : 'bad')}><CreditCard /><span className="flex-1">{msg}</span>{hasRole('ADMIN', 'ACCOUNTANT') && <Link href="/admin/subscription" className="btn sm">Open subscription</Link>}</div>;
}

export function AppShell({ children, nav = NAV, home = '/dashboard', bottomNav = BOTTOM, sub }: { children: React.ReactNode; nav?: NavGroup[]; home?: string; bottomNav?: string[]; sub?: string }) {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter(); const path = usePathname();
  const [mobile, setMobile] = useState(false); const [palette, setPalette] = useState(false); const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({}); const [refresh, setRefresh] = useState(0);
  const contentRef = useRef<HTMLElement>(null);
  useEffect(() => setClosed(readClosed()), []);
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [loading, user, router, path]);
  useEffect(() => { setMobile(false); contentRef.current?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); }, [path]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  const groups = useMemo(() => nav.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || hasRole(...i.roles)) })).filter((g) => g.items.length), [hasRole, nav]);
  const all = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))), [groups]);
  if (loading || !user) return <div className="grid min-h-screen place-items-center"><div className="w-72"><Loading rows={3} /></div></div>;

  const current = [...all].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(path, i.href));
  const f = filter.trim().toLowerCase();
  const shown = f ? groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(f) || g.label.toLowerCase().includes(f)) })).filter((g) => g.items.length) : groups;
  const toggleGroup = (t: string) => setClosed((c) => { const n = { ...c, [t]: !c[t] }; try { localStorage.setItem('hmis.nav.closed', JSON.stringify(n)); } catch { /* private mode */ } return n; });
  const bottom: NavItem[] = bottomNav.map((h) => all.find((i) => i.href === h)).filter(Boolean).slice(0, 4) as NavItem[];
  const moreActive = !bottom.some((i) => isActive(path, i.href));

  return (
    <div className="app">
      <div className="glass-bubbles" aria-hidden>{BUBBLES.map(([l, t, s, d]) => <span key={`${l}-${t}`} style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, animationDelay: `-${d}s` }} />)}</div>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
      <aside className={cn('side no-print', mobile && 'open')}>
        <div className="side-head"><Link href={home} className="min-w-0 flex-1 text-inherit no-underline" style={{ color: 'inherit' }}><Logo sub={sub ?? user.tenant?.name ?? 'Hospital management'} /></Link>
          <button className="side-close" onClick={() => setMobile(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
        <div className="side-search"><Search className="h-3.5 w-3.5" /><input placeholder="Find a page" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a page" /><kbd>Ctrl K</kbd></div>
        <div className="side-scroll">
          {shown.map((g) => {
            const isClosed = !f && closed[g.label] && !g.items.some((i) => isActive(path, i.href));
            return (
              <div key={g.label} className="navsec">
                <button type="button" className={cn('navgroup', isClosed && 'closed')} onClick={() => toggleGroup(g.label)}><span>{g.label}</span><ChevronDown className="h-3 w-3" /></button>
                {!isClosed && g.items.map((i) => (
                  <Link key={i.href} href={i.href} prefetch={false} className={cn('navlink', isActive(path, i.href) && 'on')}>
                    <span className="ni"><i.icon className="h-5 w-5" /></span><span className="nl">{i.label}</span>{i.pill && <span className="pill">{i.pill}</span>}
                  </Link>
                ))}
              </div>
            );
          })}
          {shown.length === 0 && <p className="px-3 text-sm text-slate-500">No page matches &quot;{filter}&quot;.</p>}
        </div>
        <div className="side-foot"><PoweredBy /></div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <button className="iconbtn burger" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="crumbs">
            <span className="crumb-title">{current?.label ?? 'JMSURF HMIS'}</span>
            <span className="crumb-path">{current && <><span>{current.group}</span><ChevronRight className="h-3.5 w-3.5" /></>}<b>{current?.label ?? 'JMSURF HMIS'}</b></span>
          </div>
          <button className="cmdk-btn" onClick={() => setPalette(true)}><Search className="h-4 w-4" /><span>Search patients, pages and actions</span><kbd>Ctrl K</kbd></button>
          <button className="iconbtn search-sm" onClick={() => setPalette(true)} aria-label="Search"><Search className="h-4 w-4" /></button>
          <FacilitySwitcher />
          <button className="iconbtn hide-sm" title="Refresh" aria-label="Refresh this page" onClick={() => setRefresh((r) => r + 1)}><RefreshCw className="h-4 w-4" /></button>
          <Notifications />
          <UserMenu />
        </header>
        <main className="content" ref={contentRef}>{!path.startsWith('/platform') && <SubscriptionBanner />}<div className="page" key={`${path}-${refresh}`}>{children}</div></main>
      </div>
      <nav className="notch-nav lg-hide no-print" aria-label="Main">
        {bottom.map((i) => <Link key={i.href} href={i.href} className={cn('notch-item', isActive(path, i.href) && 'is-active')}><span className="notch-ico"><i.icon /></span><span>{i.short ?? i.label}</span></Link>)}
        <button type="button" className={cn('notch-item', moreActive && 'is-active')} onClick={() => setMobile(true)}><span className="notch-ico"><LayoutGrid /></span><span>More</span></button>
      </nav>
      <CommandPalette open={palette} setOpen={setPalette} pages={all} />
    </div>
  );
}
