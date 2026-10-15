'use client';
import { Lock, Unlock } from 'lucide-react';
import { useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { Card, EmptyState, KV, Loading, PageHeader, StatCard } from '@/components/ui';
import { useGet, useList } from '@/lib/hooks';
import { dateTime, money } from '@/lib/format';

export default function Cashier() {
  const [dlg, setDlg] = useState<'' | 'open' | 'close'>('');
  const { data: shift, isLoading } = useGet<any>('/cashier/shifts/current');
  const history = useList<any>('/cashier/shifts', { pageSize: 10 });
  const t = shift?.byMethod ?? {};
  return (
    <div>
      <PageHeader title="Cashier" subtitle="Shift management & collections" actions={shift?.id ? <button className="btn-danger" onClick={() => setDlg('close')}><Lock className="h-4 w-4" />Close shift</button> : <button className="btn-primary" onClick={() => setDlg('open')}><Unlock className="h-4 w-4" />Open shift</button>} />
      {isLoading ? <Loading /> : shift?.id ? <>
        <Card className="mb-4"><KV items={[['Shift', shift.id.slice(0, 8)], ['Opened', dateTime(shift.openedAt)], ['Opening float', money(shift.openingFloat)], ['Receipts', shift.receiptCount ?? 0]]} /></Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Cash" value={money(t.CASH ?? 0)} tone="green" /><StatCard label="M-Pesa" value={money(t.MPESA ?? 0)} tone="primary" />
          <StatCard label="Card" value={money(t.CARD ?? 0)} tone="blue" /><StatCard label="Expected cash in drawer" value={money(shift.expectedCash ?? (shift.openingFloat ?? 0) + (t.CASH ?? 0))} tone="amber" />
        </div>
      </> : <div className="card"><EmptyState title="No open shift" message="Open a shift with your opening float before receiving payments." /></div>}
      <Card title="Recent shifts" className="mt-6"><Table rows={history.data?.data ?? []} columns={[
        { key: 'openedAt', header: 'Opened', render: (s: any) => dateTime(s.openedAt) }, { key: 'closedAt', header: 'Closed', render: (s: any) => dateTime(s.closedAt) }, { key: 'openingFloat', header: 'Float', render: (s: any) => money(s.openingFloat) },
        { key: 'expected', header: 'Expected', render: (s: any) => money(s.expectedCash) }, { key: 'counted', header: 'Counted', render: (s: any) => money(s.declaredCash) },
        { key: 'variance', header: 'Variance', render: (s: any) => <span className={(s.variance ?? 0) < 0 ? 'text-red-600' : ''}>{money(s.variance)}</span> }]} /></Card>
      <FormDialog open={dlg === 'open'} onClose={() => setDlg('')} title="Open shift" path="/cashier/shifts/open" invalidate={['/cashier']} success="Shift opened" transform={(v) => ({ openingFloat: v.openingFloatMinor ?? 0 })} fields={[{ name: 'openingFloat', label: 'Opening float (KES)', type: 'money', required: true }]} />
      <FormDialog open={dlg === 'close'} onClose={() => setDlg('')} title="Close shift" path={`/cashier/shifts/${shift?.id}/close`} invalidate={['/cashier']} success="Shift closed" transform={(v) => ({ declaredCash: v.declaredCashMinor ?? 0, note: v.note })} fields={[{ name: 'declaredCash', label: 'Counted cash (KES)', type: 'money', required: true }, { name: 'note', label: 'Notes', type: 'textarea' }]} />
    </div>
  );
}
