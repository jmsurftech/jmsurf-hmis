'use client';
import { ModulePage, iso } from '@/components/ModulePage';
import { Table } from '@/components/DataTable';
import { Card, KV, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, dateTime, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';
import { SPICK } from '@/lib/support-pickers';

function Compartments() {
  const { data } = useGet<any[]>('/mortuary/compartments');
  return (
    <Card title="Storage compartments" className="mb-4">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {(data ?? []).map((c) => <div key={c.id} className={`rounded-lg border p-2 text-center text-xs ${c.status === 'OCCUPIED' ? 'border-red-300 bg-red-50 dark:bg-red-950/40' : c.status === 'AVAILABLE' ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 'border-slate-300 bg-slate-100 dark:bg-slate-800'}`}><p className="font-semibold">{c.label}</p><p className="opacity-70">{c.status}</p></div>)}
      </div>
    </Card>
  );
}

function CaseDetail({ d }: { d: any }) {
  if (!d) return null;
  return (
    <div className="space-y-4">
      <KV items={[['Case', d.caseNumber], ['Deceased', d.deceasedName], ['Sex / age', `${d.sex ?? '—'} / ${d.ageYears ?? '—'}`], ['Source', d.source.replace(/_/g, ' ')], ['Date of death', dateTime(d.dateOfDeath)], ['Cause of death', d.causeOfDeath],
        ['Admitted', dateTime(d.admittedAt)], ['Compartment', d.compartment?.label], ['Storage days', d.storageDays], ['Brought by', d.broughtBy], ['Police OB', d.policeObNumber], ['Status', <StatusBadge key="s" status={d.status} />]]} />
      {d.pmStatus && <Card title="Post-mortem"><KV items={[['Status', <StatusBadge key="p" status={d.pmStatus} />], ['Requested by', d.pmRequestedBy], ['Reason', d.pmReason], ['Pathologist', d.pmPathologist], ['PM cause of death', d.pmCauseOfDeath], ['Completed', dateTime(d.pmCompletedAt)]]} />{d.pmFindings && <p className="mt-2 whitespace-pre-wrap text-sm">{d.pmFindings}</p>}</Card>}
      {d.status === 'RELEASED' && <Card title="Release"><KV items={[['Released', dateTime(d.releasedAt)], ['To', d.releasedTo], ['ID no.', d.releasedToIdNo], ['Relationship', d.releasedToRelationship], ['Burial permit', d.burialPermitNo], ['Permit date', date(d.burialPermitDate)], ['Disposal', d.disposalMethod], ['Destination', d.destination]]} /></Card>}
      <Card title={`Mortuary bill ${d.bill?.number ?? ''}`}>
        <Table rows={(d.bill?.lines ?? []).filter((l: any) => !l.voided)} empty={<p className="text-sm text-slate-500">No charges yet (configure MORT-* service items).</p>} columns={[{ key: 'description', header: 'Item' }, { key: 'quantity', header: 'Qty' }, { key: 'totalMinor', header: 'Amount', render: (l: any) => money(l.totalMinor) }]} />
        {d.bill && <p className="mt-2 text-right text-sm font-semibold">Total {money(d.bill.totalMinor)} · Balance {money(d.bill.balanceMinor ?? d.bill.totalMinor - (d.bill.paidMinor ?? 0))}</p>}
      </Card>
    </div>
  );
}

export default function Mortuary() {
  return <ModulePage title="Mortuary" subtitle="Body admission, storage, post-mortem & release" tabs={[
    { id: 'cases', label: 'Bodies', path: '/mortuary/cases', searchable: true, custom: <Compartments />, createLabel: 'Admit body', invalidate: ['/mortuary'],
      columns: [{ key: 'caseNumber', header: 'Case' }, { key: 'deceasedName', header: 'Deceased' }, { key: 'source', header: 'Source', render: (r: any) => r.source.replace(/_/g, ' ') }, { key: 'dateOfDeath', header: 'Died', render: (r: any) => dateTime(r.dateOfDeath) }, { key: 'admittedAt', header: 'Admitted', render: (r: any) => dateTime(r.admittedAt) }, { key: 'pmStatus', header: 'Post-mortem', render: (r: any) => r.pmStatus ? <StatusBadge status={r.pmStatus} /> : '—' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} tone={r.status === 'IN_STORAGE' ? 'blue' : 'slate'} /> }],
      fields: [{ name: 'source', label: 'Source', type: 'select', options: ['WARD_DEATH', 'BROUGHT_IN_DEAD'], required: true }, { name: 'admissionId', label: 'Inpatient admission (ward death)', type: 'picker', source: SPICK.admission }, { name: 'patientId', label: 'Existing patient (BID)', type: 'picker', source: PICK.patient },
        { name: 'firstName', label: 'First name (unregistered BID)' }, { name: 'lastName', label: 'Last name (unregistered BID)' }, { name: 'sex', label: 'Sex', type: 'select', options: ['MALE', 'FEMALE', 'UNKNOWN'] }, { name: 'ageYears', label: 'Approx. age', type: 'number' },
        { name: 'dateOfDeath', label: 'Date/time of death', type: 'datetime-local' }, { name: 'causeOfDeath', label: 'Cause of death' }, { name: 'broughtBy', label: 'Brought by' }, { name: 'policeObNumber', label: 'Police OB no.' }, { name: 'compartmentId', label: 'Compartment', type: 'picker', source: SPICK.compartment }],
      transform: (v) => ({ ...v, dateOfDeath: iso(v.dateOfDeath) }),
      detailPath: (r: any) => `/mortuary/cases/${r.id}`, detailTitle: (r: any) => `${r.caseNumber} · ${r.deceasedName}`, renderDetail: (d) => <CaseDetail d={d} />,
      actions: [
        { label: 'Assign compartment', path: (r: any) => `/mortuary/cases/${r.id}/compartment`, show: (r: any) => r.status === 'IN_STORAGE', fields: [{ name: 'compartmentId', label: 'Compartment', type: 'picker', source: SPICK.compartment, required: true }] },
        { label: 'Request post-mortem', path: (r: any) => `/mortuary/cases/${r.id}/post-mortem`, show: (r: any) => r.status === 'IN_STORAGE' && !r.pmStatus, fields: [{ name: 'requestedBy', label: 'Requested by (police/family/doctor)', required: true }, { name: 'reason', label: 'Reason', type: 'textarea' }] },
        { label: 'Post-mortem report', path: (r: any) => `/mortuary/cases/${r.id}/post-mortem/report`, show: (r: any) => r.pmStatus === 'REQUESTED', fields: [{ name: 'pathologist', label: 'Pathologist', required: true }, { name: 'causeOfDeath', label: 'Cause of death', required: true }, { name: 'findings', label: 'Findings', type: 'textarea', required: true }] },
        { label: 'Release body', tone: 'primary', path: (r: any) => `/mortuary/cases/${r.id}/release`, show: (r: any) => r.status === 'IN_STORAGE' && r.pmStatus !== 'REQUESTED', transform: (v) => ({ ...v, burialPermitDate: iso(v.burialPermitDate) }),
          fields: [{ name: 'releasedTo', label: 'Released to (name)', required: true }, { name: 'releasedToIdNo', label: 'ID number', required: true }, { name: 'relationship', label: 'Relationship', required: true }, { name: 'burialPermitNo', label: 'Burial permit no.', required: true }, { name: 'burialPermitDate', label: 'Permit date', type: 'date' }, { name: 'disposalMethod', label: 'Disposal', type: 'select', options: ['BURIAL', 'CREMATION'] }, { name: 'destination', label: 'Destination' }] },
      ] },
    { id: 'released', label: 'Released', path: '/mortuary/cases', query: { status: 'RELEASED' },
      columns: [{ key: 'caseNumber', header: 'Case' }, { key: 'deceasedName', header: 'Deceased' }, { key: 'releasedAt', header: 'Released', render: (r: any) => dateTime(r.releasedAt) }, { key: 'releasedTo', header: 'To' }, { key: 'burialPermitNo', header: 'Burial permit' }, { key: 'destination', header: 'Destination' }],
      detailPath: (r: any) => `/mortuary/cases/${r.id}`, renderDetail: (d) => <CaseDetail d={d} /> },
  ]} />;
}
