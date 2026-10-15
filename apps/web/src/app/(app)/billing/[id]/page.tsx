'use client';
import { Banknote, CreditCard, FileCheck2, Lock, Percent, Printer, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { use, useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { MpesaStk } from '@/components/MpesaStk';
import { Card, ErrorNote, KV, Loading, Modal, PageHeader, StatusBadge } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime, fullName, money } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';

export default function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const qc = useQueryClient(); const router = useRouter();
  const [dlg, setDlg] = useState<'' | 'cash' | 'card' | 'mpesa' | 'discount' | 'receipt'>('');
  const [receipt, setReceipt] = useState<any>(null);
  const { data: b, isLoading, error } = useGet<any>(`/billing/bills/${id}`);
  const finalize = useAction('post', `/billing/bills/${id}/finalize`, { invalidate: ['/billing'], onSuccess: (r: any) => toastFiscal(r) });
  const claim = useAction('post', '/claims/from-bill', { invalidate: ['/claims'], success: 'Claim created', onSuccess: (c: any) => c?.id && router.push(`/claims/${c.id}`) });
  const [fiscalMsg, setFiscalMsg] = useState('');
  const toastFiscal = (r: any) => setFiscalMsg(r?.fiscal ? (r.fiscal.signed ? 'Bill finalised and signed with KRA eTIMS' : `Bill finalised; eTIMS signing failed: ${r.fiscal.error ?? 'unknown error'}`) : 'Bill finalised');
  if (isLoading) return <Loading />;
  if (error || !b) return <ErrorNote error={error ?? new Error('Bill not found')} />;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/billing') });
  const showReceipt = (p: any) => { setReceipt(p); setDlg('receipt'); };
  const balance = Math.max((b.patientAmountMinor ?? b.totalMinor ?? 0) - (b.paidMinor ?? 0), 0);
  const editable = !['FINAL', 'PAID', 'VOID'].includes(b.status); const patient = b.visit?.patient;
  return (
    <div>
      <PageHeader title={`Bill ${b.billNumber ?? ''}`} subtitle={`${fullName(patient)} · ${b.visit?.visitNumber ?? ''} · ${b.visit?.payerType ?? ''} · ${dateTime(b.createdAt)}`} actions={<>
        {editable && <button className="btn-secondary" onClick={() => setDlg('discount')}><Percent className="h-4 w-4" />Discount</button>}
        {editable && <button className="btn-secondary" disabled={finalize.isPending} onClick={() => finalize.mutate({ type: 'FINAL' })}><Lock className="h-4 w-4" />Finalise (eTIMS)</button>}
        {b.payerAmountMinor > 0 && <button className="btn-secondary" disabled={claim.isPending} onClick={() => claim.mutate({ billId: id })}><FileCheck2 className="h-4 w-4" />Create claim</button>}
        <button className="btn-secondary" onClick={() => setDlg('cash')} disabled={balance <= 0}><Banknote className="h-4 w-4" />Cash</button>
        <button className="btn-secondary" onClick={() => setDlg('card')} disabled={balance <= 0}><CreditCard className="h-4 w-4" />Card</button>
        <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" onClick={() => setDlg('mpesa')} disabled={balance <= 0}><Smartphone className="h-4 w-4" />M-Pesa</button></>} />
      {fiscalMsg && <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">{fiscalMsg}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Bill lines" className="lg:col-span-2">
          <Table rows={(b.lines ?? []).filter((l: any) => !l.voided)} columns={[
            { key: 'description', header: 'Item' }, { key: 'sourceType', header: 'Source' },
            { key: 'quantity', header: 'Qty', className: 'text-right' }, { key: 'unitPriceMinor', header: 'Price', render: (l: any) => money(l.unitPriceMinor), className: 'text-right' },
            { key: 'totalMinor', header: 'Total', render: (l: any) => money(l.totalMinor), className: 'text-right' },
            { key: 'payer', header: 'Covered by', render: (l: any) => l.payer === 'PATIENT' ? 'Patient' : l.payer },
          ]} />
        </Card>
        <div className="space-y-4">
          <Card title="Summary">
            <dl className="space-y-2 text-sm">
              {[['Total', b.totalMinor], ['Discounts', -(b.discountMinor ?? 0)], ['Payer share', b.payerAmountMinor], ['Patient share', b.patientAmountMinor], ['Paid', b.paidMinor]].map(([k, v]) => v != null && <div key={k as string} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd>{money(v as number)}</dd></div>)}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold dark:border-slate-700"><dt>Balance</dt><dd>{money(balance)}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={b.status} />{b.etimsInvoiceNo && <span className="text-xs text-slate-500">eTIMS {b.etimsInvoiceNo}</span>}</div>
          </Card>
          <Card title="Payments">
            {(b.payments ?? []).length ? <ul className="space-y-2 text-sm">{b.payments.map((p: any) => <li key={p.id} className="flex items-center justify-between"><span>{p.method} <StatusBadge status={p.status} /> <span className="text-xs text-slate-500">{p.reference ?? ''} · {dateTime(p.createdAt)}</span></span><span className="flex items-center gap-2">{money(p.amountMinor)}<button onClick={() => showReceipt(p)} aria-label="Print receipt"><Printer className="h-4 w-4 text-slate-500" /></button></span></li>)}</ul> : <p className="text-sm text-slate-500">No payments yet</p>}
          </Card>
        </div>
      </div>
      <FormDialog open={dlg === 'cash'} onClose={() => setDlg('')} title="Cash payment" path="/payments/receipts" invalidate={['/billing']} success="Payment recorded" defaults={{ amount: (balance / 100).toFixed(2) }} transform={(v) => ({ billId: id, method: 'CASH', amountMinor: v.amountMinor })} onDone={showReceipt}
        fields={[{ name: 'amount', label: 'Amount (KES)', type: 'money', required: true }]} />
      <FormDialog open={dlg === 'card'} onClose={() => setDlg('')} title="Card payment" path="/payments/receipts" invalidate={['/billing']} success="Payment recorded" defaults={{ amount: (balance / 100).toFixed(2) }} transform={(v) => ({ billId: id, method: 'CARD', amountMinor: v.amountMinor, reference: v.reference })} onDone={showReceipt}
        fields={[{ name: 'amount', label: 'Amount (KES)', type: 'money', required: true }, { name: 'reference', label: 'Card approval code', required: true }]} />
      <FormDialog open={dlg === 'discount'} onClose={() => setDlg('')} title="Apply discount / waiver" path={`/billing/bills/${id}/discount`} invalidate={['/billing']} success="Discount applied"
        transform={(v) => ({ type: v.type, reason: v.reason, ...(v.mode === 'PERCENT' ? { percent: Number(v.value) } : { amountMinor: Math.round(Number(v.value) * 100) }) })}
        fields={[{ name: 'type', label: 'Type', type: 'select', options: ['DISCOUNT', 'WAIVER'], required: true }, { name: 'mode', label: 'Basis', type: 'select', options: ['PERCENT', 'AMOUNT'], required: true }, { name: 'value', label: 'Value (% or KES)', type: 'number', required: true }, { name: 'reason', label: 'Reason', type: 'textarea', required: true }]} />
      <Modal open={dlg === 'mpesa'} onClose={() => setDlg('')} title="M-Pesa payment">
        <MpesaStk amountMinor={balance} body={{ billId: id }} defaultPhone={patient?.phone} onSuccess={(r) => { refresh(); showReceipt(r); }} />
      </Modal>
      <Modal open={dlg === 'receipt'} onClose={() => setDlg('')} title="Receipt" footer={<button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</button>}>
        <Receipt bill={b} payment={receipt} />
      </Modal>
    </div>
  );
}

function Receipt({ bill, payment }: { bill: any; payment: any }) {
  const qr = bill.etimsQr ?? `https://etims.kra.go.ke/verify?invoice=${encodeURIComponent(bill.etimsInvoiceNo ?? bill.billNumber ?? bill.id)}`;
  return (
    <div id="receipt" className="mx-auto max-w-xs font-mono text-xs">
      <p className="text-center text-sm font-bold">JMSURF HMIS</p>
      <hr className="my-2 border-dashed" />
      <KV items={[['Receipt', payment?.receiptNumber ?? payment?.reference ?? '—'], ['Bill', bill.billNumber], ['Patient', fullName(bill.visit?.patient)], ['Method', payment?.method], ['Date', dateTime(payment?.createdAt ?? new Date())]]} />
      <hr className="my-2 border-dashed" />
      {(bill.lines ?? []).filter((l: any) => !l.voided).map((l: any) => <div key={l.id} className="flex justify-between"><span>{l.quantity}× {l.description}</span><span>{money(l.totalMinor, '')}</span></div>)}
      <hr className="my-2 border-dashed" />
      <div className="flex justify-between font-bold"><span>PAID</span><span>{money(payment?.amountMinor)}</span></div>
      <div className="flex justify-between"><span>Balance</span><span>{money(Math.max((bill.patientAmountMinor ?? 0) - (bill.paidMinor ?? 0), 0))}</span></div>
      <div className="mt-3 flex flex-col items-center gap-1"><QRCodeSVG value={qr} size={110} /><span>KRA eTIMS {bill.etimsInvoiceNo ?? 'not yet signed'}</span></div>
      <p className="mt-2 text-center">Thank you. Get well soon.</p>
    </div>
  );
}
