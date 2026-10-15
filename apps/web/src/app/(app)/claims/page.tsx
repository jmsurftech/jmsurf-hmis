'use client';
import { CheckCircle2, Clock, FileCheck2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bars } from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, fullName, money } from '@/lib/format';

const STATUSES = ['DRAFT', 'READY', 'SUBMITTED', 'QUERIED', 'APPROVED', 'REJECTED', 'PAID'];
export default function Claims() {
  const router = useRouter(); const [status, setStatus] = useState('');
  const { data: s } = useGet<any>('/claims/dashboard');
  const counts: Record<string, number> = s?.statusCounts ?? {};
  const ageing = (s?.ageing ?? []).map((a: any) => ({ bucket: a.bucket, amount: (a.amountMinor ?? 0) / 100, count: a.count }));
  return (
    <div>
      <PageHeader title="Claims" subtitle="SHA & insurance claims management" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="First-pass acceptance" value={`${s?.firstPassAcceptancePct ?? 0}%`} icon={CheckCircle2} tone="green" hint="Target ≥ 95%" />
        <StatCard label="Submitted (unpaid)" value={money(s?.outstandingMinor ?? 0)} icon={Clock} tone="amber" />
        <StatCard label="Paid this month" value={money(s?.paidThisMonthMinor ?? 0)} icon={FileCheck2} tone="primary" />
        <StatCard label="Rejected" value={counts.REJECTED ?? 0} icon={XCircle} tone="red" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setStatus('')} className={!status ? 'btn-primary py-1' : 'btn-secondary py-1'}>All</button>
        {STATUSES.map((k) => <button key={k} onClick={() => setStatus(k)} className={status === k ? 'btn-primary py-1' : 'btn-secondary py-1'}>{k} <span className="rounded bg-black/10 px-1.5 text-xs">{counts[k] ?? 0}</span></button>)}
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Ageing of outstanding claims (KES)">{ageing.length ? <Bars data={ageing} x="bucket" bars={[{ key: 'amount', label: 'Amount' }]} height={220} /> : <EmptyState title="No outstanding claims" />}</Card>
        <Card title="Top rejection reasons">{s?.rejectionReasons?.length ? <Bars data={s.rejectionReasons} x="reason" bars={[{ key: 'count', label: 'Claims' }]} layout="vertical" height={220} /> : <EmptyState title="No rejections" />}</Card>
      </div>
      <DataTable path="/claims" query={{ status }} onRowClick={(c: any) => router.push(`/claims/${c.id}`)} columns={[
        { key: 'claimNumber', header: 'Claim' }, { key: 'patient', header: 'Patient', render: (c: any) => fullName(c.patient) }, { key: 'payer', header: 'Payer', render: (c: any) => c.payer?.name ?? c.scheme?.name ?? c.payerType },
        { key: 'createdAt', header: 'Date', render: (c: any) => date(c.createdAt) }, { key: 'amountMinor', header: 'Amount', render: (c: any) => money(c.amountMinor ?? c.claimedMinor), className: 'text-right' },
        { key: 'scrub', header: 'Scrub', render: (c: any) => c.scrubErrors ? <StatusBadge status={`${c.scrubErrors} errors`} tone="red" /> : c.scrubWarnings ? <StatusBadge status={`${c.scrubWarnings} warnings`} tone="amber" /> : <StatusBadge status="CLEAN" tone="green" /> },
        { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} /> },
      ]} />
    </div>
  );
}
