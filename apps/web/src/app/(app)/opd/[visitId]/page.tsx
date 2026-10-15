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
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { PICK } from '@/lib/pickers';
import { EntityPicker } from '@/components/EntityPicker';
import { age, dateTime, fullName } from '@/lib/format';
import { AiIcdSuggest, AiSoapDictation } from '@/components/AiDraft';

const VITALS = [
  ['temperatureC', 'Temp (°C)'], ['pulse', 'Pulse (bpm)'], ['respRate', 'Resp rate'], ['systolic', 'BP systolic'], ['diastolic', 'BP diastolic'],
  ['spo2', 'SpO₂ (%)'], ['weightKg', 'Weight (kg)'], ['heightCm', 'Height (cm)'], ['muacCm', 'MUAC (cm)'], ['bloodSugar', 'RBS (mmol/L)'], ['painScore', 'Pain (0–10)'],
] as const;

export default function Consultation({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = use(params);
  const [tab, setTab] = useState('triage'); const [dialog, setDialog] = useState<'' | 'admit' | 'refer'>('');
  const { data: v, isLoading, error } = useGet<any>(`/visits/${visitId}`);
  const allergies = useList<any>(v ? `/patients/${v.patientId}/allergies` : '', {}, !!v);
  const end = useAction('post', `/visits/${visitId}/close`, { invalidate: ['/visits'], success: 'Visit closed' });
  const assign = useAction('patch', `/visits/${visitId}`, { invalidate: [`/visits/${visitId}`], success: 'Attending practitioner updated' });
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
        <span className="flex items-center gap-1 text-xs text-slate-500">Attending <EntityPicker className="w-56" source={PICK.practitioner} value={v.practitionerId} placeholder="Assign practitioner" onChange={(id) => assign.mutate({ practitionerId: id || undefined })} /></span>
        {alg.length > 0 ? <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-300"><AlertTriangle className="h-3 w-3" />Allergies: {alg.map((a: any) => a.substance).join(', ')}</span> : <span className="text-xs text-slate-500">No known allergies</span>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'triage', label: 'Vitals & triage' }, { id: 'soap', label: 'SOAP note' }, { id: 'dx', label: 'Diagnosis' }, { id: 'orders', label: 'Orders' }, { id: 'rx', label: 'Prescriptions' }]} />
      {tab === 'triage' && <TriagePanel visitId={visitId} vitals={v.vitals ?? []} triage={v.triage ?? []} />}
      {tab === 'soap' && <SoapPanel visitId={visitId} existing={(v.notes ?? []).find((n: any) => n.type === 'SOAP')} />}
      {tab === 'dx' && <DiagnosisPanel visitId={visitId} />}
      {tab === 'orders' && <OrdersPanel visitId={visitId} />}
      {tab === 'rx' && <RxPanel visitId={visitId} patientId={v.patientId} />}
      <FormDialog open={dialog === 'admit'} onClose={() => setDialog('')} title="Admit patient" path="/inpatient/admissions" invalidate={['/visits', '/inpatient']} success="Patient admitted" transform={(f) => ({ ...f, visitId })} fields={[
        { name: 'wardId', label: 'Ward', type: 'picker', source: PICK.ward, required: true }, { name: 'bedId', label: 'Bed', type: 'picker', source: PICK.bed() },
        { name: 'depositMinor', label: 'Deposit (KES)', type: 'money' }, { name: 'reason', label: 'Reason / admitting diagnosis', type: 'textarea' }]} />
      <FormDialog open={dialog === 'refer'} onClose={() => setDialog('')} title="Refer patient" path="/emr/notes" invalidate={[`/visits/${visitId}`]} success="Referral recorded"
        transform={(f) => ({ visitId, type: 'PROGRESS', assessment: f.clinicalSummary, plan: `Referral (${f.direction}${f.urgency ? `, ${f.urgency}` : ''}) to ${[f.toFacility, f.toDepartment].filter(Boolean).join(' / ') || '—'}: ${f.reason}`, data: { kind: 'REFERRAL', ...f } })} fields={[
        { name: 'direction', label: 'Direction', type: 'select', options: ['OUT', 'INTERNAL'], required: true }, { name: 'toFacility', label: 'To facility (KMHFL code / name)' },
        { name: 'toDepartment', label: 'To department' }, { name: 'urgency', label: 'Urgency', type: 'select', options: ['ROUTINE', 'URGENT', 'EMERGENCY'] },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true }, { name: 'clinicalSummary', label: 'Clinical summary', type: 'textarea' }]} />
    </div>
  );
}

function TriagePanel({ visitId, vitals, triage }: { visitId: string; vitals: any[]; triage: any[] }) {
  const { register, handleSubmit, reset, watch } = useForm<Record<string, any>>();
  const qc = useQueryClient(); const toast = useToast(); const [saving, setSaving] = useState(false);
  const w = watch(['weightKg', 'heightCm']);
  const bmi = w[0] && w[1] ? (Number(w[0]) / (Number(w[1]) / 100) ** 2).toFixed(1) : null;
  const save = handleSubmit(async (f) => {
    const vals = Object.fromEntries(VITALS.map(([k]) => [k, f[k]]).filter(([, x]) => x !== '' && x != null).map(([k, x]) => [k, Number(x)]));
    if (!Object.keys(vals).length && !f.category) return toast.push('Enter at least one vital sign or a triage category', 'error');
    setSaving(true);
    try {
      let alerts: string[] = [];
      if (Object.keys(vals).length) { const r = await api.post<{ alerts?: string[] }>('/emr/vitals', { visitId, ...vals }); alerts = r?.alerts ?? []; }
      if (f.category) await api.post('/emr/triage', { visitId, category: f.category, complaint: f.complaint || undefined, emergencySign: !!f.emergencySign });
      toast.push(alerts.length ? `Saved. Alerts: ${alerts.join('; ')}` : 'Vitals saved', alerts.length ? 'error' : 'success'); reset({});
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/visits/${visitId}`) });
    } catch (e) { toast.push((e as Error).message, 'error'); } finally { setSaving(false); }
  });
  const history = [...vitals.map((x) => ({ ...x, kind: 'V', at: x.takenAt ?? x.createdAt })), ...triage.map((x) => ({ ...x, kind: 'T', at: x.createdAt }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Record vitals & triage" className="lg:col-span-2">
        <form onSubmit={save} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VITALS.map(([k, l]) => <Field key={k} label={l}><input className="input" type="number" step="any" {...register(k)} /></Field>)}
          <Field label="BMI"><input className="input" disabled value={bmi ?? ''} /></Field>
          <Field label="Triage category (SATS)" className="col-span-2"><select className="input" {...register('category')}><option value="">—</option>{['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Emergency sign"><input type="checkbox" className="h-4 w-4" {...register('emergencySign')} /></Field>
          <Field label="Chief complaint" className="col-span-2 sm:col-span-4"><input className="input" {...register('complaint')} /></Field>
          <div className="col-span-2 flex items-end justify-end sm:col-span-4"><button className="btn-primary" disabled={saving}>{saving ? <Spinner /> : <Save className="h-4 w-4" />}Save</button></div>
        </form>
      </Card>
      <Card title="History">{history.length ? <ul className="space-y-2 text-xs">{history.map((t) => <li key={t.kind + t.id} className="rounded border border-slate-200 p-2 dark:border-slate-700">
        <p className="font-medium">{dateTime(t.at)} {t.kind === 'T' && <StatusBadge status={t.category} tone={t.category === 'RED' ? 'red' : ['ORANGE', 'YELLOW'].includes(t.category) ? 'amber' : 'green'} />} {t.kind === 'V' && t.news2 != null && <span className="text-slate-500">NEWS2 {t.news2}</span>}</p>
        {t.kind === 'V' ? <p>T {t.temperatureC ?? '—'} · P {t.pulse ?? '—'} · BP {t.systolic ?? '—'}/{t.diastolic ?? '—'} · SpO₂ {t.spo2 ?? '—'} · Wt {t.weightKg ?? '—'}</p> : <p>{t.complaint ?? 'Triage'}</p>}</li>)}</ul> : <p className="text-sm text-slate-500">No vitals recorded</p>}</Card>
    </div>
  );
}

function SoapPanel({ visitId, existing }: { visitId: string; existing?: any }) {
  const { register, handleSubmit, reset } = useForm<Record<string, string>>({ defaultValues: existing ?? {} });
  useEffect(() => { if (existing) reset(existing); }, [existing, reset]);
  const create = useAction('post', '/emr/notes', { invalidate: [`/visits/${visitId}`], success: 'Note saved' });
  const update = useAction('patch', `/emr/notes/${existing?.id}`, { invalidate: [`/visits/${visitId}`], success: 'Note updated' });
  const m = existing?.id && !existing.signedAt ? update : create;
  return (
    <Card title="Clinical note (SOAP)">
      <form onSubmit={handleSubmit((f) => { const body = { subjective: f.subjective || undefined, objective: f.objective || undefined, assessment: f.assessment || undefined, plan: f.plan || undefined }; m === update ? update.mutate(body) : create.mutate({ visitId, type: 'SOAP', ...body }); })} className="grid gap-3 md:grid-cols-2">
        <AiSoapDictation visitId={visitId} onDraft={(d) => reset({ ...(existing ?? {}), ...d })} />
        {[['subjective', 'Subjective: history, presenting complaint'], ['objective', 'Objective: examination findings'], ['assessment', 'Assessment'], ['plan', 'Plan']].map(([k, l]) => <Field key={k} label={l}><textarea rows={5} className="input" {...register(k)} /></Field>)}
        <div className="flex justify-end md:col-span-2"><button className="btn-primary" disabled={m.isPending}>{m.isPending ? <Spinner /> : <Save className="h-4 w-4" />}Save note</button></div>
      </form>
    </Card>
  );
}

function DiagnosisPanel({ visitId }: { visitId: string }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const results = useGet<any>(dq.length >= 2 ? '/emr/icd11' : null, { q: dq, limit: 30 });
  const list = useList<any>('/emr/diagnoses', { visitId });
  const add = useAction('post', '/emr/diagnoses', { invalidate: ['/emr/diagnoses', `/visits/${visitId}`], success: 'Diagnosis added' });
  const del = useAction<string>('del', (id) => `/emr/diagnoses/${id}`, { invalidate: ['/emr/diagnoses', `/visits/${visitId}`] });
  const items: any[] = Array.isArray(results.data) ? results.data : results.data?.data ?? [];
  const visit = useGet<any>(`/visits/${visitId}`);
  const noteText = (visit.data?.notes ?? []).map((n: any) => [n.subjective, n.objective, n.assessment, n.plan].filter(Boolean).join('\n')).join('\n');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="ICD-11 search">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-9" placeholder="e.g. malaria, 1F40, hypertension" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {results.isFetching && <li className="p-2"><Spinner /></li>}
          {items.map((d) => <li key={d.code} className="flex items-center justify-between gap-2 py-2 text-sm"><span><span className="font-mono text-xs text-primary-700 dark:text-primary-400">{d.code}</span> {d.title}</span>
            <span className="flex gap-1"><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => add.mutate({ visitId, code: d.code, display: d.title, codeSystem: 'ICD-11', type: 'PRIMARY' })}>Primary</button><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => add.mutate({ visitId, code: d.code, display: d.title, codeSystem: 'ICD-11', type: 'SECONDARY' })}>Secondary</button></span></li>)}
        </ul>
        <AiIcdSuggest visitId={visitId} noteText={noteText} onPick={(code, display, type) => add.mutate({ visitId, code, display, codeSystem: 'ICD-11', type })} />
      </Card>
      <Card title="Visit diagnoses">
        <Table rows={list.data?.data ?? []} columns={[{ key: 'code', header: 'Code' }, { key: 'display', header: 'Diagnosis' }, { key: 'type', header: 'Type', render: (d: any) => <StatusBadge status={d.type} /> }, { key: 'x', header: '', render: (d: any) => <button onClick={() => del.mutate(d.id)} aria-label="Remove"><Trash2 className="h-4 w-4 text-red-500" /></button> }]} />
      </Card>
    </div>
  );
}

function OrdersPanel({ visitId }: { visitId: string }) {
  const [type, setType] = useState('LAB'); const [q, setQ] = useState(''); const dq = useDebounced(q);
  const catalog = useList<any>('/pricing/service-items', { q: dq || undefined, category: type, pageSize: 15 });
  const orders = useList<any>('/orders', { visitId, pageSize: 100 });
  const add = useAction('post', '/orders', { invalidate: ['/orders', `/visits/${visitId}`], success: 'Order placed' });
  const cancel = useAction<string>('post', (id) => `/orders/${id}/cancel`, { invalidate: ['/orders', `/visits/${visitId}`] });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="New order">
        <div className="mb-2 grid grid-cols-3 gap-2">{['LAB', 'IMAGING', 'PROCEDURE'].map((t) => <button key={t} className={type === t ? 'btn-primary' : 'btn-secondary'} onClick={() => setType(t)}>{t}</button>)}</div>
        <input className="input" placeholder={`Search ${type.toLowerCase()} tests/services…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {(catalog.data?.data ?? []).map((s) => <li key={s.id} className="flex items-center justify-between py-2 text-sm"><span>{s.name} <span className="text-xs text-slate-500">{s.code}</span></span><button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => add.mutate({ visitId, type, serviceId: s.id, priority: 'ROUTINE' })}><Plus className="h-3 w-3" />Order</button></li>)}
        </ul>
      </Card>
      <Card title="Orders on this visit">
        <Table rows={orders.data?.data ?? []} columns={[{ key: 'type', header: 'Type' }, { key: 'description', header: 'Item' }, { key: 'status', header: 'Status', render: (o: any) => <StatusBadge status={o.status} /> }, { key: 'result', header: 'Result', render: (o: any) => o.labResults?.length ? o.labResults.map((r: any) => `${r.testCode} ${r.value}${r.unit ? ' ' + r.unit : ''}${r.flag ? ` (${r.flag})` : ''}`).join('; ') : o.imagingReport?.impression ?? '—' }, { key: 'x', header: '', render: (o: any) => ['REQUESTED', 'PAID'].includes(o.status) ? <button onClick={() => cancel.mutate(o.id)} aria-label="Cancel"><X className="h-4 w-4 text-red-500" /></button> : null }]} />
      </Card>
    </div>
  );
}

interface Warning { type?: 'ALLERGY' | 'DUPLICATE'; severity: 'HIGH' | 'MEDIUM' | string; message: string }
function RxPanel({ visitId, patientId }: { visitId: string; patientId: string }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const drugs = useList<any>('/inventory/items', { q: dq, category: 'DRUG', pageSize: 10 }, dq.length >= 2);
  const qc = useQueryClient(); const toast = useToast(); const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<any[]>([]); const [warnings, setWarnings] = useState<Warning[]>([]); const [checking, setChecking] = useState(false);
  const existing = useList<any>('/pharmacy/prescriptions', { visitId, pageSize: 100 });
  useEffect(() => {
    if (!lines.length) { setWarnings([]); return; }
    setChecking(true);
    Promise.all(lines.map((l) => api.post<Warning[]>('/pharmacy/prescriptions/check', { visitId, itemId: l.drugId }).catch(() => [] as Warning[])))
      .then((r) => setWarnings(r.flat())).finally(() => setChecking(false));
  }, [lines.length, visitId]); // eslint-disable-line
  const submit = async () => {
    setSaving(true);
    try {
      for (const l of lines) {
        await api.post('/pharmacy/prescriptions', { visitId, itemId: l.drugId, dose: l.dose || '1', frequency: l.frequency, route: l.route, durationDays: Number(l.durationDays) || undefined, quantity: l.quantity ? Number(l.quantity) : undefined, overrideWarnings: severe || undefined, overrideReason: severe ? 'Prescriber override after review' : undefined });
      }
      toast.push('Prescription sent to pharmacy', 'success'); setLines([]); setWarnings([]);
      qc.invalidateQueries({ predicate: (q) => ['/pharmacy', `/visits/${visitId}`].some((k) => String(q.queryKey[0]).startsWith(k)) });
    } catch (e) { toast.push((e as Error).message, 'error'); } finally { setSaving(false); }
  };
  const upd = (i: number, k: string, val: any) => setLines(lines.map((l, j) => j === i ? { ...l, [k]: val } : l));
  const severe = warnings.some((w) => w.severity === 'HIGH');
  return (
    <div className="space-y-4">
      <Card title="Prescribe">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-9" placeholder="Search drug by generic or brand name…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {dq.length >= 2 && <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">{(drugs.data?.data ?? []).map((d) => <li key={d.id}><button className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setLines([...lines, { drugId: d.id, name: d.name ?? d.genericName, strength: d.strength, dose: '', frequency: 'TDS', durationDays: 5, route: 'PO', quantity: '' }]); setQ(''); }}>{d.name ?? d.genericName} {d.strength} <span className="text-xs text-slate-500">{d.form} · {d.unit}</span></button></li>)}</ul>}
        {warnings.length > 0 && <div className="mt-3 space-y-1">{warnings.map((w, i) => <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${w.severity === 'HIGH' ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>{w.type ?? w.severity}</b>: {w.message}</span></div>)}</div>}
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
          <div className="mt-3 flex justify-end"><button className={severe ? 'btn-danger' : 'btn-primary'} disabled={saving || lines.some((l) => !l.dose)} onClick={submit}>{saving && <Spinner />}{severe ? 'Override warnings & prescribe' : 'Send to pharmacy'}</button></div></div>}
      </Card>
      <Card title="Prescriptions on this visit">
        <Table rows={existing.data?.data ?? []} columns={[{ key: 'drugName', header: 'Drug' }, { key: 'sig', header: 'Sig', render: (r: any) => `${r.dose} ${r.route ?? ''} ${r.frequency}${r.durationDays ? ` × ${r.durationDays}d` : ''}` }, { key: 'quantity', header: 'Qty' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }, { key: 'createdAt', header: 'Time', render: (r: any) => dateTime(r.createdAt) }]} />
      </Card>
    </div>
  );
}
