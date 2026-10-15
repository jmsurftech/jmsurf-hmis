'use client';
import { CheckCircle2, Clock, FileCheck2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bars } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, fullName, money } from '@/lib/format';

const STATUSES = ['DRAFT', 'VALIDATED', 'SUBMITTED', 'IN_REVIEW', 'QUERIED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'RECONCILED'];
export default function Claims() {
  const router = useRouter(); const [status, setStatus] = useState('');
  const { data: s } = useGet<any>('/claims/dashboard');
  const by: Record<string, { count: number; totalMinor: number; approvedMinor: number; paidMinor: number }> = s?.byStatus ?? {};
  const counts: Record<string, number> = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.count]));
  const ageing = Object.entries(s?.ageing ?? {}).map(([bucket, a]: [string, any]) => ({ bucket, amount: (a.outstandingMinor ?? 0) / 100, count: a.count }));
  const outstanding = Object.values(s?.ageing ?? {}).reduce((t: number, a: any) => t + (a.outstandingMinor ?? 0), 0);
  return (
    <div>
      <PageHeader title="Claims" subtitle="SHA & insurance claims management" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="First-pass acceptance" value={s?.firstPassAcceptanceRate != null ? `${s.firstPassAcceptanceRate}%` : '—'} icon={CheckCircle2} tone="green" hint="Target ≥ 95%" />
        <StatCard label="Outstanding" value={money(outstanding)} icon={Clock} tone="amber" />
        <StatCard label="Paid" value={money((by.PAID?.paidMinor ?? 0) + (by.RECONCILED?.paidMinor ?? 0))} icon={FileCheck2} tone="primary" />
        <StatCard label="Rejected" value={counts.REJECTED ?? 0} icon={XCircle} tone="red" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setStatus('')} className={!status ? 'btn-primary py-1' : 'btn-secondary py-1'}>All</button>
        {STATUSES.map((k) => <button key={k} onClick={() => setStatus(k)} className={status === k ? 'btn-primary py-1' : 'btn-secondary py-1'}>{k} <span className="rounded bg-black/10 px-1.5 text-xs">{counts[k] ?? 0}</span></button>)}
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Ageing of outstanding claims (KES)">{ageing.length ? <Bars data={ageing} x="bucket" bars={[{ key: 'amount', label: 'Amount' }]} height={220} /> : <EmptyState title="No outstanding claims" />}</Card>
        <Card title="Top rejection reasons">{s?.topRejectionReasons?.length ? <Bars data={s.topRejectionReasons} x="reason" bars={[{ key: 'count', label: 'Claims' }]} layout="vertical" height={220} /> : <EmptyState title="No rejections" />}</Card>
      </div>
      <DataTable path="/claims" query={{ status }} onRowClick={(c: any) => router.push(`/claims/${c.id}`)} columns={[
        { key: 'claimNumber', header: 'Claim' }, { key: 'patient', header: 'Patient', render: (c: any) => fullName(c.patient) }, { key: 'payer', header: 'Payer', render: (c: any) => c.payer?.name ?? '—' },
        { key: 'createdAt', header: 'Date', render: (c: any) => date(c.createdAt) }, { key: 'totalMinor', header: 'Amount', render: (c: any) => money(c.totalMinor), className: 'text-right' },
        { key: 'scrub', header: 'Scrub', render: (c: any) => { const i: any[] = c.scrubIssues ?? []; const e = i.filter((x) => x.severity === 'ERROR').length; const w = i.length - e; return e ? <StatusBadge status={`${e} errors`} tone="red" /> : w ? <StatusBadge status={`${w} warnings`} tone="amber" /> : <StatusBadge status="CLEAN" tone="green" />; } },
        { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} /> },
      ]} />
    </div>
  );
}
