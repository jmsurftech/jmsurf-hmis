'use client';
import { useState } from 'react';
import { ModulePage, iso } from '@/components/ModulePage';
import { EntityPicker } from '@/components/EntityPicker';
import { LineTrend } from '@/components/charts';
import { Card, Field, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, fullName } from '@/lib/format';
import { PICK } from '@/lib/pickers';

const FP = ['PILLS_COC', 'PILLS_POP', 'INJECTABLE', 'IMPLANT', 'IUCD', 'CONDOMS', 'EC', 'BTL', 'VASECTOMY', 'NATURAL'];
function FpSummary() {
  const { data } = useGet<any[]>('/clinics/fp/summary');
  if (!data?.length) return null;
  const by: Record<string, number> = {};
  for (const r of data) by[r.method] = (by[r.method] ?? 0) + r.count;
  return <Card title="This month by method" className="mb-4"><div className="flex flex-wrap gap-2 text-sm">{Object.entries(by).map(([k, v]) => <span key={k} className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">{k.replace(/_/g, ' ')}: <strong>{v}</strong></span>)}</div></Card>;
}
function NcdTrend() {
  const [pid, setPid] = useState<string>('');
  const { data } = useGet<any>(pid ? `/clinics/ncd/patients/${pid}/trend` : null);
  const pts = (data?.points ?? []).map((p: any) => ({ ...p, date: date(p.date) }));
  return <Card title="BP & glucose trend" className="mb-4">
    <Field label="Patient" className="mb-3 max-w-md"><EntityPicker source={PICK.patient} value={pid} onChange={(id) => setPid(id)} placeholder="Search patient…" /></Field>
    {!pid ? <p className="text-sm text-slate-500">Pick a patient to see their trend.</p> : !pts.length ? <p className="text-sm text-slate-500">No follow-ups yet.</p> : <div className="grid gap-4 lg:grid-cols-2">
      <div><p className="mb-1 text-xs font-semibold text-slate-500">Blood pressure (mmHg) – target &lt;140/90</p><LineTrend data={pts} x="date" lines={[{ key: 'systolic', label: 'Systolic' }, { key: 'diastolic', label: 'Diastolic' }]} height={220} /></div>
      <div><p className="mb-1 text-xs font-semibold text-slate-500">Glucose (mmol/L) – FBS target &lt;7</p><LineTrend data={pts} x="date" lines={[{ key: 'fbs', label: 'FBS' }, { key: 'rbs', label: 'RBS' }, { key: 'hba1c', label: 'HbA1c %' }]} height={220} /></div>
      <p className="text-sm">Latest: {data.controlled == null ? '—' : data.controlled ? <StatusBadge status="CONTROLLED" tone="green" /> : <StatusBadge status="NOT CONTROLLED" tone="red" />} · {data.visits} visits</p>
    </div>}
  </Card>;
}

export default function FpNcd() {
  return <ModulePage title="FP & NCD clinics" subtitle="Family planning method register · hypertension & diabetes follow-up" tabs={[
    { id: 'fp', label: 'Family planning', path: '/clinics/fp', custom: <FpSummary />, createLabel: 'FP visit', invalidate: ['/clinics'],
      columns: [{ key: 'visitDate', header: 'Date', render: (r: any) => date(r.visitDate) }, { key: 'patient', header: 'Client', render: (r: any) => fullName(r.patient) }, { key: 'clientType', header: 'Type' }, { key: 'method', header: 'Method', render: (r: any) => r.method.replace(/_/g, ' ') }, { key: 'quantity', header: 'Qty' }, { key: 'removal', header: 'Removal', render: (r: any) => r.removal ? 'Yes' : '' }, { key: 'sideEffects', header: 'Side effects' }, { key: 'nextVisitAt', header: 'Next visit', render: (r: any) => date(r.nextVisitAt) }],
      fields: [{ name: 'patientId', label: 'Client', type: 'picker', source: PICK.patient, required: true }, { name: 'method', label: 'Method', type: 'select', options: FP, required: true }, { name: 'clientType', label: 'Client type', type: 'select', options: ['NEW', 'REVISIT'] }, { name: 'visitDate', label: 'Visit date', type: 'date' }, { name: 'quantity', label: 'Quantity (cycles/pieces)', type: 'number' }, { name: 'removal', label: 'Removal (implant/IUCD)', type: 'checkbox' }, { name: 'sideEffects', label: 'Side effects' }, { name: 'nextVisitAt', label: 'Next visit (blank = by method)', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea' }] },
    { id: 'ncd', label: 'NCD follow-up', path: '/clinics/ncd', custom: <NcdTrend />, createLabel: 'NCD follow-up', invalidate: ['/clinics'],
      columns: [{ key: 'visitAt', header: 'Date', render: (r: any) => date(r.visitAt) }, { key: 'patient', header: 'Patient', render: (r: any) => fullName(r.patient) }, { key: 'condition', header: 'Condition', render: (r: any) => r.condition.replace('_', ' + ') }, { key: 'bp', header: 'BP', render: (r: any) => r.systolic ? `${r.systolic}/${r.diastolic}` : '—' }, { key: 'fbs', header: 'FBS' }, { key: 'hba1c', header: 'HbA1c' }, { key: 'medications', header: 'Medications' }, { key: 'controlled', header: 'Control', render: (r: any) => r.controlled == null ? '—' : <StatusBadge status={r.controlled ? 'CONTROLLED' : 'UNCONTROLLED'} tone={r.controlled ? 'green' : 'red'} /> }],
      fields: [{ name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'condition', label: 'Condition', type: 'select', options: ['HTN', 'DM', 'HTN_DM'], required: true }, { name: 'visitAt', label: 'Visit date', type: 'date' }, { name: 'systolic', label: 'Systolic', type: 'number' }, { name: 'diastolic', label: 'Diastolic', type: 'number' }, { name: 'fbs', label: 'FBS (mmol/L)', type: 'number' }, { name: 'rbs', label: 'RBS (mmol/L)', type: 'number' }, { name: 'hba1c', label: 'HbA1c (%)', type: 'number' }, { name: 'weightKg', label: 'Weight (kg)', type: 'number' }, { name: 'medications', label: 'Medications' }, { name: 'nextVisitAt', label: 'Next visit', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea' }],
      transform: (v) => ({ ...v, visitAt: iso(v.visitAt) }) },
  ]} />;
}
