'use client';
import { Banknote, CreditCard, Lock, Receipt, Smartphone, Unlock, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { MedicalFloat } from '@/components/MedicalArt';
import { Card, EmptyState, Loading, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { useGet, useList } from '@/lib/hooks';
import { dateTime, money } from '@/lib/format';

export default function Cashier() {
  const [dlg, setDlg] = useState<'' | 'open' | 'close'>('');
  const { data: shift, isLoading } = useGet<any>('/cashier/shifts/current');
  const history = useList<any>('/cashier/shifts', { pageSize: 10 });
  const t = shift?.byMethod ?? {};
  const expected = shift?.expectedCash ?? (shift?.openingFloat ?? 0) + (t.CASH ?? 0);
  const total = Object.values(t).reduce((a: number, v) => a + Number(v ?? 0), 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cashier" subtitle="Open your shift, receive payments from Billing, then count and close the drawer."
        actions={<><Link href="/billing" className="btn"><Receipt />Open bills</Link>{shift?.id
          ? <button className="btn danger" onClick={() => setDlg('close')}><Lock />Close shift</button>
          : <button className="btn primary" onClick={() => setDlg('open')}><Unlock />Open shift</button>}</>} />
      {isLoading ? <Loading /> : shift?.id ? <>
        <div className="hero-card">
          <MedicalFloat tone="light" count={5} />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div><span className="chipw"><span className="live-dot" />Shift open since {dateTime(shift.openedAt)}</span>
              <div className="mt-3 text-[clamp(1.8rem,3vw,2.6rem)] font-extrabold tracking-tight">{money(total)}</div>
              <p className="muted m-0">collected this shift · {shift.receiptCount ?? 0} receipt{shift.receiptCount === 1 ? '' : 's'} · float {money(shift.openingFloat)}</p></div>
            <div className="text-right"><small className="muted block">Expected cash in drawer</small><b className="text-2xl">{money(expected)}</b></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Cash" value={money(t.CASH ?? 0)} icon={Banknote} tone="green" />
          <StatCard label="M-Pesa" value={money(t.MPESA ?? 0)} icon={Smartphone} tone="teal" />
          <StatCard label="Card" value={money(t.CARD ?? 0)} icon={CreditCard} tone="blue" />
          <StatCard label="Bank and other" value={money(total - (t.CASH ?? 0) - (t.MPESA ?? 0) - (t.CARD ?? 0))} icon={Wallet} tone="violet" />
        </div>
      </> : <Card><EmptyState icon={Wallet} title="No open shift" message="Open a shift with your opening float before you receive cash." action={<button className="btn primary" onClick={() => setDlg('open')}><Unlock />Open shift</button>} /></Card>}
      <Card title="Recent shifts" subtitle="Variance is counted cash minus expected cash." flush>
        <Table rows={history.data?.data ?? []} empty={<EmptyState title="No shifts yet" />} columns={[
          { key: 'openedAt', header: 'Opened', render: (s: any) => dateTime(s.openedAt) },
          { key: 'closedAt', header: 'Closed', render: (s: any) => (s.closedAt ? dateTime(s.closedAt) : <StatusBadge status="OPEN" />) },
          { key: 'openingFloat', header: 'Float', className: 'text-right', render: (s: any) => money(s.openingFloat) },
          { key: 'expected', header: 'Expected', className: 'text-right', render: (s: any) => money(s.expectedCash) },
          { key: 'counted', header: 'Counted', className: 'text-right', render: (s: any) => money(s.declaredCash) },
          { key: 'variance', header: 'Variance', className: 'text-right', render: (s: any) => s.variance == null ? '—' : <span className={`badge ${s.variance < 0 ? 'red' : s.variance > 0 ? 'amber' : 'green'}`}>{money(s.variance)}</span> },
        ]} />
      </Card>
      <FormDialog open={dlg === 'open'} onClose={() => setDlg('')} title="Open shift" path="/cashier/shifts/open" invalidate={['/cashier']} success="Shift opened" transform={(v) => ({ openingFloat: v.openingFloatMinor ?? 0 })} fields={[{ name: 'openingFloat', label: 'Opening float (KES)', type: 'money', required: true }]} />
      <FormDialog open={dlg === 'close'} onClose={() => setDlg('')} title="Close shift" path={`/cashier/shifts/${shift?.id}/close`} invalidate={['/cashier']} success="Shift closed" transform={(v) => ({ declaredCash: v.declaredCashMinor ?? 0, note: v.note })} fields={[{ name: 'declaredCash', label: 'Counted cash (KES)', type: 'money', required: true }, { name: 'note', label: 'Notes', type: 'textarea' }]} />
    </div>
  );
}
