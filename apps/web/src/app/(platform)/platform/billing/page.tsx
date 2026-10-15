'use client';
import { Ban, Banknote, PlayCircle, Receipt, Save, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Card, Field, Modal, PageHeader, Seg, StatCard, StatusBadge, humanize } from '@/components/ui';
import { useConfirm } from '@/components/Toast';
import { date, money } from '@/lib/format';
import { useAction, useGet, useList } from '@/lib/hooks';

const kes = (minor: number) => String((minor ?? 0) / 100);

function Pricing() {
  const { data: p } = useGet<any>('/platform/billing/pricing');
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (p) setF({ CLINIC: kes(p.CLINIC), HOSPITAL: kes(p.HOSPITAL), PER_VISIT: kes(p.PER_VISIT), d6: String(p.discounts?.[6] ?? 0), d12: String(p.discounts?.[12] ?? 0), d3: String(p.discounts?.[3] ?? 0), graceDays: String(p.graceDays) }); }, [p]);
  const save = useAction('put', '/platform/billing/pricing', { invalidate: ['/platform/billing'], success: 'Prices saved' });
  if (!f) return null;
  const n = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}><input className="input" type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <Card title="Prices" subtitle="KES, excluding VAT. New invoices use these; existing invoices keep their amount.">
      <div className="grid gap-3 sm:grid-cols-3">{n('CLINIC', 'Clinic per month')}{n('HOSPITAL', 'Hospital per month')}{n('PER_VISIT', 'Per patient visit')}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">{n('d3', '3 months, % off')}{n('d6', '6 months, % off')}{n('d12', '12 months, % off')}{n('graceDays', 'Grace days', 'Before read-only')}</div>
      <button className="btn primary mt-4" disabled={save.isPending} onClick={() => save.mutate({ CLINIC: Math.round(+f.CLINIC * 100), HOSPITAL: Math.round(+f.HOSPITAL * 100), PER_VISIT: Math.round(+f.PER_VISIT * 100), discounts: { 1: 0, 3: +f.d3, 6: +f.d6, 12: +f.d12 }, graceDays: +f.graceDays })}><Save />Save prices</button>
    </Card>
  );
}

export default function PlatformBilling() {
  const [status, setStatus] = useState('OPEN,PENDING'); const [rec, setRec] = useState<any>(null); const confirm = useConfirm();
  const [method, setMethod] = useState('BANK'); const [ref, setRef] = useState('');
  const sum = useGet<any>('/platform/billing/invoices', { pageSize: 1 });
  const due = useList<any>('/platform/billing/invoices', { status: 'OPEN,PENDING', pageSize: 1 });
  const record = useAction('post', (b: any) => `/platform/billing/invoices/${rec?.id}/record`, { invalidate: ['/platform'], success: 'Payment recorded', onSuccess: () => { setRec(null); setRef(''); } });
  const voidIt = useAction<string>('post', (id) => `/platform/billing/invoices/${id}/void`, { invalidate: ['/platform'], success: 'Invoice voided' });
  const run = useAction('post', '/platform/billing/run', { invalidate: ['/platform'], success: 'Billing run finished' });
  return (
    <div>
      <PageHeader title="Billing and pricing" subtitle="Subscription invoices to hospitals. The billing run is hourly: renewal invoices a week before a period ends, monthly per-visit invoices, grace and read-only."
        actions={<button className="btn" disabled={run.isPending} onClick={() => run.mutate({})}><PlayCircle />Run billing now</button>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Collected, last 30 days" value={money(sum.data?.paid30dMinor ?? 0)} icon={Banknote} tone="green" loading={sum.isLoading} />
        <StatCard label="Unpaid invoices" value={due.data?.total} icon={Wallet} tone="amber" loading={due.isLoading} />
        <div className="col-span-2 lg:col-span-1"><StatCard label="Invoices issued" value={sum.data?.total} icon={Receipt} loading={sum.isLoading} /></div>
      </div>
      <div className="mb-5"><Pricing /></div>
      <div className="mb-4 overflow-x-auto"><Seg options={[{ id: 'OPEN,PENDING', label: 'Unpaid' }, { id: 'PAID', label: 'Paid' }, { id: 'VOID', label: 'Void' }, { id: '', label: 'All' }]} value={status} onChange={setStatus} /></div>
      <DataTable path="/platform/billing/invoices" query={{ status }} searchPlaceholder="Search invoice number" exportName="hmis-invoices" emptyTitle="No invoices here" columns={[
        { key: 'number', header: 'Invoice', render: (r: any) => <b>{r.number}</b>, csv: (r: any) => r.number },
        { key: 'tenant', header: 'Tenant', render: (r: any) => r.tenant?.name ?? '—', csv: (r: any) => r.tenant?.name },
        { key: 'kind', header: 'For', render: (r: any) => (r.kind === 'USAGE' ? `${r.visits} visits` : `${humanize(r.plan)} · ${r.months} mo`) },
        { key: 'dueAt', header: 'Due', render: (r: any) => date(r.dueAt), csv: (r: any) => r.dueAt },
        { key: 'amountMinor', header: 'Amount', className: 'text-right', render: (r: any) => money(r.amountMinor, r.currency), csv: (r: any) => r.amountMinor / 100 },
        { key: 'status', header: 'Status', render: (r: any) => <span className="flex flex-col"><StatusBadge status={r.status} />{r.reference && <small className="text-slate-500">{r.method} {r.reference}</small>}</span>, csv: (r: any) => r.status },
        { key: 'a', header: '', className: 'text-right', render: (r: any) => ['OPEN', 'PENDING'].includes(r.status) && <span className="inline-flex gap-1.5">
          <button className="btn sm" onClick={() => setRec(r)}><Banknote />Record payment</button>
          <button className="btn ghost sm icon" aria-label="Void" title="Void" onClick={async () => { if (await confirm({ title: `Void ${r.number}?`, message: 'The tenant will no longer owe this amount.', confirm: 'Void' })) voidIt.mutate(r.id); }}><Ban /></button></span> },
      ]} />
      <Modal open={!!rec} onClose={() => setRec(null)} title={`Record payment for ${rec?.number ?? ''}`} subtitle={rec ? `${rec.tenant?.name ?? ''} · ${money(rec.amountMinor)}` : undefined}
        footer={<><button className="btn" onClick={() => setRec(null)}>Cancel</button><button className="btn primary" disabled={!ref.trim() || record.isPending} onClick={() => record.mutate({ method, reference: ref })}><Save />Record</button></>}>
        <div className="grid gap-3">
          <Field label="Method"><Seg options={[{ id: 'BANK', label: 'Bank' }, { id: 'MPESA', label: 'M-Pesa' }, { id: 'WAIVER', label: 'Waiver' }]} value={method} onChange={setMethod} /></Field>
          <Field label="Reference" hint="Bank slip number, M-Pesa code or the reason for a waiver"><input className="input" placeholder="Enter the reference" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
