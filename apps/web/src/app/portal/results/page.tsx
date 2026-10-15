'use client';
import { useState } from 'react';
import { usePortal, when } from '@/lib/portal';
import { Box, Busy, Empty, Err, Pill } from '../parts';

export default function Results() {
  const [tab, setTab] = useState<'lab' | 'visits'>('lab');
  const r = usePortal<any>('/portal/results');
  const v = usePortal<any[]>(tab === 'visits' ? '/portal/visits' : null);
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">{(['lab', 'visits'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-xl border p-2 text-sm ${tab === t ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-slate-200 dark:border-slate-700'}`}>{t === 'lab' ? 'Test results' : 'Visit summaries'}</button>)}</div>
      {tab === 'lab' ? (r.isLoading ? <Busy /> : <>
        <Err error={r.error} />
        {!(r.data?.lab ?? []).length && !(r.data?.imaging ?? []).length && <Box><Empty text="No verified results yet" /></Box>}
        {(r.data?.lab ?? []).map((g: any) => (
          <Box key={g.orderId} title={g.test} action={<span className="text-xs text-slate-500">{when(g.verifiedAt)}</span>}>
            <table className="w-full text-sm"><tbody>{g.results.map((x: any) => (
              <tr key={x.code} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">{x.name}</td><td className="py-1.5 text-right font-medium">{x.value} <span className="text-xs text-slate-500">{x.unit}</span></td>
                <td className="w-12 py-1.5 text-right">{x.flag && x.flag !== 'N' ? <Pill tone={x.isCritical ? 'red' : 'amber'}>{x.flag}</Pill> : null}</td></tr>))}</tbody></table>
          </Box>))}
        {(r.data?.imaging ?? []).map((i: any) => <Box key={i.id} title={i.study}><p className="text-sm">{i.impression ?? i.findings}</p></Box>)}
        <p className="px-1 text-xs text-slate-500">Only results verified by the laboratory are shown. Discuss abnormal results with your clinician.</p>
      </>) : (v.isLoading ? <Busy /> : !(v.data ?? []).length ? <Box><Empty text="No visits yet" /></Box> : (v.data ?? []).map((x: any) => (
        <Box key={x.id} title={`${when(x.startedAt)} · ${x.type}`} action={<span className="text-xs text-slate-500">{x.visitNumber}</span>}>
          {x.practitioner && <p className="text-xs text-slate-500">Seen by {x.practitioner}</p>}
          {x.diagnoses.length > 0 && <p className="mt-1 text-sm"><b>Diagnosis:</b> {x.diagnoses.map((d: any) => d.display).join(', ')}</p>}
          {x.notes.filter((n: any) => n.plan).map((n: any, i: number) => <p key={i} className="mt-1 text-sm"><b>Plan:</b> {n.plan}</p>)}
          {x.prescriptions.length > 0 && <p className="mt-1 text-sm"><b>Medicines:</b> {x.prescriptions.map((p: any) => `${p.drugName} ${p.dose} ${p.frequency}`).join('; ')}</p>}
        </Box>)))}
    </div>
  );
}
