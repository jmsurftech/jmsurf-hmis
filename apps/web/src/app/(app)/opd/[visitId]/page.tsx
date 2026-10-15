'use client';
import { AlertTriangle, BedDouble, Plus, Save, Search, Send, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounced, Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { Card, ErrorNote, Field, Loading, PageHeader, Spinner, StatusBadge, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useGet, useList } from '@/lib/hooks';
import { age, dateTime, fullName } from '@/lib/format';

const VITALS = [
  ['temperatureC', 'Temp (°C)'], ['pulse', 'Pulse (bpm)'], ['respRate', 'Resp rate'], ['systolic', 'BP systolic'], ['diastolic', 'BP diastolic'],
  ['spo2', 'SpO₂ (%)'], ['weightKg', 'Weight (kg)'], ['heightCm', 'Height (cm)'], ['muacCm', 'MUAC (cm)'], ['glucose', 'RBS (mmol/L)'], ['painScore', 'Pain (0–10)'],
] as const;

export default function Consultation({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = use(params);
  const [tab, setTab] = useState('triage'); const [dialog, setDialog] = useState<'' | 'admit' | 'refer'>('');
  const { data: v, isLoading, error } = useGet<any>(`/visits/${visitId}`);
  const allergies = useList<any>(v ? `/patients/${v.patientId}/allergies` : '', {}, !!v);
  const end = useAction('post', `/visits/${visitId}/close`, { invalidate: ['/visits'], success: 'Visit closed' });
  if (isLoading) return <Loading />;
  if (error || !v) return <ErrorNote error={error ?? new Error('Visit not found')} />;
  const alg = allergies.data?.data ?? [];
  return (
    <div>
      <PageHeader title={fullName(v.patient)} subtitle={`${v.visitNumber} · ${v.patient?.sex ?? ''} · ${age(v.patient?.dateOfBirth)} · ${v.payerType} · started ${dateTime(v.startedAt)}`}
        actions={<><Link href={`/patients/${v.patientId}`} className="btn-secondary">Profile</Link>
          <button className="btn-secondary" onClick={() => setDialog('refer')}><Send className="h-4 w-4" />Refer</button>
          <button className="btn-secondary" onClick={() => setDialog('admit')}><BedDouble className="h-4 w-4" />Admit</button>
          <button className="btn-primary" onClick={() => end.mutate({})}>End visit</button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><StatusBadge status={v.status} />
        {alg.length > 0 ? <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-300"><AlertTriangle className="h-3 w-3" />Allergies: {alg.map((a: any) => a.substance).join(', ')}</span> : <span className="text-xs text-slate-500">No known allergies</span>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'triage', label: 'Vitals & triage' }, { id: 'soap', label: 'SOAP note' }, { id: 'dx', label: 'Diagnosis' }, { id: 'orders', label: 'Orders' }, { id: 'rx', label: 'Prescriptions' }]} />
      {tab === 'triage' && <TriagePanel visitId={visitId} history={v.triage ?? []} />}
      {tab === 'soap' && <SoapPanel visitId={visitId} existing={v.notes?.[0] ?? v.consultation} />}
      {tab === 'dx' && <DiagnosisPanel visitId={visitId} />}
      {tab === 'orders' && <OrdersPanel visitId={visitId} />}
      {tab === 'rx' && <RxPanel visitId={visitId} patientId={v.patientId} />}
      <FormDialog open={dialog === 'admit'} onClose={() => setDialog('')} title="Admit patient" path="/ipd/admissions" defaults={{ visitId }} invalidate={['/visits', '/ipd']} success="Admission requested" fields={[
        { name: 'visitId', label: 'Visit', required: true }, { name: 'wardId', label: 'Ward ID', required: true }, { name: 'bedId', label: 'Bed ID' },
        { name: 'admittingDiagnosis', label: 'Admitting diagnosis', full: true }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />
      <FormDialog open={dialog === 'refer'} onClose={() => setDialog('')} title="Refer patient" path={`/visits/${visitId}/referrals`} success="Referral created" fields={[
        { name: 'direction', label: 'Direction', type: 'select', options: ['OUT', 'INTERNAL'], required: true }, { name: 'toFacility', label: 'To facility (KMHFL code / name)' },
        { name: 'toDepartment', label: 'To department' }, { name: 'urgency', label: 'Urgency', type: 'select', options: ['ROUTINE', 'URGENT', 'EMERGENCY'] },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true }, { name: 'clinicalSummary', label: 'Clinical summary', type: 'textarea' }]} />
    </div>
  );
}

function TriagePanel({ visitId, history }: { visitId: string; history: any[] }) {
  const { register, handleSubmit, reset, watch } = useForm<Record<string, any>>();
  const m = useAction('post', `/visits/${visitId}/triage`, { invalidate: [`/visits/${visitId}`], success: 'Vitals saved', onSuccess: () => reset({}) });
  const w = watch(['weightKg', 'heightCm']);
  const bmi = w[0] && w[1] ? (Number(w[0]) / (Number(w[1]) / 100) ** 2).toFixed(1) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Record vitals" className="lg:col-span-2">
        <form onSubmit={handleSubmit((f) => m.mutate(Object.fromEntries(Object.entries(f).filter(([, x]) => x !== '' && x != null).map(([k, x]) => [k, ['category', 'chiefComplaint'].includes(k) ? x : Number(x)]))))} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VITALS.map(([k, l]) => <Field key={k} label={l}><input className="input" type="number" step="any" {...register(k)} /></Field>)}
          <Field label="BMI"><input className="input" disabled value={bmi ?? ''} /></Field>
          <Field label="Triage category" className="col-span-2"><select className="input" {...register('category')}><option value="">—</option>{['EMERGENCY', 'PRIORITY', 'QUEUE'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Chief complaint" className="col-span-2"><input className="input" {...register('chiefComplaint')} /></Field>
          <div className="col-span-2 flex items-end justify-end sm:col-span-4"><button className="btn-primary" disabled={m.isPending}>{m.isPending ? <Spinner /> : <Save className="h-4 w-4" />}Save vitals</button></div>
        </form>
      </Card>
      <Card title="History">{history.length ? <ul className="space-y-2 text-xs">{history.map((t) => <li key={t.id} className="rounded border border-slate-200 p-2 dark:border-slate-700"><p className="font-medium">{dateTime(t.createdAt)} {t.category && <StatusBadge status={t.category} tone={t.category === 'EMERGENCY' ? 'red' : t.category === 'PRIORITY' ? 'amber' : 'green'} />}</p><p>T {t.temperatureC ?? '—'} · P {t.pulse ?? '—'} · BP {t.systolic ?? '—'}/{t.diastolic ?? '—'} · SpO₂ {t.spo2 ?? '—'} · Wt {t.weightKg ?? '—'}</p></li>)}</ul> : <p className="text-sm text-slate-500">No vitals recorded</p>}</Card>
    </div>
  );
}

function SoapPanel({ visitId, existing }: { visitId: string; existing?: any }) {
  const { register, handleSubmit, reset } = useForm<Record<string, string>>({ defaultValues: existing ?? {} });
  useEffect(() => { if (existing) reset(existing); }, [existing, reset]);
  const m = useAction('post', `/visits/${visitId}/notes`, { invalidate: [`/visits/${visitId}`], success: 'Note saved' });
  return (
    <Card title="Clinical note (SOAP)">
      <form onSubmit={handleSubmit((f) => m.mutate({ type: 'SOAP', ...f }))} className="grid gap-3 md:grid-cols-2">
        {[['subjective', 'Subjective: history, presenting complaint'], ['objective', 'Objective: examination findings'], ['assessment', 'Assessment'], ['plan', 'Plan']].map(([k, l]) => <Field key={k} label={l}><textarea rows={5} className="input" {...register(k)} /></Field>)}
        <div className="flex justify-end md:col-span-2"><button className="btn-primary" disabled={m.isPending}>{m.isPending ? <Spinner /> : <Save className="h-4 w-4" />}Save note</button></div>
      </form>
    </Card>
  );
}

function DiagnosisPanel({ visitId }: { visitId: string }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const results = useGet<any>(dq.length >= 2 ? '/diagnoses/icd' : null, { q: dq });
  const list = useList<any>(`/visits/${visitId}/diagnoses`);
  const add = useAction('post', `/visits/${visitId}/diagnoses`, { invalidate: [`/visits/${visitId}`], success: 'Diagnosis added' });
  const del = useAction<string>('del', (id) => `/visits/${visitId}/diagnoses/${id}`, { invalidate: [`/visits/${visitId}`] });
  const items: any[] = Array.isArray(results.data) ? results.data : results.data?.data ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="ICD-11 search">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-9" placeholder="e.g. malaria, 1F40, hypertension" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {results.isFetching && <li className="p-2"><Spinner /></li>}
          {items.map((d) => <li key={d.code} className="flex items-center justify-between gap-2 py-2 text-sm"><span><span className="font-mono text-xs text-primary-700 dark:text-primary-400">{d.code}</span> {d.title}</span>
            <span className="flex gap-1"><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => add.mutate({ code: d.code, title: d.title, system: 'ICD-11', rank: 'PRIMARY' })}>Primary</button><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => add.mutate({ code: d.code, title: d.title, system: 'ICD-11', rank: 'SECONDARY' })}>Secondary</button></span></li>)}
        </ul>
      </Card>
      <Card title="Visit diagnoses">
        <Table rows={list.data?.data ?? []} columns={[{ key: 'code', header: 'Code' }, { key: 'title', header: 'Diagnosis' }, { key: 'rank', header: 'Rank', render: (d: any) => <StatusBadge status={d.rank ?? d.type} /> }, { key: 'x', header: '', render: (d: any) => <button onClick={() => del.mutate(d.id)} aria-label="Remove"><Trash2 className="h-4 w-4 text-red-500" /></button> }]} />
      </Card>
    </div>
  );
}

function OrdersPanel({ visitId }: { visitId: string }) {
  const [type, setType] = useState('LAB'); const [q, setQ] = useState(''); const dq = useDebounced(q);
  const catalog = useList<any>('/service-items', { q: dq, category: type, pageSize: 15 }, dq.length >= 1);
  const orders = useList<any>(`/visits/${visitId}/orders`);
  const add = useAction('post', `/visits/${visitId}/orders`, { invalidate: [`/visits/${visitId}`], success: 'Order placed' });
  const cancel = useAction<string>('post', (id) => `/orders/${id}/cancel`, { invalidate: [`/visits/${visitId}`] });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="New order">
        <div className="mb-2 grid grid-cols-3 gap-2">{['LAB', 'IMAGING', 'PROCEDURE'].map((t) => <button key={t} className={type === t ? 'btn-primary' : 'btn-secondary'} onClick={() => setType(t)}>{t}</button>)}</div>
        <input className="input" placeholder={`Search ${type.toLowerCase()} tests/services…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {(catalog.data?.data ?? []).map((s) => <li key={s.id} className="flex items-center justify-between py-2 text-sm"><span>{s.name} <span className="text-xs text-slate-500">{s.code}</span></span><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => add.mutate({ type, serviceItemId: s.id, priority: 'ROUTINE' })}><Plus className="h-3 w-3" />Order</button></li>)}
        </ul>
      </Card>
      <Card title="Orders on this visit">
        <Table rows={orders.data?.data ?? []} columns={[{ key: 'type', header: 'Type' }, { key: 'name', header: 'Item', render: (o: any) => o.serviceItem?.name ?? o.name }, { key: 'status', header: 'Status', render: (o: any) => <StatusBadge status={o.status} /> }, { key: 'result', header: 'Result', render: (o: any) => o.resultSummary ?? '—' }, { key: 'x', header: '', render: (o: any) => o.status === 'REQUESTED' ? <button onClick={() => cancel.mutate(o.id)} aria-label="Cancel"><X className="h-4 w-4 text-red-500" /></button> : null }]} />
      </Card>
    </div>
  );
}

interface Warning { severity: 'MAJOR' | 'MODERATE' | 'MINOR' | 'CONTRAINDICATED' | string; message: string; drugs?: string[] }
function RxPanel({ visitId, patientId }: { visitId: string; patientId: string }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const drugs = useList<any>('/pharmacy/drugs', { q: dq, pageSize: 10 }, dq.length >= 2);
  const [lines, setLines] = useState<any[]>([]); const [warnings, setWarnings] = useState<Warning[]>([]); const [checking, setChecking] = useState(false);
  const existing = useList<any>(`/visits/${visitId}/prescriptions`);
  const save = useAction('post', `/visits/${visitId}/prescriptions`, { invalidate: [`/visits/${visitId}`], success: 'Prescription sent to pharmacy', onSuccess: () => { setLines([]); setWarnings([]); } });
  useEffect(() => {
    if (!lines.length) { setWarnings([]); return; }
    setChecking(true);
    api.post<{ warnings: Warning[] }>('/pharmacy/interactions/check', { patientId, drugIds: lines.map((l) => l.drugId) })
      .then((r) => setWarnings(r?.warnings ?? [])).catch(() => setWarnings([])).finally(() => setChecking(false));
  }, [lines.length, patientId]); // eslint-disable-line
  const upd = (i: number, k: string, val: any) => setLines(lines.map((l, j) => j === i ? { ...l, [k]: val } : l));
  const severe = warnings.some((w) => ['MAJOR', 'CONTRAINDICATED'].includes(w.severity));
  return (
    <div className="space-y-4">
      <Card title="Prescribe">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-9" placeholder="Search drug by generic or brand name…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {dq.length >= 2 && <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">{(drugs.data?.data ?? []).map((d) => <li key={d.id}><button className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setLines([...lines, { drugId: d.id, name: d.name ?? d.genericName, strength: d.strength, dose: '', frequency: 'TDS', durationDays: 5, route: 'PO', quantity: '' }]); setQ(''); }}>{d.name ?? d.genericName} {d.strength} <span className="text-xs text-slate-500">{d.form} · stock {d.stockOnHand ?? '—'}</span></button></li>)}</ul>}
        {warnings.length > 0 && <div className="mt-3 space-y-1">{warnings.map((w, i) => <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${['MAJOR', 'CONTRAINDICATED'].includes(w.severity) ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>{w.severity}</b>: {w.message}</span></div>)}</div>}
        {checking && <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Spinner />Checking interactions and allergies…</p>}
        {lines.length > 0 && <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{['Drug', 'Dose', 'Freq', 'Route', 'Days', 'Qty', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>
          {lines.map((l, i) => <tr key={i}><td className="td font-medium">{l.name} {l.strength}</td>
            <td className="td"><input className="input w-20" value={l.dose} onChange={(e) => upd(i, 'dose', e.target.value)} placeholder="500mg" /></td>
            <td className="td"><select className="input w-24" value={l.frequency} onChange={(e) => upd(i, 'frequency', e.target.value)}>{['OD', 'BD', 'TDS', 'QID', 'PRN', 'STAT', 'NOCTE'].map((f) => <option key={f}>{f}</option>)}</select></td>
            <td className="td"><select className="input w-20" value={l.route} onChange={(e) => upd(i, 'route', e.target.value)}>{['PO', 'IV', 'IM', 'SC', 'TOP', 'PR', 'INH'].map((f) => <option key={f}>{f}</option>)}</select></td>
            <td className="td"><input className="input w-16" type="number" value={l.durationDays} onChange={(e) => upd(i, 'durationDays', Number(e.target.value))} /></td>
            <td className="td"><input className="input w-16" type="number" value={l.quantity} onChange={(e) => upd(i, 'quantity', e.target.value)} /></td>
            <td className="td"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-red-500" /></button></td></tr>)}
        </tbody></table>
          <div className="mt-3 flex justify-end"><button className={severe ? 'btn-danger' : 'btn-primary'} disabled={save.isPending} onClick={() => save.mutate({ items: lines.map(({ name: _n, strength: _s, ...l }) => ({ ...l, quantity: l.quantity ? Number(l.quantity) : undefined })), overrideWarnings: severe })}>{save.isPending && <Spinner />}{severe ? 'Override warnings & prescribe' : 'Send to pharmacy'}</button></div></div>}
      </Card>
      <Card title="Prescriptions on this visit">
        <Table rows={existing.data?.data ?? []} columns={[{ key: 'number', header: 'Rx', render: (r: any) => r.rxNumber ?? r.id.slice(0, 8) }, { key: 'items', header: 'Items', render: (r: any) => (r.items ?? []).map((i: any) => `${i.drug?.name ?? i.name} ${i.dose ?? ''} ${i.frequency ?? ''}`).join('; ') }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }, { key: 'createdAt', header: 'Time', render: (r: any) => dateTime(r.createdAt) }]} />
      </Card>
    </div>
  );
}
