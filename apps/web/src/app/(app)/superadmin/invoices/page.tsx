'use client';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Field, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { useAction } from '@/lib/hooks';
import { date, money } from '@/lib/format';

export default function SubscriptionInvoices() {
  const [status, setStatus] = useState(''); const [period, setPeriod] = useState('');
  const gen = useAction('post', '/superadmin/invoices/generate', { success: 'Invoices generated', invalidate: ['/superadmin'] });
  const dun = useAction('post', '/superadmin/dunning/run', { success: 'Dunning run complete', invalidate: ['/superadmin'] });
  const paid = useAction<string>('post', (id) => `/superadmin/invoices/${id}/mark-paid`, { success: 'Marked paid', invalidate: ['/superadmin'] });
  return (
    <div>
      <PageHeader title="Subscription invoices" subtitle="Generated on the 1st of each month: plan fee + KES 49 per visit"
        actions={<div className="flex items-end gap-2"><Field label="Period"><input className="input w-32" placeholder="YYYY-MM" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
          <button className="btn-secondary" disabled={gen.isPending} onClick={() => gen.mutate({ period: period || undefined })}>{gen.isPending && <Spinner />}Generate</button>
          <button className="btn-secondary" disabled={dun.isPending} onClick={() => dun.mutate({})}>Run dunning</button></div>} />
      <DataTable path="/superadmin/invoices" query={{ status }} searchable={false}
        toolbar={<select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['UNPAID', 'PENDING', 'PAID', 'VOID'].map((s) => <option key={s}>{s}</option>)}</select>}
        columns={[
          { key: 'number', header: 'Invoice' }, { key: 'tenant', header: 'Tenant', render: (i: any) => i.tenant?.name }, { key: 'period', header: 'Period' }, { key: 'plan', header: 'Plan' },
          { key: 'visits', header: 'Visits' }, { key: 'amountMinor', header: 'Amount', render: (i: any) => money(i.amountMinor) },
          { key: 'dueDate', header: 'Due', render: (i: any) => date(i.dueDate) },
          { key: 'status', header: 'Status', render: (i: any) => <StatusBadge status={i.status} tone={i.status === 'PAID' ? 'green' : 'amber'} /> },
          { key: 'x', header: '', render: (i: any) => i.status !== 'PAID' && <button className="btn-secondary py-1 text-xs" onClick={(e) => { e.stopPropagation(); paid.mutate(i.id); }}>Mark paid</button> },
        ]} />
    </div>
  );
}
