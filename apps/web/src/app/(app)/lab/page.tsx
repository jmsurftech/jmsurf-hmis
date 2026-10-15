'use client';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Modal, PageHeader, Spinner, StatusBadge, Tabs } from '@/components/ui';
import { useAction, useList } from '@/lib/hooks';
import { dateTime, fullName } from '@/lib/format';

const STAGES = [{ id: 'REQUESTED,PAID', label: 'To collect' }, { id: 'IN_PROGRESS', label: 'Awaiting results' }, { id: 'COMPLETED', label: 'To verify' }, { id: 'VERIFIED', label: 'Verified' }];
const testCodeOf = (o: any) => String(o.description ?? '').split(':')[0].trim();

export default function Lab() {
  const [stage, setStage] = useState(STAGES[0].id); const [sel, setSel] = useState<any>(null);
  const inv = { invalidate: ['/lab'] };
  const collect = useAction<string>('post', (id) => `/lab/orders/${id}/collect`, { ...inv, success: 'Sample collected' });
  const verify = useAction<string>('post', (id) => `/lab/orders/${id}/verify`, { ...inv, success: 'Results verified & released' });
  return (
    <div>
      <PageHeader title="Laboratory" subtitle="Worklist: collect → result → verify" />
      <Tabs tabs={STAGES} value={stage} onChange={setStage} />
      <DataTable path="/lab/worklist" query={{ status: stage }} columns={[
        { key: 'accession', header: 'Lab no.', render: (o: any) => o.labSpecimen?.accession ?? '—' },
        { key: 'patient', header: 'Patient', render: (o: any) => <span>{fullName(o.visit?.patient)}<span className="block text-xs text-slate-500">{o.visit?.patient?.mrn}</span></span> },
        { key: 'description', header: 'Test' },
        { key: 'priority', header: 'Priority', render: (o: any) => <StatusBadge status={o.priority ?? 'ROUTINE'} tone={o.priority === 'STAT' ? 'red' : 'slate'} /> },
        { key: 'createdAt', header: 'Ordered', render: (o: any) => dateTime(o.createdAt) },
        { key: 'status', header: 'Status', render: (o: any) => <StatusBadge status={o.status} /> },
        { key: 'a', header: '', render: (o: any) => o.status === 'REQUESTED' || o.status === 'PAID' ? <button className="btn-primary py-1 text-xs" onClick={() => collect.mutate(o.id)}>Collect</button>
          : o.status === 'IN_PROGRESS' ? <button className="btn-primary py-1 text-xs" onClick={() => setSel(o)}>Enter results</button>
          : o.status === 'COMPLETED' ? <span className="flex gap-1"><button className="btn-secondary py-1 text-xs" onClick={() => setSel(o)}>Review</button><button className="btn-primary py-1 text-xs" onClick={() => verify.mutate(o.id)}>Verify</button></span>
          : <button className="btn-secondary py-1 text-xs" onClick={() => setSel(o)}>View</button> },
      ]} />
      {sel && <ResultDialog order={sel} onClose={() => setSel(null)} readOnly={sel.status === 'VERIFIED'} />}
    </div>
  );
}

function ResultDialog({ order, onClose, readOnly }: { order: any; onClose: () => void; readOnly?: boolean }) {
  const tests = useList<any>('/lab/tests', { pageSize: 500 });
  const byCode = useMemo(() => new Map((tests.data?.data ?? []).map((t: any) => [t.code, t])), [tests.data]);
  const code = testCodeOf(order); const test: any = byCode.get(code);
  const params: any[] = test ? (test.panelOf?.length ? test.panelOf.map((c: string) => byCode.get(c) ?? { code: c, name: c }) : [test]) : [{ code: code || 'RESULT', name: order.description }];
  const existing: Record<string, any> = Object.fromEntries((order.labResults ?? []).map((r: any) => [r.testCode, r]));
  const [vals, setVals] = useState<Record<string, string>>({});
  const save = useAction('post', `/lab/orders/${order.id}/results`, { invalidate: ['/lab'], success: 'Results saved', onSuccess: onClose });
  const range = (p: any) => { const r = Array.isArray(p.refRanges) ? p.refRanges[0] : null; return r ? `${r.low ?? ''} – ${r.high ?? ''}` : ''; };
  const results = params.map((p) => ({ testCode: p.code, value: vals[p.code] ?? existing[p.code]?.value ?? '', unit: p.unit || undefined })).filter((r) => r.value !== '');
  return (
    <Modal open onClose={onClose} title={`Results: ${order.description}`} wide footer={!readOnly && <><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending || !results.length} onClick={() => save.mutate({ results })}>{save.isPending && <Spinner />}Save results</button></>}>
      <p className="mb-3 text-sm text-slate-500">{fullName(order.visit?.patient)} · {order.visit?.patient?.mrn} · {order.labSpecimen?.accession}</p>
      {tests.isLoading ? <Spinner /> : <table className="w-full text-sm"><thead><tr><th className="th">Test</th><th className="th">Value</th><th className="th">Unit</th><th className="th">Reference</th><th className="th">Flag</th></tr></thead><tbody>
        {params.map((p) => { const v = vals[p.code] ?? existing[p.code]?.value ?? ''; const f = existing[p.code]?.flag;
          return <tr key={p.code}><td className="td">{p.name} <span className="text-xs text-slate-500">{p.code}</span></td><td className="td"><input className="input w-28" disabled={readOnly} value={v} onChange={(e) => setVals({ ...vals, [p.code]: e.target.value })} /></td><td className="td">{p.unit}</td><td className="td text-xs">{range(p)}</td><td className="td">{f && <StatusBadge status={f === 'N' ? 'NORMAL' : f} />}</td></tr>; })}
      </tbody></table>}
    </Modal>
  );
}
