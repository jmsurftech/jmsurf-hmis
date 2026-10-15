'use client';
import { Download, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Card, ErrorNote, Field, Loading, PageHeader, Spinner, Tabs } from '@/components/ui';
import { downloadCsv } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';

const REPORTS = [{ id: 'moh705a', code: 'MOH705A', label: 'MOH 705A (<5 OPD)' }, { id: 'moh705b', code: 'MOH705B', label: 'MOH 705B (≥5 OPD)' }, { id: 'moh717', code: 'MOH717', label: 'MOH 717 (service workload)' }];
export default function Reports() {
  const [report, setReport] = useState('moh705a');
  const [month, setMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const { data, isLoading, error } = useGet<any>(`/reports/${report}`, { period: month });
  const push = useAction('post', '/reports/dhis2/push', { success: 'Pushed to DHIS2 (KHIS)' });
  const rows: any[] = data?.rows ?? [];
  const sexed = rows.some((r) => r.male != null);
  const cols = sexed ? ['male', 'female', 'total'] : ['value'];
  const def = REPORTS.find((r) => r.id === report)!;
  return (
    <div>
      <PageHeader title="Reports" subtitle="MOH statutory reports & DHIS2 (KHIS) submission" actions={<>
        <button className="btn-secondary" onClick={() => downloadCsv(`/reports/${report}/csv`, { period: month }, `${report}-${month}.csv`)}><Download className="h-4 w-4" />CSV</button>
        <button className="btn-primary" disabled={push.isPending} onClick={() => push.mutate({ report: def.code, period: month })}>{push.isPending ? <Spinner /> : <UploadCloud className="h-4 w-4" />}Push to DHIS2</button></>} />
      <Tabs tabs={REPORTS} value={report} onChange={setReport} />
      <div className="mb-4 flex items-end gap-3"><Field label="Reporting month"><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></Field></div>
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : <Card title={`${data?.title ?? def.label} · ${month}`}>
        {rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr><th className="th sticky left-0 bg-white dark:bg-slate-900">Indicator</th>{cols.map((c) => <th key={c} className="th text-right capitalize">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((r, i) => <tr key={r.key ?? i}><td className="td sticky left-0 bg-white dark:bg-slate-900">{r.label}</td>{cols.map((c) => <td key={c} className="td text-right tabular-nums">{r[c] ?? 0}</td>)}</tr>)}</tbody></table></div>
          : <p className="text-sm text-slate-500">No data for this month</p>}
      </Card>}
    </div>
  );
}
