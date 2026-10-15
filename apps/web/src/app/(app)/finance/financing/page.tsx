'use client';
import { Handshake, Plus } from 'lucide-react';
import { useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { Card, ErrorNote, Loading, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime, money } from '@/lib/format';

const BUCKETS = ['0-30', '31-60', '61-90', '90+'];

/** Embedded finance: receivables ageing, advance requests against SHA receivables, partner consent. */
export default function Financing() {
  const [open, setOpen] = useState(false);
  const rec = useGet<any>('/financing/receivables');
  const reqs = useGet<any[]>('/financing/requests');
  const partners = useGet<any[]>('/financing/partners');
  const accept = useAction<string>('post', (id) => `/financing/requests/${id}/accept`, { invalidate: ['/financing'], success: 'Offer accepted' });
  const cancel = useAction<string>('post', (id) => `/financing/requests/${id}/cancel`, { invalidate: ['/financing'], success: 'Request cancelled' });
  const grant = useAction<string>('post', (id) => `/financing/partners/${id}/consent`, { invalidate: ['/financing/partners'], success: 'Consent granted' });
  const revoke = useAction<string>('del', (id) => `/financing/partners/${id}/consent`, { invalidate: ['/financing/partners'], success: 'Consent revoked' });
  if (rec.isLoading) return <Loading />;
  const r = rec.data;
  return (
    <div>
      <PageHeader title="Receivables financing" subtitle="Approved-but-unpaid claims and advances against SHA receivables"
        actions={<button className="btn-primary" disabled={!r?.shaAdvance?.maxAdvanceMinor} onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Request advance</button>} />
      <ErrorNote error={rec.error} />
      {r && <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outstanding receivables" value={money(r.totalOutstandingMinor)} hint={`${r.claimCount} approved claims`} icon={Handshake} />
        <StatCard label="Weighted average age" value={`${r.weightedAvgAgeDays} days`} tone="blue" />
        <StatCard label="Eligible SHA receivables" value={money(r.shaAdvance.receivablesMinor)} hint="≤ 90 days old" tone="green" />
        <StatCard label="Maximum advance" value={money(r.shaAdvance.maxAdvanceMinor)} hint="80% of eligible" tone="amber" />
      </div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Ageing by payer" className="lg:col-span-2">
          <Table rows={r?.byPayer ?? []} columns={[
            { key: 'payerName', header: 'Payer', render: (p: any) => <span>{p.payerName} <span className="text-xs text-slate-500">{p.payerType}</span></span> },
            { key: 'claims', header: 'Claims', className: 'text-right' },
            ...BUCKETS.map((b) => ({ key: b, header: `${b} d`, className: 'text-right', render: (p: any) => money(p.buckets[b]) })),
            { key: 'totalMinor', header: 'Total', className: 'text-right', render: (p: any) => <b>{money(p.totalMinor)}</b> },
          ]} />
        </Card>
        <Card title="Finance partners">
          {partners.isLoading ? <Loading /> : (partners.data ?? []).length ? <ul className="space-y-2 text-sm">{(partners.data ?? []).map((p) => <li key={p.id} className="flex items-center justify-between gap-2">
            <span>{p.name}<span className="block text-xs text-slate-500">{p.consented ? `Access: ${p.scopes.join(', ')}` : 'No data access'}</span></span>
            {p.consented ? <button className="btn-secondary py-1 text-xs" onClick={() => revoke.mutate(p.id)}>Revoke</button> : <button className="btn-primary py-1 text-xs" onClick={() => grant.mutate(p.id)}>Grant consent</button>}
          </li>)}</ul> : <p className="text-sm text-slate-500">No finance partners registered on the platform yet.</p>}
          <p className="mt-3 text-xs text-slate-500">Partners see only aggregated receivables and your financing requests, never patient data.</p>
        </Card>
      </div>
      <Card title="Financing requests" className="mt-4">
        <Table rows={reqs.data ?? []} columns={[
          { key: 'requestNumber', header: 'Request' }, { key: 'createdAt', header: 'Date', render: (x: any) => dateTime(x.createdAt) },
          { key: 'receivablesMinor', header: 'Receivables', className: 'text-right', render: (x: any) => money(x.receivablesMinor) },
          { key: 'requestedMinor', header: 'Requested', className: 'text-right', render: (x: any) => money(x.requestedMinor) },
          { key: 'offeredMinor', header: 'Offered', className: 'text-right', render: (x: any) => money(x.offeredMinor) },
          { key: 'feeMinor', header: 'Fee', className: 'text-right', render: (x: any) => money(x.feeMinor) },
          { key: 'status', header: 'Status', render: (x: any) => <StatusBadge status={x.status} /> },
          { key: 'a', header: '', render: (x: any) => <span className="flex gap-1">
            {x.status === 'OFFERED' && <button className="btn-primary py-1 text-xs" onClick={() => accept.mutate(x.id)}>Accept offer</button>}
            {['REQUESTED', 'UNDER_REVIEW', 'OFFERED'].includes(x.status) && <button className="btn-secondary py-1 text-xs" onClick={() => cancel.mutate(x.id)}>Cancel</button>}</span> },
        ]} />
      </Card>
      <FormDialog open={open} onClose={() => setOpen(false)} title="Request advance against SHA receivables" path="/financing/requests" invalidate={['/financing']} success="Financing request submitted"
        transform={(v) => ({ requestedMinor: v.amountMinor, partnerId: v.partnerId || undefined, notes: v.notes || undefined, payerType: 'SHA' })}
        fields={[
          { name: 'amount', label: `Amount (max ${money(r?.shaAdvance?.maxAdvanceMinor ?? 0)})`, type: 'money', required: true },
          { name: 'partnerId', label: 'Partner (optional)', type: 'select', options: (partners.data ?? []).filter((p) => p.consented).map((p) => ({ value: p.id, label: p.name })) as any },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ]} />
    </div>
  );
}
