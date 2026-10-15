'use client';
import { CheckCircle2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Table } from '@/components/DataTable';
import { Card, ErrorNote, Field, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useGet } from '@/lib/hooks';

interface Target { key: string; label: string; fields: { key: string; label: string; required?: boolean }[] }

export default function ImportWizard() {
  const { data: targets } = useGet<Target[]>('/import/targets');
  const [target, setTarget] = useState('patients'); const [csv, setCsv] = useState(''); const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<any>(null); const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<any>(null); const [result, setResult] = useState<any>(null); const [busy, setBusy] = useState(''); const [err, setErr] = useState<unknown>(null);
  const def = targets?.find((t) => t.key === target);
  const call = async (key: string, fn: () => Promise<void>) => { setBusy(key); setErr(null); try { await fn(); } catch (e) { setErr(e); } finally { setBusy(''); } };
  const onFile = (f?: File) => { if (!f) return; setFileName(f.name); f.text().then((t) => { setCsv(t); setPreview(null); setReport(null); setResult(null); }); };
  const loadPreview = () => call('preview', async () => { const p = await api.post<any>('/import/preview', { csv, target }); setPreview(p); setMapping(p.suggestedMapping); setReport(null); setResult(null); });
  const dryRun = () => call('dry', async () => setReport(await api.post('/import', { target, csv, mapping, commit: false })));
  const commit = () => call('commit', async () => {
    try { setResult(await api.post('/import', { target, csv, mapping, commit: true })); }
    catch (e) { if (e instanceof ApiError && (e.body as any)?.report) setReport((e.body as any).report); throw e; }
  });
  const step = result ? 4 : report ? 3 : preview ? 2 : 1;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Import data" subtitle="Move from your old system: upload CSV, map columns, validate with a dry run, then commit." />
      <ol className="mb-4 flex gap-2 text-xs">{['Upload', 'Map columns', 'Dry run', 'Done'].map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${step > i ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{i + 1}. {s}</li>)}</ol>
      <ErrorNote error={err} />
      <Card title="1. Upload CSV" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="What are you importing?"><select className="input" value={target} onChange={(e) => { setTarget(e.target.value); setPreview(null); setReport(null); setResult(null); }}>{(targets ?? []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
          <Field label="CSV file (UTF-8, first row = headers)"><input className="input" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} /></Field>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={!csv || busy === 'preview'} onClick={loadPreview}>{busy === 'preview' ? <Spinner /> : <Upload className="h-4 w-4" />}Read {fileName || 'file'}</button></div>
        </div>
      </Card>
      {preview && def && <Card title={`2. Map columns (${preview.rowCount} rows)`} className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {def.fields.map((f) => <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
            <select className="input" value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
              <option value="">(not imported)</option>{preview.headers.map((h: string) => <option key={h} value={h}>{h}</option>)}
            </select></Field>)}
        </div>
        <div className="mt-3 overflow-x-auto"><Table rows={preview.sample.map((r: string[], i: number) => ({ i, ...Object.fromEntries(preview.headers.map((h: string, j: number) => [h, r[j]])) }))} columns={preview.headers.map((h: string) => ({ key: h, header: h }))} /></div>
        <button className="btn-primary mt-3" disabled={busy === 'dry'} onClick={dryRun}>{busy === 'dry' && <Spinner />}Run dry-run validation</button>
      </Card>}
      {report && !result && <Card title="3. Validation report" className="mb-4">
        <p className="mb-3 text-sm">{report.validRows} of {report.totalRows} rows are valid. <StatusBadge status={report.errors.length ? `${report.errors.length} ERRORS` : 'READY'} tone={report.errors.length ? 'red' : 'green'} /></p>
        {report.errors.length > 0 && <div className="max-h-80 overflow-y-auto"><Table rows={report.errors.slice(0, 500).map((e: any, i: number) => ({ ...e, i }))} columns={[{ key: 'row', header: 'Row', render: (e: any) => e.row || 'File' }, { key: 'field', header: 'Field' }, { key: 'message', header: 'Problem' }]} /></div>}
        <button className="btn-primary mt-3" disabled={report.errors.length > 0 || busy === 'commit'} onClick={commit}>{busy === 'commit' && <Spinner />}Commit import</button>
        {report.errors.length > 0 && <p className="mt-2 text-xs text-slate-500">Fix the errors in your file (or adjust the mapping) and run the dry run again. Nothing is saved until every row is valid.</p>}
      </Card>}
      {result && <Card title="4. Done"><p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Imported {result.created} {target === 'openingBalances' ? 'journal' : 'records'}.</p></Card>}
    </div>
  );
}
