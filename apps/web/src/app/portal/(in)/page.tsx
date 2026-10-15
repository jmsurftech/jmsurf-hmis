'use client';
import { CalendarDays, CalendarPlus, FlaskConical, Pill, Receipt } from 'lucide-react';
import Link from 'next/link';
import { Card, EmptyState, ErrorNote, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { dateTime, money } from '@/lib/format';
import { usePortal } from '@/lib/portal';

export default function PortalHome() {
  const me = usePortal('/me'); const s = usePortal('/summary');
  const p = me.data?.patient; const cur = me.data?.hospital?.currency ?? 'KES';
  const next = s.data?.nextAppointment;
  return (
    <div>
      <PageHeader eyebrow={<span className="badge brand">Patient portal</span>} title={p ? `Hello, ${p.firstName}` : 'Hello'} subtitle={p ? `Hospital number ${p.mrn}` : undefined}
        actions={<Link href="/portal/bookings?new=1" className="btn primary"><CalendarPlus />Book a visit</Link>} />
      <ErrorNote error={me.error || s.error} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Next booking" value={next ? new Date(next.startAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' }) : 'None'} hint={next ? dateTime(next.startAt) : 'Book online any time'} icon={CalendarDays} loading={s.isLoading} href="/portal/bookings" />
        <StatCard label="Results ready" value={s.data?.results} icon={FlaskConical} tone="blue" loading={s.isLoading} href="/portal/results" />
        <StatCard label="Prescriptions" value={s.data?.prescriptions} icon={Pill} tone="teal" loading={s.isLoading} href="/portal/medicines" />
        <StatCard label="Balance to pay" value={money(s.data?.balanceMinor, cur)} icon={Receipt} tone={s.data?.balanceMinor ? 'amber' : 'green'} loading={s.isLoading} href="/portal/bills" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your next visit">
          {next ? <div className="flex items-start justify-between gap-3"><div><b className="block text-lg">{dateTime(next.startAt)}</b><p className="m-0 text-sm text-slate-500">{next.reason}</p></div><StatusBadge status={next.status} /></div>
            : <EmptyState icon={CalendarDays} title="No upcoming bookings" action={<Link href="/portal/bookings?new=1" className="btn primary sm"><CalendarPlus />Book a visit</Link>} />}
        </Card>
        <Card title="About you">
          {p ? <dl className="kv2">
            {[['Phone', p.phone], ['Email', p.email], ['Blood group', p.bloodGroup], ['SHA number', p.shaNumber],
              ['Allergies', p.allergies?.length ? p.allergies.map((a: any) => a.substance).join(', ') : 'None recorded'],
              ['Cover', p.covers?.length ? p.covers.map((c: any) => `${c.scheme?.payer?.name ?? ''} ${c.scheme?.name ?? ''}`.trim()).join(', ') : 'Cash']]
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="muted">—</span>}</dd></div>)}
          </dl> : null}
          <p className="m-0 mt-3 text-xs text-slate-500">To change these details, ask the hospital front desk.</p>
        </Card>
      </div>
    </div>
  );
}
