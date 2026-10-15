'use client';
import { BadgeCheck, ClipboardList, Eye, FlaskConical, Hourglass, PenLine, TestTube } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Modal, PageHeader, Spinner, StatCard, StatusBadge, Tabs } from '@/components/ui';
import { useAction, useList } from '@/lib/hooks';
import { dateTime, fullName } from '@/lib/format';

const STAGES = [
  { id: 'REQUESTED,PAID', label: 'To collect', icon: TestTube },
  { id: 'IN_PROGRESS', label: 'Awaiting results', icon: Hourglass },
  { id: 'COMPLETED', label: 'To verify', icon: PenLine },
  { id: 'VERIFIED', label: 'Verified', icon: BadgeCheck },
];
const testCodeOf = (o: any) => String(o.description ?? '').split(':')[0].trim();

export default function Lab() {
  const [stage, setStage] = useState(STAGES[0].id); const [sel, setSel] = useState<any>(null);
  const inv = { invalidate: ['/lab'] };
  const collect = useAction<string>('post', (id) => `/lab/orders/${id}/collect`, { ...inv, success: 'Sample collected' });
  const verify = useAction<string>('post', (id) => `/lab/orders/${id}/verify`, { ...inv, success: 'Results verified and released' });
  // Counts per stage for the tiles and tab badges.
  const counts = STAGES.map((s) => useList('/lab/worklist', { status: s.id, pageSize: 1 })); // eslint-disable-line react-hooks/rules-of-hooks
  const n = (i: number) => counts[i].data?.total;
  return (
    <div>
      <PageHeader title="Laboratory" subtitle="Collect the sample, enter results, then verify to release them to the clinician and the patient portal." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="To collect" value={n(0)} icon={TestTube} loading={counts[0].isLoading} />
        <StatCard label="Awaiting results" value={n(1)} icon={FlaskConical} tone="blue" loading={counts[1].isLoading} />
        <StatCard label="To verify" value={n(2)} icon={ClipboardList} tone="amber" loading={counts[2].isLoading} />
        <StatCard label="Verified" value={n(3)} icon={BadgeCheck} tone="green" loading={counts[3].isLoading} />
      </div>
      <Tabs tabs={STAGES.map((s, i) => ({ ...s, count: n(i) }))} value={stage} onChange={setStage} />
      <DataTable path="/lab/worklist" query={{ status: stage }} searchPlaceholder="Search patient, lab number or test" emptyTitle="Nothing in this stage" columns={[
        { key: 'accession', header: 'Lab no.', render: (o: any) => o.labSpecimen?.accession ? <code className="font-bold">{o.labSpecimen.accession}</code> : <span className="muted">—</span> },
        { key: 'patient', header: 'Patient', render: (o: any) => <span><b className="block">{fullName(o.visit?.patient)}</b><small className="text-slate-500">{o.visit?.patient?.mrn}</small></span> },
        { key: 'description', header: 'Test', render: (o: any) => <span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 shrink-0 text-brand" />{o.description}</span> },
        { key: 'priority', header: 'Priority', render: (o: any) => <StatusBadge status={o.priority ?? 'ROUTINE'} tone={o.priority === 'STAT' ? 'red' : o.priority === 'URGENT' ? 'amber' : 'slate'} /> },
        { key: 'createdAt', header: 'Ordered', render: (o: any) => dateTime(o.createdAt) },
        { key: 'status', header: 'Status', render: (o: any) => <StatusBadge status={o.status} /> },
        { key: 'a', header: '', className: 'text-right', render: (o: any) => <span className="inline-flex gap-1.5">{
          o.status === 'REQUESTED' || o.status === 'PAID' ? <button className="btn primary sm" disabled={collect.isPending} onClick={(e) => { e.stopPropagation(); collect.mutate(o.id); }}><TestTube />Collect</button>
          : o.status === 'IN_PROGRESS' ? <button className="btn primary sm" onClick={() => setSel(o)}><PenLine />Enter results</button>
          : o.status === 'COMPLETED' ? <><button className="btn sm" onClick={() => setSel(o)}><Eye />Review</button><button className="btn ok sm" disabled={verify.isPending} onClick={() => verify.mutate(o.id)}><BadgeCheck />Verify</button></>
          : <button className="btn sm" onClick={() => setSel(o)}><Eye />View</button>}</span> },
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
    <Modal open onClose={onClose} title={order.description} subtitle={`${fullName(order.visit?.patient)} · ${order.visit?.patient?.mrn ?? ''}${order.labSpecimen?.accession ? ` · ${order.labSpecimen.accession}` : ''}`} wide
      footer={!readOnly && <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.isPending || !results.length} onClick={() => save.mutate({ results })}>{save.isPending && <Spinner />}Save results</button></>}>
      {tests.isLoading ? <Spinner /> : <div className="tablewrap"><table className="t mcards"><thead><tr><th>Test</th><th>Value</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead><tbody>
        {params.map((p) => {
          const v = vals[p.code] ?? existing[p.code]?.value ?? ''; const f = existing[p.code]?.flag;
          return <tr key={p.code}><td data-l="Test"><b>{p.name}</b> <small className="text-slate-500">{p.code}</small></td>
            <td data-l="Value"><input className="input sm w-32" disabled={readOnly} placeholder="Enter value" value={v} onChange={(e) => setVals({ ...vals, [p.code]: e.target.value })} /></td>
            <td data-l="Unit">{p.unit}</td><td data-l="Reference" className="text-xs text-slate-500">{range(p)}</td><td data-l="Flag">{f && <StatusBadge status={f === 'N' ? 'NORMAL' : f} />}</td></tr>;
        })}
      </tbody></table></div>}
    </Modal>
  );
}
