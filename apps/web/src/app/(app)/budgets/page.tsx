'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { Table } from '@/components/DataTable';
import { Modal, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { money } from '@/lib/format';

const ACCOUNT = { path: '/finance/accounts', idOf: (a: any) => a.code, label: (a: any) => `${a.code} ${a.name}`, sub: (a: any) => a.type };
export default function Budgets() {
  const [sel, setSel] = useState<any>(null);
  return <>
    <CrudPage title="Budgets" subtitle="Budget vs actual by department & account" path="/budgets" createLabel="New budget" searchable={false} onRowClick={setSel} columns={[
      { key: 'year', header: 'Year' }, { key: 'department', header: 'Department' }, { key: 'lines', header: 'Lines', render: (b: any) => (b.lines ?? []).length },
      { key: 'total', header: 'Budget', render: (b: any) => money((b.lines ?? []).reduce((s: number, l: any) => s + l.amountMinor, 0)), className: 'text-right' }, { key: 'status', header: 'Status', render: (b: any) => <StatusBadge status={b.status} /> }]}
      transform={(v) => ({ year: Number(v.year), department: v.department, lines: [{ accountCode: v.accountCode, amountMinor: v.amountMinor }] })}
      fields={[{ name: 'year', label: 'Year', type: 'number', required: true, placeholder: String(new Date().getFullYear()) }, { name: 'department', label: 'Department', required: true }, { name: 'accountCode', label: 'Account', type: 'picker', source: ACCOUNT, required: true }, { name: 'amount', label: 'Amount (KES)', type: 'money', required: true }]} />
    {sel && <VsActual budget={sel} onClose={() => setSel(null)} />}
  </>;
}
function VsActual({ budget, onClose }: { budget: any; onClose: () => void }) {
  const { data } = useGet<any>(`/budgets/${budget.id}/vs-actual`);
  const rows: any[] = data?.lines ?? data?.rows ?? (Array.isArray(data) ? data : []);
  return <Modal open onClose={onClose} title={`${budget.department} ${budget.year}: budget vs actual`} wide>
    <Table rows={rows} columns={[{ key: 'accountCode', header: 'Account' }, { key: 'budgetMinor', header: 'Budget', render: (r: any) => money(r.budgetMinor ?? r.amountMinor) }, { key: 'actualMinor', header: 'Actual', render: (r: any) => money(r.actualMinor) },
      { key: 'u', header: 'Utilisation', render: (r: any) => { const b = r.budgetMinor ?? r.amountMinor; const p = b ? Math.round(((r.actualMinor ?? 0) / b) * 100) : 0; return <div className="flex items-center gap-2"><div className="h-2 w-24 rounded bg-slate-200 dark:bg-slate-700"><div className={`h-2 rounded ${p > 100 ? 'bg-red-500' : p > 85 ? 'bg-amber-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(p, 100)}%` }} /></div><span className="text-xs">{p}%</span></div>; } }]} />
  </Modal>;
}
