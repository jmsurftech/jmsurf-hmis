'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable, Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { Card, ErrorNote, Field, Loading, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, money } from '@/lib/format';

const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;
export default function Finance() {
  const [tab, setTab] = useState('tb'); const [from, setFrom] = useState(yearStart); const [to, setTo] = useState(today); const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader title="Finance" subtitle="General ledger & financial statements" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Journal entry</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'tb', label: 'Trial balance' }, { id: 'is', label: 'Income statement' }, { id: 'bs', label: 'Balance sheet' }, { id: 'journals', label: 'Journals' }, { id: 'accounts', label: 'Chart of accounts' }]} />
      {tab !== 'journals' && tab !== 'accounts' && <div className="mb-4 flex gap-3">{tab !== 'bs' && <Field label="From"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>}<Field label={tab === 'bs' ? 'As at' : 'To'}><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>}
      {tab === 'tb' && <TrialBalance from={from} to={to} />}
      {tab === 'is' && <Statement path="/finance/reports/income-statement" query={{ from, to }} />}
      {tab === 'bs' && <Statement path="/finance/reports/balance-sheet" query={{ asAt: to }} />}
      {tab === 'journals' && <DataTable path="/finance/journals" columns={[{ key: 'journalNumber', header: 'No.' }, { key: 'date', header: 'Date', render: (j: any) => date(j.date ?? j.postedAt) }, { key: 'description', header: 'Description' }, { key: 'source', header: 'Source' }, { key: 'totalMinor', header: 'Amount', render: (j: any) => money(j.totalMinor), className: 'text-right' }, { key: 'status', header: 'Status', render: (j: any) => <StatusBadge status={j.status} /> }]} />}
      {tab === 'accounts' && <DataTable path="/finance/accounts" columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Account' }, { key: 'type', header: 'Type' }, { key: 'balanceMinor', header: 'Balance', render: (a: any) => money(a.balanceMinor), className: 'text-right' }]} />}
      <FormDialog open={open} onClose={() => setOpen(false)} title="Manual journal entry" path="/finance/journals" success="Journal posted"
        transform={(v) => ({ date: v.date, description: v.description, lines: [{ accountId: v.debitAccountId, debitMinor: v.amountMinor, creditMinor: 0 }, { accountId: v.creditAccountId, debitMinor: 0, creditMinor: v.amountMinor }] })}
        fields={[{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'description', label: 'Description', required: true }, { name: 'debitAccountId', label: 'Debit account ID', required: true }, { name: 'creditAccountId', label: 'Credit account ID', required: true }, { name: 'amount', label: 'Amount (KES)', type: 'money', required: true }]} />
    </div>
  );
}
function TrialBalance({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = useGet<any>('/finance/reports/trial-balance', { from, to });
  if (isLoading) return <Loading />;
  const rows: any[] = data?.rows ?? data?.data ?? [];
  const dr = rows.reduce((s, r) => s + (r.debitMinor ?? 0), 0); const cr = rows.reduce((s, r) => s + (r.creditMinor ?? 0), 0);
  return <div className="card"><ErrorNote error={error} /><Table rows={[...rows, ...(rows.length ? [{ id: 'total', code: '', name: 'TOTAL', debitMinor: dr, creditMinor: cr }] : [])]} columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Account', render: (r: any) => r.id === 'total' ? <b>{r.name}</b> : r.name }, { key: 'debitMinor', header: 'Debit', render: (r: any) => money(r.debitMinor), className: 'text-right' }, { key: 'creditMinor', header: 'Credit', render: (r: any) => money(r.creditMinor), className: 'text-right' }]} />
    {rows.length > 0 && dr !== cr && <p className="p-3 text-sm text-red-600">Out of balance by {money(Math.abs(dr - cr))}</p>}</div>;
}
function Statement({ path, query }: { path: string; query: Record<string, string> }) {
  const { data, isLoading, error } = useGet<any>(path, query);
  if (isLoading) return <Loading />;
  const sections: any[] = data?.sections ?? [];
  return <div className="space-y-4"><ErrorNote error={error} />
    {sections.map((s) => <Card key={s.name} title={s.name}><table className="w-full text-sm"><tbody>{(s.lines ?? []).map((l: any) => <tr key={l.code ?? l.name}><td className="td">{l.code} {l.name}</td><td className="td text-right">{money(l.amountMinor)}</td></tr>)}<tr className="border-t border-slate-200 font-semibold dark:border-slate-700"><td className="td">Total {s.name}</td><td className="td text-right">{money(s.totalMinor)}</td></tr></tbody></table></Card>)}
    {data?.netMinor != null && <Card><div className="flex justify-between text-lg font-semibold"><span>{data.netLabel ?? 'Net'}</span><span>{money(data.netMinor)}</span></div></Card>}
    {!sections.length && !error && <Card><p className="text-sm text-slate-500">No postings in this period</p></Card>}
  </div>;
}
