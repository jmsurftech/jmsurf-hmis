'use client';
import { Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { ModulePage } from '@/components/ModulePage';
import { PatientName } from '@/components/PatientName';
import { Table } from '@/components/DataTable';
import { Card, Field, Spinner, StatCard } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { SPICK } from '@/lib/support-pickers';

const DIETS = ['NORMAL', 'DIABETIC', 'RENAL', 'LOW_SALT', 'SOFT', 'LIQUID', 'HIGH_PROTEIN', 'HIGH_ENERGY', 'NPO'];
const MEALS = ['BREAKFAST', 'LUNCH', 'SUPPER'];
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

function Kitchen() {
  const [d, setD] = useState(today()); const [meal, setMeal] = useState('LUNCH');
  const sheet = useGet<any>('/dietetics/kitchen-sheet', { date: d, meal });
  const plans = useGet<any[]>('/dietetics/meal-plans', { date: d, meal });
  const gen = useAction('post', '/dietetics/meal-plans/generate', { invalidate: ['/dietetics'], success: 'Meal plans generated' });
  const s = sheet.data;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <Field label="Date"><input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Meal"><select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <button className="btn-primary" disabled={gen.isPending} onClick={() => gen.mutate({ date: d, meal })}>{gen.isPending ? <Spinner /> : <RefreshCw className="h-4 w-4" />}Generate from current inpatients</button>
        <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print kitchen sheet</button>
      </div>
      <h2 className="text-lg font-semibold">Kitchen sheet · {meal} · {d}</h2>
      {!s?.wards?.length ? <p className="text-sm text-slate-500">No meal plan yet for this meal. Generate it from current inpatients and diet orders.</p> : <>
        <div className="grid gap-3 sm:grid-cols-4"><StatCard label="Total meals" value={s.totalMeals} />{Object.entries(s.totals).map(([k, v]) => <StatCard key={k} label={k.replace(/_/g, ' ')} value={v as number} tone={k === 'NORMAL' ? 'primary' : 'amber'} />)}</div>
        <Card title="By ward"><Table rows={s.wards} columns={[{ key: 'ward', header: 'Ward' }, { key: 'patients', header: 'Inpatients' }, { key: 'counts', header: 'Diets', render: (w: any) => Object.entries(w.counts).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ') || 'All NPO' }]} /></Card>
        <Card title="Special diets, allergies & notes"><Table rows={s.specials} empty={<p className="text-sm text-slate-500">None.</p>} columns={[{ key: 'ward', header: 'Ward' }, { key: 'bed', header: 'Bed' }, { key: 'patientName', header: 'Patient' }, { key: 'dietType', header: 'Diet' }, { key: 'texture', header: 'Texture' }, { key: 'allergies', header: 'Allergies' }, { key: 'notes', header: 'Notes' }]} /></Card>
        {(plans.data ?? []).map((p) => <Card key={p.id} title={`${p.wardName} – ward meal list (generated ${dateTime(p.generatedAt)})`}><Table rows={p.items} columns={[{ key: 'bed', header: 'Bed' }, { key: 'patientName', header: 'Patient' }, { key: 'mrn', header: 'MRN' }, { key: 'dietType', header: 'Diet' }, { key: 'allergies', header: 'Allergies' }]} /></Card>)}
      </>}
    </div>
  );
}

export default function Dietetics() {
  return <ModulePage title="Kitchen & dietetics" subtitle="Diet orders for admissions, ward meal plans and kitchen sheet" tabs={[
    { id: 'orders', label: 'Diet orders', path: '/dietetics/orders', createLabel: 'New diet order', invalidate: ['/dietetics'],
      columns: [{ key: 'patientId', header: 'Patient', render: (o: any) => <PatientName id={o.patientId} withMrn /> }, { key: 'dietType', header: 'Diet' }, { key: 'texture', header: 'Texture' }, { key: 'allergies', header: 'Allergies' }, { key: 'notes', header: 'Notes' }, { key: 'startAt', header: 'Since', render: (o: any) => dateTime(o.startAt) }],
      fields: [{ name: 'admissionId', label: 'Admission', type: 'picker', source: SPICK.admission, required: true }, { name: 'dietType', label: 'Diet', type: 'select', options: DIETS, required: true }, { name: 'texture', label: 'Texture', type: 'select', options: ['REGULAR', 'MINCED', 'PUREED', 'LIQUID'] }, { name: 'allergies', label: 'Food allergies' }, { name: 'notes', label: 'Notes', type: 'textarea' }],
      actions: [{ label: 'Stop diet order', tone: 'danger', path: (o: any) => `/dietetics/orders/${o.id}/stop` }] },
    { id: 'kitchen', label: 'Meal plans & kitchen sheet', custom: <Kitchen /> },
  ]} />;
}
