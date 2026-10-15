'use client';
import { CrudPage } from '@/components/CrudPage';
import { money } from '@/lib/format';
export default function Budgets() {
  return <CrudPage title="Budgets" subtitle="Budget vs actual by department & account" path="/budgets" createLabel="New budget line" columns={[
    { key: 'fiscalYear', header: 'FY' }, { key: 'department', header: 'Department', render: (b: any) => b.department?.name ?? '—' }, { key: 'account', header: 'Account', render: (b: any) => b.account?.name ?? b.accountCode ?? '—' },
    { key: 'amountMinor', header: 'Budget', render: (b: any) => money(b.amountMinor), className: 'text-right' }, { key: 'actualMinor', header: 'Actual', render: (b: any) => money(b.actualMinor), className: 'text-right' },
    { key: 'var', header: 'Utilisation', render: (b: any) => { const p = b.amountMinor ? Math.round(((b.actualMinor ?? 0) / b.amountMinor) * 100) : 0; return <div className="flex items-center gap-2"><div className="h-2 w-24 rounded bg-slate-200 dark:bg-slate-700"><div className={`h-2 rounded ${p > 100 ? 'bg-red-500' : p > 85 ? 'bg-amber-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(p, 100)}%` }} /></div><span className="text-xs">{p}%</span></div>; } }]}
    fields={[{ name: 'fiscalYear', label: 'Fiscal year', required: true, placeholder: '2026/27' }, { name: 'departmentId', label: 'Department ID' }, { name: 'accountId', label: 'Account ID', required: true }, { name: 'amount', label: 'Amount (KES)', type: 'money', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />;
}
