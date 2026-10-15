'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { FormDialog } from '@/components/FormDialog';
import { PatientName } from '@/components/PatientName';
import { StatusBadge, Tabs } from '@/components/ui';
import { date } from '@/lib/format';
import { PICK } from '@/lib/pickers';

export default function Maternity() {
  const [tab, setTab] = useState('anc'); const [sel, setSel] = useState<any>(null); const [dlg, setDlg] = useState<'' | 'anc' | 'delivery'>('');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'anc', label: 'Pregnancies (ANC)' }, { id: 'defaulters', label: 'Immunisation defaulters' }]} />;
  const visit = { path: '/visits', query: { patientId: sel?.patientId, status: 'OPEN,IN_PROGRESS,ADMITTED' }, label: (v: any) => v.visitNumber, sub: (v: any) => v.type };
  if (tab === 'defaulters') return <CrudPage title="Maternity" subtitle="Children overdue for immunisation" path="/maternity/immunizations/defaulters" searchable={false} columns={[
    { key: 'patient', header: 'Child', render: (r: any) => <PatientName id={r.patientId} withMrn /> }, { key: 'vaccine', header: 'Vaccine' }, { key: 'dose', header: 'Dose' }, { key: 'dueDate', header: 'Due', render: (r: any) => date(r.dueDate) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }]}>{tabs}</CrudPage>;
  return <CrudPage title="Maternity" subtitle="Antenatal care register (MOH 405)" path="/maternity/pregnancies" createLabel="Register pregnancy" searchable={false} onRowClick={(r) => { setSel(r); setDlg('anc'); }} columns={[
    { key: 'patient', header: 'Mother', render: (r: any) => <PatientName id={r.patientId} withMrn /> }, { key: 'gravida', header: 'G' }, { key: 'parity', header: 'P' },
    { key: 'lmp', header: 'LMP', render: (r: any) => date(r.lmp) }, { key: 'edd', header: 'EDD', render: (r: any) => date(r.edd) }, { key: 'anc', header: 'ANC visits', render: (r: any) => (r.ancVisits ?? []).length },
    { key: 'risk', header: 'Risk', render: (r: any) => r.riskFlags?.length ? <StatusBadge status={r.riskFlags.join(', ')} tone="red" /> : <StatusBadge status="NORMAL" /> }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'a', header: '', render: (r: any) => r.status === 'ACTIVE' ? <button className="btn-secondary py-1 text-xs" onClick={(e) => { e.stopPropagation(); setSel(r); setDlg('delivery'); }}>Record delivery</button> : null }]}
    transform={(v) => ({ ...v, gravida: v.gravida ? Number(v.gravida) : undefined, parity: v.parity !== undefined ? Number(v.parity) : undefined })}
    fields={[{ name: 'patientId', label: 'Mother', type: 'picker', source: PICK.patient, required: true }, { name: 'lmp', label: 'LMP', type: 'date' }, { name: 'gravida', label: 'Gravida', type: 'number' }, { name: 'parity', label: 'Parity', type: 'number' }]}>
    {tabs}<p className="mb-3 text-xs text-slate-500">Click a pregnancy to record an ANC visit.</p>
    <FormDialog open={dlg === 'anc'} onClose={() => setDlg('')} title="ANC visit" path={`/maternity/pregnancies/${sel?.id}/anc-visits`} invalidate={['/maternity']} success="ANC visit recorded"
      transform={(v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ['weightKg', 'systolic', 'diastolic', 'fundalHeightCm', 'fetalHeartRate', 'hb'].includes(k) ? Number(x) : x]))} fields={[
      { name: 'weightKg', label: 'Weight (kg)', type: 'number' }, { name: 'systolic', label: 'BP systolic', type: 'number' }, { name: 'diastolic', label: 'BP diastolic', type: 'number' }, { name: 'fundalHeightCm', label: 'Fundal height (cm)', type: 'number' },
      { name: 'fetalHeartRate', label: 'Fetal heart rate', type: 'number' }, { name: 'hb', label: 'Hb (g/dL)', type: 'number' }, { name: 'urineProtein', label: 'Urine protein', type: 'select', options: ['NIL', 'TRACE', '+', '++', '+++'] }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />
    <FormDialog open={dlg === 'delivery'} onClose={() => setDlg('')} title="Record delivery" path={`/maternity/pregnancies/${sel?.id}/delivery`} invalidate={['/maternity']} success="Delivery recorded"
      transform={(v) => ({ visitId: v.visitId, deliveredAt: new Date(v.deliveredAt).toISOString(), mode: v.mode, outcome: v.outcome, babies: [{ sex: v.babySex, weightKg: v.weightKg ? Number(v.weightKg) : undefined, apgar1: v.apgar1 ? Number(v.apgar1) : undefined, apgar5: v.apgar5 ? Number(v.apgar5) : undefined, alive: v.outcome === 'LIVE_BIRTH' }] })} fields={[
      { name: 'visitId', label: 'Visit', type: 'picker', source: visit, required: true }, { name: 'deliveredAt', label: 'Delivery time', type: 'datetime-local', required: true },
      { name: 'mode', label: 'Mode', type: 'select', options: ['SVD', 'CS', 'ASSISTED', 'BREECH'], required: true }, { name: 'outcome', label: 'Outcome', type: 'select', options: ['LIVE_BIRTH', 'FRESH_STILLBIRTH', 'MACERATED_STILLBIRTH'], required: true },
      { name: 'babySex', label: 'Baby sex', type: 'select', options: ['MALE', 'FEMALE', 'INTERSEX', 'UNKNOWN'], required: true }, { name: 'weightKg', label: 'Birth weight (kg)', type: 'number' }, { name: 'apgar1', label: 'APGAR 1 min', type: 'number' }, { name: 'apgar5', label: 'APGAR 5 min', type: 'number' }]} />
  </CrudPage>;
}
