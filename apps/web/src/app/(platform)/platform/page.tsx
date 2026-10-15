'use client';
import { AlertTriangle, Building2, CalendarClock, PauseCircle, Stethoscope, Users } from 'lucide-react';
import Link from 'next/link';
import { AreaTrend, Donut } from '@/components/charts';
import { Card, EmptyState, ErrorNote, PageHeader, StatCard, StatusBadge, humanize } from '@/components/ui';
import { date } from '@/lib/format';
import { useGet } from '@/lib/hooks';
import { daysLeft } from '@/lib/platform';

const row = 'flex items-center justify-between gap-3 px-5 py-3 text-inherit no-underline hover:bg-black/[.03] dark:hover:bg-white/5';

export default function PlatformOverview() {
  const { data: d, isLoading, error } = useGet<any>('/platform/overview');
  const byStatus = Object.entries(d?.byStatus ?? {}).map(([k, v]) => ({ name: humanize(k), value: v }));
  return (
    <div>
      <PageHeader eyebrow={<span className="badge brand">JMSURF platform</span>} title="Platform overview" subtitle="Every hospital on JMSURF HMIS: subscriptions, trials and usage." actions={<Link href="/platform/tenants" className="btn primary"><Building2 />All tenants</Link>} />
      <ErrorNote error={error} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tenants" value={d?.tenants} hint={d ? `${d.newTenants30d} new in 30 days` : undefined} icon={Building2} loading={isLoading} href="/platform/tenants" />
        <StatCard label="Active staff users" value={d?.users} icon={Users} tone="blue" loading={isLoading} />
        <StatCard label="Visits, last 30 days" value={d?.visits30d?.toLocaleString()} hint={d ? `${d.patients.toLocaleString()} patients on file` : undefined} icon={Stethoscope} tone="green" loading={isLoading} />
        <StatCard label="Suspended" value={d?.suspended} icon={PauseCircle} tone="red" loading={isLoading} href="/platform/tenants?status=SUSPENDED" />
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card title="New tenants" subtitle="Sign-ups per day, last 30 days" className="lg:col-span-2">
          {d?.signups?.length ? <AreaTrend data={d.signups} x="day" areas={[{ key: 'count', label: 'Sign-ups' }]} height={240} /> : <EmptyState title="No sign-ups in the last 30 days" />}
        </Card>
        <Card title="Subscription status">{byStatus.length ? <Donut data={byStatus} nameKey="name" valueKey="value" height={240} /> : <EmptyState title="No tenants yet" />}</Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-600" />Trials ending within 7 days</span>} flush>
          {d?.trialEnding?.length ? <ul className="divide-y divide-slate-200/70 dark:divide-white/10">{d.trialEnding.map((t: any) => {
            const n = daysLeft(t.trialEndsAt) ?? 0;
            return <li key={t.id}><Link href={`/platform/tenants?open=${t.id}`} className={row}>
              <span className="min-w-0"><b className="block truncate">{t.name}</b><small className="text-slate-500">{humanize(t.plan)} · ends {date(t.trialEndsAt)}</small></span>
              <span className={`badge ${n <= 0 ? 'red' : 'amber'}`}>{n <= 0 ? 'Ended' : `${n} day${n === 1 ? '' : 's'}`}</span></Link></li>;
          })}</ul> : <EmptyState icon={AlertTriangle} title="No trials ending soon" />}
        </Card>
        <Card title="Latest sign-ups" flush>
          {d?.recent?.length ? <ul className="divide-y divide-slate-200/70 dark:divide-white/10">{d.recent.map((t: any) => (
            <li key={t.id}><Link href={`/platform/tenants?open=${t.id}`} className={row}>
              <span className="min-w-0"><b className="block truncate">{t.name}</b><small className="text-slate-500">{humanize(t.plan)} · joined {date(t.createdAt)}</small></span><StatusBadge status={t.subscriptionStatus} /></Link></li>))}</ul>
            : <EmptyState title="No tenants yet" message="Hospitals appear here when they sign up." />}
        </Card>
      </div>
    </div>
  );
}
