'use client';
import { Download, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Card, ErrorNote, Field, Loading, PageHeader, Spinner, Tabs } from '@/components/ui';
import { downloadCsv } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';

const REPORTS = [{ id: 'moh-705a', label: 'MOH 705A (<5 OPD)' }, { id: 'moh-705b', label: 'MOH 705B (≥5 OPD)' }, { id: 'moh-717', label: 'MOH 717 (service workload)' }];
export default function Reports() {
  const [report, setReport] = useState('moh-705a');
  const [month, setMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const { data, isLoading, error } = useGet<any>(`/reports/${report}`, { month });
  const push = useAction('post', `/reports/${report}/dhis2-push`, { success: 'Pushed to DHIS2 (KHIS)' });
  const cols: string[] = data?.columns ?? [];
  const rows: any[] = data?.rows ?? [];
  return (
    <div>
      <PageHeader title="Reports" subtitle="MOH statutory reports & DHIS2 (KHIS) submission" actions={<>
        <button className="btn-secondary" onClick={() => downloadCsv(`/reports/${report}`, { month }, `${report}-${month}.csv`)}><Download className="h-4 w-4" />CSV</button>
        <button className="btn-primary" disabled={push.isPending} onClick={() => push.mutate({ month })}>{push.isPending ? <Spinner /> : <UploadCloud className="h-4 w-4" />}Push to DHIS2</button></>} />
      <Tabs tabs={REPORTS} value={report} onChange={setReport} />
      <div className="mb-4 flex items-end gap-3"><Field label="Reporting month"><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        {data?.lastPushedAt && <p className="pb-2 text-xs text-slate-500">Last pushed {new Date(data.lastPushedAt).toLocaleString()}</p>}</div>
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : <Card title={`${REPORTS.find((r) => r.id === report)?.label} · ${month}`}>
        {rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr><th className="th sticky left-0 bg-white dark:bg-slate-900">Indicator</th>{cols.map((c) => <th key={c} className="th text-right">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((r, i) => <tr key={i}><td className="td sticky left-0 bg-white dark:bg-slate-900">{r.label ?? r.indicator}</td>{cols.map((c) => <td key={c} className="td text-right tabular-nums">{r.values?.[c] ?? r[c] ?? 0}</td>)}</tr>)}</tbody></table></div>
          : <p className="text-sm text-slate-500">No data for this month</p>}
      </Card>}
    </div>
  );
}
