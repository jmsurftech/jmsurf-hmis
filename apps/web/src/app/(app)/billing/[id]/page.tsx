'use client';
import { Banknote, CreditCard, Percent, Printer, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { use, useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { MpesaStk } from '@/components/MpesaStk';
import { Card, ErrorNote, KV, Loading, Modal, PageHeader, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { dateTime, fullName, money } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';

export default function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const qc = useQueryClient();
  const [dlg, setDlg] = useState<'' | 'cash' | 'card' | 'mpesa' | 'discount' | 'receipt'>('');
  const [receipt, setReceipt] = useState<any>(null);
  const { data: b, isLoading, error } = useGet<any>(`/billing/bills/${id}`);
  if (isLoading) return <Loading />;
  if (error || !b) return <ErrorNote error={error ?? new Error('Bill not found')} />;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/billing') });
  const showReceipt = (p: any) => { setReceipt(p); setDlg('receipt'); };
  const balance = b.balanceMinor ?? (b.totalMinor ?? 0) - (b.paidMinor ?? 0);
  return (
    <div>
      <PageHeader title={`Bill ${b.billNumber ?? ''}`} subtitle={`${fullName(b.patient)} · ${b.payerType ?? ''} · ${dateTime(b.createdAt)}`} actions={<>
        <button className="btn-secondary" onClick={() => setDlg('discount')}><Percent className="h-4 w-4" />Discount</button>
        <button className="btn-secondary" onClick={() => setDlg('cash')} disabled={balance <= 0}><Banknote className="h-4 w-4" />Cash</button>
        <button className="btn-secondary" onClick={() => setDlg('card')} disabled={balance <= 0}><CreditCard className="h-4 w-4" />Card</button>
        <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" onClick={() => setDlg('mpesa')} disabled={balance <= 0}><Smartphone className="h-4 w-4" />M-Pesa</button></>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Bill lines" className="lg:col-span-2">
          <Table rows={b.lines ?? b.items ?? []} columns={[
            { key: 'description', header: 'Item', render: (l: any) => l.description ?? l.serviceItem?.name }, { key: 'department', header: 'Dept', render: (l: any) => l.department?.name ?? l.category ?? '—' },
            { key: 'quantity', header: 'Qty', className: 'text-right' }, { key: 'unitPriceMinor', header: 'Price', render: (l: any) => money(l.unitPriceMinor), className: 'text-right' },
            { key: 'discountMinor', header: 'Disc.', render: (l: any) => l.discountMinor ? money(l.discountMinor) : '—', className: 'text-right' }, { key: 'totalMinor', header: 'Total', render: (l: any) => money(l.totalMinor ?? l.amountMinor), className: 'text-right' },
            { key: 'payer', header: 'Covered by', render: (l: any) => l.coveredBy ?? (l.payerShareMinor ? `Payer ${money(l.payerShareMinor)}` : 'Patient') },
          ]} />
        </Card>
        <div className="space-y-4">
          <Card title="Summary">
            <dl className="space-y-2 text-sm">
              {[['Gross', b.grossMinor ?? b.subtotalMinor], ['Discounts', -(b.discountMinor ?? 0)], ['Payer share', b.payerShareMinor], ['Total', b.totalMinor], ['Paid', b.paidMinor]].map(([k, v]) => v != null && <div key={k as string} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd>{money(v as number)}</dd></div>)}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold dark:border-slate-700"><dt>Balance</dt><dd>{money(balance)}</dd></div>
            </dl>
            <div className="mt-3"><StatusBadge status={b.status} /></div>
          </Card>
          <Card title="Payments">
            {(b.payments ?? []).length ? <ul className="space-y-2 text-sm">{b.payments.map((p: any) => <li key={p.id} className="flex items-center justify-between"><span>{p.method} <span className="text-xs text-slate-500">{p.reference ?? ''} · {dateTime(p.createdAt)}</span></span><span className="flex items-center gap-2">{money(p.amountMinor)}<button onClick={() => showReceipt(p)} aria-label="Print receipt"><Printer className="h-4 w-4 text-slate-500" /></button></span></li>)}</ul> : <p className="text-sm text-slate-500">No payments yet</p>}
          </Card>
        </div>
      </div>
      <FormDialog open={dlg === 'cash'} onClose={() => setDlg('')} title="Cash payment" path={`/billing/bills/${id}/payments`} invalidate={['/billing']} success="Payment recorded" defaults={{ amount: (balance / 100).toFixed(2) }} transform={(v) => ({ ...v, method: 'CASH' })} onDone={showReceipt}
        fields={[{ name: 'amount', label: 'Amount (KES)', type: 'money', required: true }, { name: 'tendered', label: 'Tendered (KES)', type: 'money' }]} />
      <FormDialog open={dlg === 'card'} onClose={() => setDlg('')} title="Card payment" path={`/billing/bills/${id}/payments`} invalidate={['/billing']} success="Payment recorded" defaults={{ amount: (balance / 100).toFixed(2) }} transform={(v) => ({ ...v, method: 'CARD' })} onDone={showReceipt}
        fields={[{ name: 'amount', label: 'Amount (KES)', type: 'money', required: true }, { name: 'reference', label: 'Card approval code', required: true }]} />
      <FormDialog open={dlg === 'discount'} onClose={() => setDlg('')} title="Apply discount / waiver" path={`/billing/bills/${id}/discounts`} invalidate={['/billing']} success="Discount applied"
        fields={[{ name: 'type', label: 'Type', type: 'select', options: ['PERCENT', 'AMOUNT', 'WAIVER'], required: true }, { name: 'value', label: 'Value (% or KES)', type: 'number', required: true }, { name: 'lineId', label: 'Line ID (blank = whole bill)' }, { name: 'reason', label: 'Reason', type: 'textarea', required: true }]} />
      <Modal open={dlg === 'mpesa'} onClose={() => setDlg('')} title="M-Pesa payment">
        <MpesaStk amountMinor={balance} body={{ billId: id }} defaultPhone={b.patient?.phone} onSuccess={(r) => { refresh(); showReceipt({ ...r, method: 'MPESA', amountMinor: balance }); }} />
      </Modal>
      <Modal open={dlg === 'receipt'} onClose={() => setDlg('')} title="Receipt" footer={<button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</button>}>
        <Receipt bill={b} payment={receipt} />
      </Modal>
    </div>
  );
}

function Receipt({ bill, payment }: { bill: any; payment: any }) {
  const etims = payment?.etims ?? bill.etims ?? {};
  const qr = etims.qrUrl ?? etims.qrCode ?? payment?.etimsQr ?? `https://etims.kra.go.ke/verify?invoice=${encodeURIComponent(etims.invoiceNumber ?? bill.billNumber ?? bill.id)}`;
  return (
    <div id="receipt" className="mx-auto max-w-xs font-mono text-xs">
      <p className="text-center text-sm font-bold">{bill.facility?.name ?? 'JMSURF HMIS'}</p>
      <p className="text-center">{bill.facility?.address ?? ''} {bill.facility?.kraPin ? `PIN ${bill.facility.kraPin}` : ''}</p>
      <hr className="my-2 border-dashed" />
      <KV items={[['Receipt', payment?.receiptNumber ?? payment?.reference ?? '—'], ['Bill', bill.billNumber], ['Patient', fullName(bill.patient)], ['Method', payment?.method], ['Date', dateTime(payment?.createdAt ?? new Date())]]} />
      <hr className="my-2 border-dashed" />
      {(bill.lines ?? []).map((l: any) => <div key={l.id} className="flex justify-between"><span>{l.quantity}× {l.description ?? l.serviceItem?.name}</span><span>{money(l.totalMinor ?? l.amountMinor, '')}</span></div>)}
      <hr className="my-2 border-dashed" />
      <div className="flex justify-between font-bold"><span>PAID</span><span>{money(payment?.amountMinor)}</span></div>
      <div className="flex justify-between"><span>Balance</span><span>{money(bill.balanceMinor)}</span></div>
      <div className="mt-3 flex flex-col items-center gap-1"><QRCodeSVG value={qr} size={110} /><span>KRA eTIMS {etims.cuInvoiceNumber ?? etims.invoiceNumber ?? ''}</span><span>{etims.signature ?? ''}</span></div>
      <p className="mt-2 text-center">Thank you. Get well soon.</p>
    </div>
  );
}
