'use client';
import { CornerDownLeft, Search, User, UserPlus, Megaphone, CalendarPlus, Receipt, Pill } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useList } from '@/lib/hooks';
import { age, fullName } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { NavItem } from '@/lib/nav';
import { useDebounced } from './DataTable';
import { Spinner } from './ui';

const ACTIONS = [
  { label: 'Register a patient', href: '/patients/new', icon: UserPlus, hint: 'Front office' },
  { label: 'Call next patient', href: '/queue', icon: Megaphone, hint: 'Queue' },
  { label: 'Book an appointment', href: '/appointments', icon: CalendarPlus, hint: 'Front office' },
  { label: 'Take a payment', href: '/cashier', icon: Receipt, hint: 'Revenue' },
  { label: 'Sell over the counter', href: '/pharmacy?tab=otc', icon: Pill, hint: 'Pharmacy' },
];

/** Ctrl K: patients (by name, MRN, phone or ID number), quick actions and every page the user can open. */
export function CommandPalette({ open, setOpen, pages = [] }: { open: boolean; setOpen: (v: boolean) => void; pages?: (NavItem & { group?: string })[] }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q, 250); const router = useRouter(); const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const { data, isFetching } = useList<any>('/patients', { q: dq, pageSize: 6 }, open && dq.length >= 2);
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => ref.current?.focus(), 30); } }, [open]);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pts = (dq.length >= 2 ? data?.data ?? [] : []).map((p: any) => ({ kind: 'Patients', label: fullName(p), href: `/patients/${p.id}`, icon: User, hint: `${p.mrn} · ${p.sex ?? ''} · ${age(p.dateOfBirth)}` }));
    const acts = ACTIONS.filter((a) => !s || a.label.toLowerCase().includes(s)).map((a) => ({ kind: 'Actions', ...a }));
    const pgs = pages.filter((p) => !s || `${p.label} ${p.group ?? ''}`.toLowerCase().includes(s)).map((p) => ({ kind: 'Pages', label: p.label, href: p.href, icon: p.icon, hint: p.group ?? '' }));
    return [...pts, ...acts, ...pgs].slice(0, 30);
  }, [q, dq, data, pages]);
  useEffect(() => setI(0), [q, items.length]);
  if (!open || typeof document === 'undefined') return null;
  const go = (href: string) => { setOpen(false); router.push(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter' && items[i]) go(items[i].href);
    else if (e.key === 'Escape') setOpen(false);
  };
  let last = '';
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk" role="dialog" aria-modal aria-label="Search">
        <div className="cmdk-in"><Search /><input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search patients by name, MRN, phone or ID - or type a page" />{isFetching && <Spinner />}</div>
        <div className="cmdk-list">
          {items.length === 0 && <p className="m-0 p-4 text-sm text-slate-500">{dq.length >= 2 && !isFetching ? 'No patient or page matches.' : 'Type to search.'}</p>}
          {items.map((x, n) => {
            const head = x.kind !== last ? <div className="cmdk-sec">{x.kind}</div> : null; last = x.kind;
            const I = x.icon;
            return <div key={x.kind + x.href + x.label}>{head}<button className={cn('cmdk-item', n === i && 'on')} onMouseEnter={() => setI(n)} onClick={() => go(x.href)}><span className="ni"><I /></span><span className="truncate">{x.label}</span>{n === i ? <small><CornerDownLeft className="h-3 w-3" /></small> : <small>{x.hint}</small>}</button></div>;
          })}
        </div>
      </div>
    </div>, document.body);
}
