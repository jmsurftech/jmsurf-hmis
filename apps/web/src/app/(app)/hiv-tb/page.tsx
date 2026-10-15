'use client';
import { Download, Lock } from 'lucide-react';
import { ModulePage } from '@/components/ModulePage';
import { PatientName } from '@/components/PatientName';
import { Table } from '@/components/DataTable';
import { Card, KV, StatCard, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { downloadCsv } from '@/lib/api';
import { date, fullName } from '@/lib/format';
import { PICK } from '@/lib/pickers';

const REGIMENS = ['TDF/3TC/DTG', 'ABC/3TC/DTG', 'TDF/3TC/EFV', 'AZT/3TC/LPV/r', 'AZT/3TC/ATV/r', 'ABC/3TC/LPV/r', 'DRV/r/DTG/3TC'];
const vlText = (v: any) => !v ? '—' : v.ldl ? 'LDL' : `${Number(v.copiesPerMl).toLocaleString()} c/mL`;
const VlBadge = ({ v }: { v: any }) => !v ? <>—</> : <StatusBadge status={v.suppressed ? 'SUPPRESSED' : 'UNSUPPRESSED'} tone={v.suppressed ? 'green' : 'red'} />;

function Cascade() {
  const { data } = useGet<any>('/programmes/hiv/cascade');
  return <>
    <p className="mb-3 flex items-center gap-2 text-xs text-slate-500"><Lock className="h-3 w-3" />Sensitive programme data – restricted to clinicians; every view is recorded in the audit log.</p>
    {data && <div className="mb-4 grid gap-3 sm:grid-cols-5"><StatCard label="Active in care" value={data.active} /><StatCard label="On ART" value={data.onArt} tone="blue" /><StatCard label="PMTCT" value={data.pmtct} tone="amber" /><StatCard label="With VL result" value={data.withVl} /><StatCard label="Virally suppressed" value={data.suppressionRate != null ? `${data.suppressionRate}%` : '—'} hint={`${data.suppressed}/${data.withVl} (<1000 c/mL)`} tone="green" /></div>}
  </>;
}

function Defaulters() {
  const { data } = useGet<any[]>('/programmes/hiv/defaulters');
  return <Card title="Defaulter tracing list" className="mb-4">
    <Table rows={data ?? []} empty={<p className="text-sm text-slate-500">No missed appointments.</p>} columns={[{ key: 'cccNumber', header: 'CCC no.' }, { key: 'patient', header: 'Client', render: (r: any) => fullName(r.patient) }, { key: 'phone', header: 'Phone', render: (r: any) => r.patient?.phone ?? '—' }, { key: 'scheduledAt', header: 'Missed appt', render: (r: any) => date(r.scheduledAt) }, { key: 'daysLate', header: 'Days late' }, { key: 'category', header: 'Category', render: (r: any) => <StatusBadge status={r.category} tone={r.category === 'LTFU' ? 'red' : r.category === 'DEFAULTER' ? 'amber' : 'blue'} /> }, { key: 'pmtct', header: 'PMTCT', render: (r: any) => r.pmtct ? 'Yes' : '' }, { key: 'tracingOutcome', header: 'Last tracing' }]} />
  </Card>;
}

function HivDetail({ d }: { d: any }) {
  if (!d) return null;
  return <div className="space-y-4">
    <KV items={[['Client', <PatientName key="p" id={d.patientId} withMrn />], ['CCC no.', d.cccNumber], ['Enrolled', date(d.enrolledAt)], ['Entry point', d.entryPoint], ['WHO stage', d.whoStage], ['ART start', date(d.artStartDate)], ['Current regimen', d.currentRegimen], ['PMTCT', d.pmtct ? 'Yes' : 'No'], ['Status', <StatusBadge key="s" status={d.status} />]]} />
    <Card title="Viral load"><Table rows={d.viralLoads} empty={<p className="text-sm text-slate-500">No results.</p>} columns={[{ key: 'sampleDate', header: 'Sample date', render: (v: any) => date(v.sampleDate) }, { key: 'r', header: 'Result', render: (v: any) => vlText(v) }, { key: 'category', header: 'Category' }, { key: 's', header: 'Suppression', render: (v: any) => <VlBadge v={v} /> }]} /></Card>
    <Card title="ART regimen history"><Table rows={d.regimens} columns={[{ key: 'regimen', header: 'Regimen' }, { key: 'line', header: 'Line' }, { key: 'startDate', header: 'Start', render: (r: any) => date(r.startDate) }, { key: 'endDate', header: 'End', render: (r: any) => date(r.endDate) }, { key: 'changeReason', header: 'Reason for change' }]} /></Card>
    <Card title="Appointments"><Table rows={d.appointments} columns={[{ key: 'scheduledAt', header: 'Date', render: (a: any) => date(a.scheduledAt) }, { key: 'purpose', header: 'Purpose' }, { key: 'status', header: 'Status', render: (a: any) => <StatusBadge status={a.status} /> }, { key: 'tracingOutcome', header: 'Tracing' }]} /></Card>
  </div>;
}

const nextAppt = (d: any) => (d?.appointments ?? []).find((a: any) => a.status === 'SCHEDULED' || a.status === 'MISSED');
export default function HivTb() {
  return <ModulePage title="HIV & TB programmes" subtitle="CCC register, ART, viral load, defaulter tracing · TB register & DOT" tabs={[
    { id: 'hiv', label: 'HIV care (CCC)', path: '/programmes/hiv', searchable: true, createLabel: 'Enrol client', invalidate: ['/programmes'], custom: <Cascade />,
      columns: [{ key: 'cccNumber', header: 'CCC no.' }, { key: 'patient', header: 'Client', render: (r: any) => fullName(r.patient) }, { key: 'enrolledAt', header: 'Enrolled', render: (r: any) => date(r.enrolledAt) }, { key: 'currentRegimen', header: 'Regimen' }, { key: 'lastVl', header: 'Last VL', render: (r: any) => vlText(r.lastVl) }, { key: 'vls', header: 'Suppression', render: (r: any) => <VlBadge v={r.lastVl} /> }, { key: 'pmtct', header: 'PMTCT', render: (r: any) => r.pmtct ? <StatusBadge status="PMTCT" tone="amber" /> : '' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }],
      fields: [{ name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'cccNumber', label: 'CCC number (blank = auto)' }, { name: 'enrolledAt', label: 'Enrolment date', type: 'date' }, { name: 'entryPoint', label: 'Entry point', type: 'select', options: ['VCT', 'OPD', 'IPD', 'PMTCT', 'TB', 'CWC', 'TRANSFER_IN'] }, { name: 'whoStage', label: 'WHO stage', type: 'select', options: ['1', '2', '3', '4'] }, { name: 'regimen', label: 'Starting regimen', type: 'select', options: REGIMENS }, { name: 'artStartDate', label: 'ART start date', type: 'date' }, { name: 'pmtct', label: 'PMTCT (pregnant/breastfeeding)', type: 'checkbox' }],
      transform: (v) => ({ ...v, whoStage: v.whoStage ? Number(v.whoStage) : undefined }),
      detailPath: (r: any) => `/programmes/hiv/${r.id}`, detailTitle: (r: any) => `CCC ${r.cccNumber}`, renderDetail: (d) => <HivDetail d={d} />,
      actions: [
        { label: 'Add viral load', tone: 'primary', path: (r: any) => `/programmes/hiv/${r.id}/viral-loads`, fields: [{ name: 'sampleDate', label: 'Sample date', type: 'date', required: true }, { name: 'copiesPerMl', label: 'Copies/mL', type: 'number' }, { name: 'ldl', label: 'LDL (lower than detectable)', type: 'checkbox' }] },
        { label: 'Change regimen', path: (r: any) => `/programmes/hiv/${r.id}/regimens`, fields: [{ name: 'regimen', label: 'Regimen', type: 'select', options: REGIMENS, required: true }, { name: 'line', label: 'Line', type: 'select', options: ['FIRST', 'SECOND', 'THIRD'] }, { name: 'startDate', label: 'Start date', type: 'date' }, { name: 'changeReason', label: 'Reason', required: true }] },
        { label: 'Book appointment', path: (r: any) => `/programmes/hiv/${r.id}/appointments`, fields: [{ name: 'scheduledAt', label: 'Date', type: 'date', required: true }, { name: 'purpose', label: 'Purpose', type: 'select', options: ['CLINICAL', 'REFILL', 'VL', 'COUNSELLING'] }] },
        { label: 'Mark next appt attended', path: (r: any) => `/programmes/hiv/appointments/${nextAppt(r)?.id}/attend`, show: (r: any) => !!nextAppt(r) },
        { label: 'Record tracing', path: (r: any) => `/programmes/hiv/appointments/${nextAppt(r)?.id}/tracing`, show: (r: any) => !!nextAppt(r) && new Date(nextAppt(r).scheduledAt) < new Date(), fields: [{ name: 'tracingOutcome', label: 'Outcome', type: 'select', options: ['CONTACTED_RETURNED', 'CONTACTED_WILL_RETURN', 'NOT_REACHED', 'TRANSFERRED', 'DEAD'], required: true }, { name: 'tracingNotes', label: 'Notes', type: 'textarea' }] },
        { label: 'Update status', method: 'patch', path: (r: any) => `/programmes/hiv/${r.id}`, defaults: (r: any) => ({ status: r.status, pmtct: r.pmtct }), fields: [{ name: 'status', label: 'Status', type: 'select', options: ['ACTIVE', 'TRANSFERRED_OUT', 'LTFU', 'DEAD', 'STOPPED'] }, { name: 'pmtct', label: 'PMTCT', type: 'checkbox' }] },
      ] },
    { id: 'defaulters', label: 'Appointments & defaulters', custom: <Defaulters /> },
    { id: 'export', label: 'NASCOP export', custom: <Card title="NASCOP / KenyaEMR-compatible ART line list">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">CSV with columns: CCC_Number, Patient_MRN, Sex, Date_of_Birth, Enrollment_Date, Entry_Point, WHO_Stage, ART_Start_Date, Current_Regimen, Regimen_Line, PMTCT, Last_VL_Date, Last_VL_Result, VL_Suppressed, Next_Appointment, Status. <strong>Columns are indicative</strong> – confirm against the current NASCOP data dictionary before submission. The export is audited.</p>
      <button className="btn-primary" onClick={() => downloadCsv('/programmes/hiv/export', {}, `nascop-art-line-list-${new Date().toISOString().slice(0, 10)}.csv`)}><Download className="h-4 w-4" />Download CSV</button></Card> },
    { id: 'tb', label: 'TB register', path: '/programmes/tb', searchable: true, createLabel: 'Register TB case', invalidate: ['/programmes'],
      columns: [{ key: 'tbNumber', header: 'TB no.' }, { key: 'patient', header: 'Patient', render: (r: any) => fullName(r.patient) }, { key: 'diseaseSite', header: 'Site' }, { key: 'patientType', header: 'Type' }, { key: 'regimen', header: 'Regimen' }, { key: 'phase', header: 'Phase', render: (r: any) => <StatusBadge status={r.phase} tone={r.expectedPhase && r.expectedPhase !== r.phase ? 'amber' : 'blue'} /> }, { key: 'doses', header: 'DOT log', render: (r: any) => r._count?.doses ?? 0 }, { key: 'hivStatus', header: 'HIV' }, { key: 'outcome', header: 'Outcome', render: (r: any) => r.outcome ? <StatusBadge status={r.outcome} /> : '—' }],
      fields: [{ name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'tbNumber', label: 'TB number (blank = auto)' }, { name: 'diseaseSite', label: 'Disease site', type: 'select', options: ['PULMONARY', 'EXTRA_PULMONARY'] }, { name: 'confirmation', label: 'Basis', type: 'select', options: ['BACTERIOLOGICAL', 'CLINICAL'] }, { name: 'patientType', label: 'Patient type', type: 'select', options: ['NEW', 'RELAPSE', 'TREATMENT_AFTER_LTFU', 'FAILURE', 'TRANSFER_IN'] }, { name: 'regimen', label: 'Regimen', placeholder: '2RHZE/4RH' }, { name: 'hivStatus', label: 'HIV status', type: 'select', options: ['POS', 'NEG', 'UNKNOWN'] }, { name: 'intensiveStart', label: 'Treatment start', type: 'date' }],
      detailPath: (r: any) => `/programmes/tb/${r.id}`, detailTitle: (r: any) => `TB ${r.tbNumber}`,
      renderDetail: (d) => d && <div className="space-y-4"><KV items={[['Patient', fullName(d.patient)], ['Site', d.diseaseSite], ['Basis', d.confirmation], ['Regimen', d.regimen], ['Phase', d.phase], ['Expected phase', d.expectedPhase], ['Intensive start', date(d.intensiveStart)], ['Continuation start', date(d.continuationStart)], ['DOT adherence', d.adherence != null ? `${d.adherence}%` : '—'], ['Outcome', d.outcome], ['Outcome date', date(d.outcomeDate)]]} />
        <Card title="DOT log"><Table rows={d.doses} empty={<p className="text-sm text-slate-500">No doses logged.</p>} columns={[{ key: 'date', header: 'Date', render: (x: any) => date(x.date) }, { key: 'observed', header: 'Observed', render: (x: any) => x.observed ? <StatusBadge status="OBSERVED" tone="green" /> : <StatusBadge status="MISSED" tone="red" /> }, { key: 'observer', header: 'Observer' }, { key: 'notes', header: 'Notes' }]} /></Card></div>,
      actions: [
        { label: 'Log DOT dose', tone: 'primary', path: (r: any) => `/programmes/tb/${r.id}/dot`, show: (r: any) => !r.outcome, fields: [{ name: 'date', label: 'Date', type: 'date' }, { name: 'observed', label: 'Observed', type: 'checkbox' }, { name: 'observer', label: 'Observer (HCW / CHV)' }, { name: 'notes', label: 'Notes' }], defaults: () => ({ observed: true }) },
        { label: 'Start continuation phase', path: (r: any) => `/programmes/tb/${r.id}/phase`, show: (r: any) => r.phase === 'INTENSIVE', transform: () => ({ phase: 'CONTINUATION' }) },
        { label: 'Record outcome', path: (r: any) => `/programmes/tb/${r.id}/outcome`, show: (r: any) => !r.outcome, fields: [{ name: 'outcome', label: 'Outcome', type: 'select', options: ['CURED', 'COMPLETED', 'FAILED', 'DIED', 'LTFU', 'NOT_EVALUATED', 'TRANSFERRED_OUT'], required: true }, { name: 'date', label: 'Date', type: 'date' }] },
      ] },
  ]} />;
}
