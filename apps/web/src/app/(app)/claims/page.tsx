'use client';
import { CheckCircle2, Clock, FileCheck2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bars } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { Card, EmptyState, PageHeader, Progress, StatCard, StatusBadge, Tabs, humanize } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, fullName, money } from '@/lib/format';

const STATUSES = ['DRAFT', 'VALIDATED', 'SUBMITTED', 'IN_REVIEW', 'QUERIED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'RECONCILED'];
export default function Claims() {
  const router = useRouter(); const [status, setStatus] = useState('');
  const { data: s, isLoading } = useGet<any>('/claims/dashboard');
  const by: Record<string, { count: number; totalMinor: number; approvedMinor: number; paidMinor: number }> = s?.byStatus ?? {};
  const counts: Record<string, number> = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.count]));
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const ageing = Object.entries(s?.ageing ?? {}).map(([bucket, a]: [string, any]) => ({ bucket, amount: (a.outstandingMinor ?? 0) / 100, count: a.count }));
  const outstanding = Object.values(s?.ageing ?? {}).reduce((t: number, a: any) => t + (a.outstandingMinor ?? 0), 0);
  const fpa = s?.firstPassAcceptanceRate;
  return (
    <div>
      <PageHeader title="Claims" subtitle="SHA and insurance claims, from scrubbing to remittance. Open a claim to fix issues, submit or follow it up." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="First-pass acceptance" value={fpa != null ? `${fpa}%` : '—'} icon={CheckCircle2} tone={fpa != null && fpa < 95 ? 'amber' : 'green'} loading={isLoading}
          hint={fpa != null ? <span className="block"><Progress value={fpa} tone={fpa >= 95 ? 'var(--ok)' : 'var(--warn)'} /><span className="mt-1 block">Target 95% or more</span></span> : 'Target 95% or more'} />
        <StatCard label="Outstanding" value={money(outstanding)} icon={Clock} tone="amber" loading={isLoading} />
        <StatCard label="Paid" value={money((by.PAID?.paidMinor ?? 0) + (by.RECONCILED?.paidMinor ?? 0))} icon={FileCheck2} tone="green" loading={isLoading} />
        <StatCard label="Rejected" value={counts.REJECTED ?? 0} icon={XCircle} tone="red" loading={isLoading} hint="Open them to see why" />
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="Ageing of outstanding claims" subtitle="KES by days since submission">{ageing.length ? <Bars data={ageing} x="bucket" bars={[{ key: 'amount', label: 'Amount' }]} height={220} /> : <EmptyState title="No outstanding claims" />}</Card>
        <Card title="Top rejection reasons">{s?.topRejectionReasons?.length ? <Bars data={s.topRejectionReasons} x="reason" bars={[{ key: 'count', label: 'Claims' }]} layout="vertical" height={220} /> : <EmptyState icon={CheckCircle2} title="No rejections" />}</Card>
      </div>
      <Tabs value={status} onChange={setStatus} tabs={[{ id: '', label: 'All', count: all }, ...STATUSES.map((k) => ({ id: k, label: humanize(k), count: counts[k] ?? 0 }))]} />
      <DataTable path="/claims" query={{ status }} onRowClick={(c: any) => router.push(`/claims/${c.id}`)} searchPlaceholder="Search claim, patient or member number" exportName="claims" emptyTitle="No claims here" columns={[
        { key: 'claimNumber', header: 'Claim', render: (c: any) => <b>{c.claimNumber}</b>, csv: (c: any) => c.claimNumber },
        { key: 'patient', header: 'Patient', render: (c: any) => fullName(c.patient), csv: (c: any) => fullName(c.patient) },
        { key: 'payer', header: 'Payer', render: (c: any) => c.payer?.name ?? '—', csv: (c: any) => c.payer?.name },
        { key: 'createdAt', header: 'Date', render: (c: any) => date(c.createdAt), csv: (c: any) => c.createdAt },
        { key: 'totalMinor', header: 'Amount', render: (c: any) => money(c.totalMinor), className: 'text-right', csv: (c: any) => c.totalMinor / 100 },
        { key: 'scrub', header: 'Scrub', render: (c: any) => { const i: any[] = c.scrubIssues ?? []; const e = i.filter((x) => x.severity === 'ERROR').length; const w = i.length - e; return e ? <span className="badge red">{e} error{e === 1 ? '' : 's'}</span> : w ? <span className="badge amber">{w} warning{w === 1 ? '' : 's'}</span> : <span className="badge green">Clean</span>; } },
        { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} />, csv: (c: any) => c.status },
      ]} />
    </div>
  );
}
