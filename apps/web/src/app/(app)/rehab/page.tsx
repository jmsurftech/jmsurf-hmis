'use client';
import { ModulePage } from '@/components/ModulePage';
import { PatientName } from '@/components/PatientName';
import { Table } from '@/components/DataTable';
import { Card, KV, StatusBadge } from '@/components/ui';
import { LineTrend } from '@/components/charts';
import { date, dateTime } from '@/lib/format';
import { PICK } from '@/lib/pickers';
import { iso } from '@/components/ModulePage';

export default function Rehab() {
  return <ModulePage title="Physiotherapy & rehab" subtitle="Treatment plans, sessions and outcome measures" tabs={[
    { id: 'plans', label: 'Treatment plans', path: '/rehab/plans', searchable: true, createLabel: 'New treatment plan',
      columns: [{ key: 'patientId', header: 'Patient', render: (p: any) => <PatientName id={p.patientId} withMrn /> }, { key: 'therapy', header: 'Therapy' }, { key: 'diagnosis', header: 'Diagnosis' }, { key: 'sessions', header: 'Sessions', render: (p: any) => `${p._count?.sessions ?? 0}/${p.plannedSessions}` }, { key: 'outcomeMeasure', header: 'Measure' }, { key: 'startDate', header: 'Start', render: (p: any) => date(p.startDate) }, { key: 'status', header: 'Status', render: (p: any) => <StatusBadge status={p.status} /> }],
      fields: [{ name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'therapy', label: 'Therapy', type: 'select', options: ['PHYSIO', 'OT', 'SPEECH'] }, { name: 'diagnosis', label: 'Diagnosis', required: true }, { name: 'goals', label: 'Goals', type: 'textarea' }, { name: 'frequency', label: 'Frequency (e.g. 2x weekly)' }, { name: 'plannedSessions', label: 'Planned sessions', type: 'number' },
        { name: 'outcomeMeasure', label: 'Outcome measure', type: 'select', options: ['BARTHEL', 'VAS_PAIN', 'TUG', 'ROM', 'QUICKDASH', 'BERG', 'OTHER'] }, { name: 'baselineScore', label: 'Baseline score', type: 'number' }, { name: 'targetScore', label: 'Target score', type: 'number' }, { name: 'startDate', label: 'Start date', type: 'date' }],
      detailPath: (p: any) => `/rehab/plans/${p.id}`, detailTitle: (p: any) => `${p.therapy} plan · ${p.diagnosis}`,
      renderDetail: (d) => d && <div className="space-y-4">
        <KV items={[['Patient', <PatientName key="p" id={d.patientId} withMrn />], ['Goals', d.goals], ['Frequency', d.frequency], ['Sessions', `${d.progress.sessionsDone}/${d.plannedSessions}`], ['Measure', d.outcomeMeasure], ['Baseline → latest', `${d.progress.baseline ?? '—'} → ${d.progress.latest ?? '—'}`], ['Change', d.progress.change], ['Target', d.progress.target], ['Status', <StatusBadge key="s" status={d.status} />]]} />
        {d.trend.length > 0 && <Card title="Outcome trend"><LineTrend data={d.trend.map((t: any) => ({ ...t, date: date(t.date) }))} x="date" lines={[{ key: 'score', label: d.outcomeMeasure ?? 'Score' }, { key: 'pain', label: 'Pain (0–10)' }]} height={200} /></Card>}
        <Table rows={d.sessions} empty={<p className="text-sm text-slate-500">No sessions yet.</p>} columns={[{ key: 'sessionAt', header: 'Date', render: (s: any) => dateTime(s.sessionAt) }, { key: 'durationMin', header: 'Min' }, { key: 'interventions', header: 'Interventions' }, { key: 'painScore', header: 'Pain' }, { key: 'outcomeScore', header: 'Score' }, { key: 'notes', header: 'Notes' }]} />
      </div>,
      actions: [
        { label: 'Record session', tone: 'primary', path: (p: any) => `/rehab/plans/${p.id}/sessions`, show: (p: any) => p.status === 'ACTIVE', transform: (v) => ({ ...v, sessionAt: iso(v.sessionAt) }),
          fields: [{ name: 'sessionAt', label: 'Date/time', type: 'datetime-local' }, { name: 'durationMin', label: 'Duration (min)', type: 'number' }, { name: 'interventions', label: 'Interventions', type: 'textarea' }, { name: 'painScore', label: 'Pain score (0–10)', type: 'number' }, { name: 'outcomeScore', label: 'Outcome score', type: 'number' }, { name: 'notes', label: 'Notes', type: 'textarea' }] },
        { label: 'Mark completed', path: (p: any) => `/rehab/plans/${p.id}/status`, show: (p: any) => p.status === 'ACTIVE', transform: () => ({ status: 'COMPLETED' }) },
        { label: 'Discontinue', tone: 'danger', path: (p: any) => `/rehab/plans/${p.id}/status`, show: (p: any) => p.status === 'ACTIVE', transform: () => ({ status: 'DISCONTINUED' }) },
      ] },
  ]} />;
}
