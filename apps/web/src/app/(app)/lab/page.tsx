'use client';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Modal, PageHeader, Spinner, StatusBadge, Tabs } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime, fullName } from '@/lib/format';

const STAGES = [{ id: 'PENDING_COLLECTION', label: 'To collect' }, { id: 'COLLECTED', label: 'Awaiting results' }, { id: 'RESULTED', label: 'To verify' }, { id: 'VERIFIED', label: 'Verified' }];
function flagFor(v: string, lo?: number, hi?: number, clo?: number, chi?: number) {
  const n = Number(v); if (v === '' || isNaN(n)) return '';
  if (clo != null && n < clo) return 'LL'; if (chi != null && n > chi) return 'HH';
  if (lo != null && n < lo) return 'L'; if (hi != null && n > hi) return 'H'; return 'N';
}
export default function Lab() {
  const [stage, setStage] = useState('PENDING_COLLECTION'); const [sel, setSel] = useState<any>(null);
  const inv = { invalidate: ['/lab'] };
  const collect = useAction<string>('post', (id) => `/lab/orders/${id}/collect`, { ...inv, success: 'Sample collected' });
  const verify = useAction<string>('post', (id) => `/lab/orders/${id}/verify`, { ...inv, success: 'Results verified & released' });
  return (
    <div>
      <PageHeader title="Laboratory" subtitle="Worklist: collect → result → verify" />
      <Tabs tabs={STAGES} value={stage} onChange={setStage} />
      <DataTable path="/lab/orders" query={{ status: stage }} columns={[
        { key: 'orderNumber', header: 'Lab no.', render: (o: any) => o.labNumber ?? o.sampleId ?? o.id.slice(0, 8) },
        { key: 'patient', header: 'Patient', render: (o: any) => <span>{fullName(o.patient)}<span className="block text-xs text-slate-500">{o.patient?.mrn}</span></span> },
        { key: 'test', header: 'Test', render: (o: any) => o.test?.name ?? o.serviceItem?.name ?? o.name },
        { key: 'priority', header: 'Priority', render: (o: any) => <StatusBadge status={o.priority ?? 'ROUTINE'} tone={o.priority === 'STAT' ? 'red' : 'slate'} /> },
        { key: 'createdAt', header: 'Ordered', render: (o: any) => dateTime(o.createdAt) },
        { key: 'status', header: 'Status', render: (o: any) => <StatusBadge status={o.status} /> },
        { key: 'a', header: '', render: (o: any) => stage === 'PENDING_COLLECTION' ? <button className="btn-primary py-1 text-xs" onClick={() => collect.mutate(o.id)}>Collect</button>
          : stage === 'COLLECTED' ? <button className="btn-primary py-1 text-xs" onClick={() => setSel(o)}>Enter results</button>
          : stage === 'RESULTED' ? <span className="flex gap-1"><button className="btn-secondary py-1 text-xs" onClick={() => setSel(o)}>Review</button><button className="btn-primary py-1 text-xs" onClick={() => verify.mutate(o.id)}>Verify</button></span>
          : <button className="btn-secondary py-1 text-xs" onClick={() => setSel(o)}>View</button> },
      ]} />
      {sel && <ResultDialog order={sel} onClose={() => setSel(null)} readOnly={stage === 'VERIFIED'} />}
    </div>
  );
}
function ResultDialog({ order, onClose, readOnly }: { order: any; onClose: () => void; readOnly?: boolean }) {
  const { data } = useGet<any>(`/lab/orders/${order.id}`);
  const params: any[] = data?.parameters ?? data?.test?.parameters ?? [{ id: 'result', name: order.test?.name ?? 'Result', unit: '', refLow: undefined, refHigh: undefined }];
  const [vals, setVals] = useState<Record<string, string>>({}); const [comment, setComment] = useState('');
  const save = useAction('post', `/lab/orders/${order.id}/results`, { invalidate: ['/lab'], success: 'Results saved', onSuccess: onClose });
  const existing: Record<string, any> = Object.fromEntries((data?.results ?? []).map((r: any) => [r.parameterId ?? r.name, r]));
  return (
    <Modal open onClose={onClose} title={`Results: ${order.test?.name ?? order.serviceItem?.name ?? ''}`} wide footer={!readOnly && <><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ comment, results: params.map((p) => ({ parameterId: p.id, name: p.name, value: vals[p.id] ?? existing[p.id]?.value ?? '', unit: p.unit, flag: flagFor(vals[p.id] ?? '', p.refLow, p.refHigh, p.criticalLow, p.criticalHigh) || undefined })) })}>{save.isPending && <Spinner />}Save results</button></>}>
      <p className="mb-3 text-sm text-slate-500">{fullName(order.patient)} · {order.patient?.mrn}</p>
      <table className="w-full text-sm"><thead><tr><th className="th">Parameter</th><th className="th">Value</th><th className="th">Unit</th><th className="th">Reference</th><th className="th">Flag</th></tr></thead><tbody>
        {params.map((p) => { const v = vals[p.id] ?? existing[p.id]?.value ?? ''; const f = existing[p.id]?.flag ?? flagFor(v, p.refLow, p.refHigh, p.criticalLow, p.criticalHigh);
          return <tr key={p.id}><td className="td">{p.name}</td><td className="td"><input className="input w-28" disabled={readOnly} value={v} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} /></td><td className="td">{p.unit}</td><td className="td text-xs">{p.refLow ?? ''}{p.refHigh != null ? ` – ${p.refHigh}` : p.refText ?? ''}</td><td className="td">{f && <StatusBadge status={f === 'N' ? 'NORMAL' : f} />}</td></tr>; })}
      </tbody></table>
      <label className="mt-3 block"><span className="label">Comment</span><textarea className="input" disabled={readOnly} rows={2} value={comment || data?.comment || ''} onChange={(e) => setComment(e.target.value)} /></label>
    </Modal>
  );
}
