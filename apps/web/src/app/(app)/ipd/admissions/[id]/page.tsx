'use client';
import { BedDouble, CalendarClock, Check, HeartPulse, LogOut, NotebookPen, Pill, Plus, Wallet, X } from 'lucide-react';
import { use, useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { Avatar, Card, EmptyState, ErrorNote, KV, Loading, PageHeader, StatCard, StatusBadge, Tabs, humanize } from '@/components/ui';
import { useAction, useGet, useList } from '@/lib/hooks';
import { date, dateTime, fullName, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';

export default function Admission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState('notes'); const [dlg, setDlg] = useState<'' | 'note' | 'discharge' | 'transfer' | 'schedule'>('');
  const { data: a, isLoading, error } = useGet<any>(`/inpatient/admissions/${id}`);
  const notes = useList<any>('/emr/notes', { visitId: a?.visitId }, !!a && tab === 'notes');
  const mar = useList<any>(`/inpatient/admissions/${id}/mar`, {}, tab === 'emar');
  const give = useAction<{ id: string; status: string; note?: string }>('post', (b) => `/inpatient/mar/${b.id}`, { invalidate: ['/inpatient'], success: 'Recorded' });
  if (isLoading) return <Loading />;
  if (error || !a) return <ErrorNote error={error ?? new Error('Admission not found')} />;
  const p = a.visit?.patient; const active = !a.dischargedAt;
  const los = Math.max(1, Math.ceil(((a.dischargedAt ? new Date(a.dischargedAt).getTime() : Date.now()) - new Date(a.admittedAt).getTime()) / 864e5));
  const nursing = (notes.data?.data ?? []).filter((n: any) => ['NURSING', 'WARD_ROUND', 'PROGRESS'].includes(n.type));
  return (
    <div>
      <PageHeader eyebrow={<StatusBadge status={active ? 'ADMITTED' : 'DISCHARGED'} />} title={<span className="flex items-center gap-3"><Avatar name={fullName(p)} size={44} />{fullName(p)}</span>} subtitle={`${p?.mrn ?? ''} · ${a.visit?.visitNumber ?? ''} · admitted ${date(a.admittedAt)}`}
        actions={active && <><button className="btn" onClick={() => setDlg('transfer')}>Transfer bed</button><button className="btn primary" onClick={() => setDlg('discharge')}><LogOut className="h-4 w-4" />Discharge</button></>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ward and bed" value={a.bed?.label ?? '—'} hint={a.ward?.name} icon={BedDouble} />
        <StatCard label="Length of stay" value={`${los} day${los === 1 ? '' : 's'}`} hint={`Since ${date(a.admittedAt)}`} icon={CalendarClock} tone="blue" />
        <StatCard label="Payer" value={humanize(a.visit?.payerType ?? 'CASH')} icon={Wallet} tone="teal" />
        <StatCard label="Deposit" value={money(a.depositMinor ?? 0)} icon={HeartPulse} tone="violet" />
      </div>
      <Card className="mb-4" title="Admission"><KV items={[['Reason', a.reason], ['Diagnoses', (a.visit?.diagnoses ?? []).map((d: any) => d.display).join(', ') || '—'], ['Payer', a.visit?.payerType], ['Length of stay', `${Math.max(1, Math.ceil(((a.dischargedAt ? new Date(a.dischargedAt).getTime() : Date.now()) - new Date(a.admittedAt).getTime()) / 864e5))} days`], ['Discharged', date(a.dischargedAt)]]} /></Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'notes', label: 'Nursing notes', icon: NotebookPen }, { id: 'emar', label: 'Medication chart (eMAR)', icon: Pill }]} />
      {tab === 'notes' && <Card title="Nursing notes" actions={active && <button className="btn sm" onClick={() => setDlg('note')}><Plus className="h-4 w-4" />Add note</button>}>
        <ul className="m-0 list-none space-y-3 p-0">{nursing.map((n: any) => <li key={n.id} className="border-l-2 border-brand pl-3 text-sm"><p className="text-xs text-slate-500">{dateTime(n.createdAt)} · {n.type.replace('_', ' ')}{n.data?.shift ? ` · ${n.data.shift}` : ''}</p><p className="whitespace-pre-wrap">{[n.subjective, n.objective, n.assessment, n.plan].filter(Boolean).join('\n')}</p></li>)}</ul>
        {!nursing.length && <EmptyState title="No nursing notes yet" message="Add a note each shift." />}
      </Card>}
      {tab === 'emar' && <Card flush title="Medication administration record" actions={active && <button className="btn sm" onClick={() => setDlg('schedule')}><CalendarClock className="h-4 w-4" />Schedule doses</button>}>
        <Table rows={mar.data?.data ?? []} columns={[
          { key: 'scheduledAt', header: 'Due', render: (m: any) => <span className={m.overdue ? 'text-red-600' : ''}>{dateTime(m.scheduledAt)}</span> }, { key: 'drug', header: 'Medication', render: (m: any) => `${m.prescription?.drugName ?? ''} ${m.prescription?.dose ?? ''} ${m.prescription?.route ?? ''}` },
          { key: 'status', header: 'Status', render: (m: any) => <StatusBadge status={m.overdue ? 'OVERDUE' : m.status} /> }, { key: 'givenAt', header: 'Given', render: (m: any) => dateTime(m.givenAt) },
          { key: 'a', header: '', render: (m: any) => m.status === 'SCHEDULED' ? <span className="flex gap-1"><button className="btn primary xs" onClick={() => give.mutate({ id: m.id, status: 'GIVEN' })}><Check className="h-3 w-3" />Given</button><button className="btn xs" onClick={() => { const note = prompt('Reason for holding this dose?'); if (note) give.mutate({ id: m.id, status: 'HELD', note }); }}><X className="h-3 w-3" />Held</button></span> : null },
        ]} />
      </Card>}
      <FormDialog open={dlg === 'note'} onClose={() => setDlg('')} title="Nursing note" path="/emr/notes" invalidate={['/emr/notes']} transform={(v) => ({ visitId: a.visitId, type: 'NURSING', subjective: v.note, data: v.shift ? { shift: v.shift } : undefined })} fields={[{ name: 'shift', label: 'Shift', type: 'select', options: ['DAY', 'NIGHT'] }, { name: 'note', label: 'Note', type: 'textarea', required: true }]} />
      <FormDialog open={dlg === 'schedule'} onClose={() => setDlg('')} title="Schedule medication doses" path={`/inpatient/admissions/${id}/mar/schedule`} invalidate={['/inpatient']} success="Doses scheduled" fields={[
        { name: 'prescriptionId', label: 'Prescription', type: 'select', required: true, options: (a.visit?.prescriptions ?? []).map((r: any) => ({ value: r.id, label: `${r.drugName} ${r.dose} ${r.frequency}` })) }, { name: 'days', label: 'Days', type: 'number' }]} />
      <FormDialog open={dlg === 'transfer'} onClose={() => setDlg('')} title="Transfer bed" path={`/inpatient/admissions/${id}/transfer`} invalidate={['/inpatient']} fields={[
        { name: 'wardId', label: 'Ward', type: 'picker', source: PICK.ward, required: true }, { name: 'bedId', label: 'Bed', type: 'picker', source: PICK.bed() }, { name: 'reason', label: 'Reason' }]} />
      <FormDialog open={dlg === 'discharge'} onClose={() => setDlg('')} title="Discharge patient" path={`/inpatient/admissions/${id}/discharge`} invalidate={['/inpatient']} success="Patient discharged" fields={[
        { name: 'dischargeType', label: 'Discharge type', type: 'select', options: ['NORMAL', 'AMA', 'REFERRED', 'ABSCONDED', 'DECEASED'], required: true },
        { name: 'summary', label: 'Discharge summary', type: 'textarea', required: true }]} />
    </div>
  );
}
