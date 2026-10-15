'use client';
import { AlertTriangle } from 'lucide-react';
import { ModulePage, iso } from '@/components/ModulePage';
import { PatientName } from '@/components/PatientName';
import { Table } from '@/components/DataTable';
import { Card, KV, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, dateTime } from '@/lib/format';
import { PICK } from '@/lib/pickers';
import { SPICK, groupLabel } from '@/lib/support-pickers';

const COMPONENTS = ['WHOLE_BLOOD', 'PRBC', 'FFP', 'PLATELETS', 'CRYO'];
const TTI = ['NEG', 'POS', 'PENDING'];
const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

function Inventory() {
  const inv = useGet<any[]>('/blood-bank/inventory');
  const exp = useGet<any[]>('/blood-bank/alerts/expiry', { days: 3 });
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <Card title="Stock by group & component" className="lg:col-span-2">
        <Table rows={inv.data ?? []} columns={[
          { key: 'group', header: 'Group', render: (r: any) => <span className="font-semibold">{r.group}</span> }, { key: 'component', header: 'Component' },
          { key: 'available', header: 'Available' }, { key: 'reserved', header: 'Reserved' }, { key: 'quarantine', header: 'Quarantine' },
          { key: 'expiringIn3Days', header: 'Expiring ≤3d', render: (r: any) => r.expiringIn3Days ? <span className="font-semibold text-amber-600">{r.expiringIn3Days}</span> : '0' }]} />
      </Card>
      <Card title="Expiry alerts (≤ 3 days)">
        {(exp.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No units expiring soon.</p> : (
          <ul className="space-y-2 text-sm">{exp.data!.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />{u.unitNumber} · {groupLabel(u.abo, u.rh)} {u.component}</span>
              <span className="text-xs">{daysLeft(u.expiresAt) <= 0 ? 'today' : `${daysLeft(u.expiresAt)}d`}</span>
            </li>))}</ul>)}
      </Card>
    </div>
  );
}

function RequestDetail({ d }: { d: any }) {
  if (!d) return null;
  return (
    <div className="space-y-4">
      <KV items={[['Request', d.requestNumber], ['Patient', <PatientName key="p" id={d.patientId} withMrn />], ['Component', d.component], ['Units', d.unitsRequested], ['Urgency', d.urgency],
        ['Patient group', groupLabel(d.patientAbo, d.patientRh)], ['Antibody screen', d.antibodyScreen], ['Status', <StatusBadge key="s" status={d.status} />], ['Indication', d.indication]]} />
      <div><h4 className="mb-1 text-sm font-semibold">Crossmatches</h4>
        <Table rows={d.crossmatches ?? []} empty={<p className="text-sm text-slate-500">None yet.</p>} columns={[{ key: 'unitId', header: 'Unit', render: (x: any) => [...(d.reserved ?? []), ...(d.candidates ?? [])].find((u: any) => u.id === x.unitId)?.unitNumber ?? x.unitId.slice(0, 8) }, { key: 'method', header: 'Method' }, { key: 'result', header: 'Result', render: (x: any) => <StatusBadge status={x.result} tone={x.result === 'COMPATIBLE' ? 'green' : 'red'} /> }, { key: 'performedAt', header: 'At', render: (x: any) => dateTime(x.performedAt) }]} /></div>
      <div><h4 className="mb-1 text-sm font-semibold">Reserved units</h4>
        <Table rows={d.reserved ?? []} empty={<p className="text-sm text-slate-500">None.</p>} columns={[{ key: 'unitNumber', header: 'Unit' }, { key: 'g', header: 'Group', render: (u: any) => groupLabel(u.abo, u.rh) }, { key: 'status', header: 'Status', render: (u: any) => <StatusBadge status={u.status} /> }, { key: 'expiresAt', header: 'Expires', render: (u: any) => date(u.expiresAt) }]} /></div>
      {d.patientAbo && <div><h4 className="mb-1 text-sm font-semibold">Compatible units in stock ({d.candidates?.length ?? 0})</h4>
        <Table rows={(d.candidates ?? []).slice(0, 8)} empty={<p className="text-sm text-red-600">No compatible units available.</p>} columns={[{ key: 'unitNumber', header: 'Unit' }, { key: 'g', header: 'Group', render: (u: any) => groupLabel(u.abo, u.rh) }, { key: 'expiresAt', header: 'Expires', render: (u: any) => date(u.expiresAt) }]} /></div>}
    </div>
  );
}

const unitOptions = (d: any, list: 'candidates' | 'reserved') => (d?.[list] ?? []).map((u: any) => ({ value: u.id, label: `${u.unitNumber} · ${groupLabel(u.abo, u.rh)} · exp ${date(u.expiresAt)}` }));

export default function BloodBank() {
  return <ModulePage title="Blood bank" subtitle="Donors, screening, inventory, crossmatch & transfusion" tabs={[
    { id: 'requests', label: 'Requests & crossmatch', path: '/blood-bank/requests', custom: <Inventory />, createLabel: 'New blood request', invalidate: ['/blood-bank'],
      columns: [{ key: 'requestNumber', header: 'Request' }, { key: 'patient', header: 'Patient', render: (r: any) => <PatientName id={r.patientId} withMrn /> }, { key: 'component', header: 'Component' }, { key: 'unitsRequested', header: 'Units' }, { key: 'urgency', header: 'Urgency', render: (r: any) => <StatusBadge status={r.urgency} tone={r.urgency === 'ROUTINE' ? 'slate' : 'red'} /> }, { key: 'g', header: 'Patient group', render: (r: any) => groupLabel(r.patientAbo, r.patientRh) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }, { key: 'createdAt', header: 'Requested', render: (r: any) => dateTime(r.createdAt) }],
      fields: [{ name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'component', label: 'Component', type: 'select', options: COMPONENTS, required: true }, { name: 'unitsRequested', label: 'Units', type: 'number' }, { name: 'urgency', label: 'Urgency', type: 'select', options: ['ROUTINE', 'URGENT', 'EMERGENCY'] }, { name: 'orderId', label: 'Linked order ID (optional)' }, { name: 'indication', label: 'Indication', type: 'textarea' }],
      detailPath: (r: any) => `/blood-bank/requests/${r.id}`, detailTitle: (r: any) => `Blood request ${r.requestNumber}`, renderDetail: (d) => <RequestDetail d={d} />,
      actions: [
        { label: 'Record grouping', path: (r: any) => `/blood-bank/requests/${r.id}/group`, show: (r: any) => ['REQUESTED', 'GROUPED', 'CROSSMATCHED'].includes(r.status), fields: [{ name: 'abo', label: 'ABO', type: 'select', options: ['A', 'B', 'AB', 'O'], required: true }, { name: 'rh', label: 'Rh(D)', type: 'select', options: ['POS', 'NEG'], required: true }, { name: 'antibodyScreen', label: 'Antibody screen', type: 'select', options: ['NEGATIVE', 'POSITIVE'] }] },
        { label: 'Crossmatch unit', path: (r: any) => `/blood-bank/requests/${r.id}/crossmatch`, show: (r: any) => !!r.patientAbo && ['GROUPED', 'CROSSMATCHED'].includes(r.status),
          fields: (r: any) => [{ name: 'unitId', label: 'Compatible unit in stock', type: 'select', options: unitOptions(r, 'candidates'), required: true }, { name: 'method', label: 'Method', type: 'select', options: ['IAT', 'IS', 'ELECTRONIC'] }, { name: 'result', label: 'Result', type: 'select', options: ['COMPATIBLE', 'INCOMPATIBLE'] }] },
        { label: 'Issue unit', tone: 'primary', path: (r: any) => `/blood-bank/requests/${r.id}/issue`, show: (r: any) => (r.reserved ?? []).length > 0, fields: (r: any) => [{ name: 'unitId', label: 'Reserved unit', type: 'select', options: unitOptions(r, 'reserved'), required: true }] },
        { label: 'Cancel request', tone: 'danger', path: (r: any) => `/blood-bank/requests/${r.id}/cancel`, show: (r: any) => ['REQUESTED', 'GROUPED', 'CROSSMATCHED'].includes(r.status) },
      ],
    },
    { id: 'transfusions', label: 'Transfusions', path: '/blood-bank/transfusions',
      columns: [{ key: 'patient', header: 'Patient', render: (r: any) => <PatientName id={r.patientId} withMrn /> }, { key: 'unit', header: 'Unit', render: (r: any) => r.unit ? `${r.unit.unitNumber} · ${groupLabel(r.unit.abo, r.unit.rh)} ${r.unit.component}` : '—' }, { key: 'issuedAt', header: 'Issued', render: (r: any) => dateTime(r.issuedAt) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }, { key: 'reaction', header: 'Reaction', render: (r: any) => r.reaction ? <StatusBadge status={`${r.reactionType} (${r.reactionSeverity})`} tone="red" /> : '—' }],
      actions: [
        { label: 'Start transfusion', path: (r: any) => `/blood-bank/transfusions/${r.id}/start`, show: (r: any) => r.status === 'ISSUED', fields: [{ name: 'temp', label: 'Temp °C', type: 'number' }, { name: 'pulse', label: 'Pulse', type: 'number' }, { name: 'bp', label: 'BP (e.g. 120/80)' }], transform: (v) => ({ preVitals: v }) },
        { label: 'Complete', tone: 'primary', path: (r: any) => `/blood-bank/transfusions/${r.id}/complete`, show: (r: any) => ['ISSUED', 'IN_PROGRESS'].includes(r.status), fields: [{ name: 'volumeMl', label: 'Volume transfused (mL)', type: 'number' }, { name: 'temp', label: 'Temp °C', type: 'number' }, { name: 'pulse', label: 'Pulse', type: 'number' }, { name: 'bp', label: 'BP' }], transform: ({ volumeMl, ...v }) => ({ volumeMl, postVitals: v }) },
        { label: 'Report reaction', tone: 'danger', path: (r: any) => `/blood-bank/transfusions/${r.id}/reaction`, fields: [{ name: 'reactionType', label: 'Type', type: 'select', options: ['FEBRILE', 'ALLERGIC', 'HAEMOLYTIC', 'TACO', 'TRALI', 'ANAPHYLAXIS', 'OTHER'], required: true }, { name: 'reactionSeverity', label: 'Severity', type: 'select', options: ['MILD', 'MODERATE', 'SEVERE', 'FATAL'], required: true }, { name: 'stopTransfusion', label: 'Stop transfusion', type: 'checkbox' }, { name: 'reactionNotes', label: 'Notes / management', type: 'textarea' }] },
      ] },
    { id: 'units', label: 'Units', path: '/blood-bank/units', searchable: true, createLabel: 'Receive unit (KNBTS)',
      columns: [{ key: 'unitNumber', header: 'Unit' }, { key: 'g', header: 'Group', render: (u: any) => <span className="font-semibold">{groupLabel(u.abo, u.rh)}</span> }, { key: 'component', header: 'Component' }, { key: 'volumeMl', header: 'mL' }, { key: 'expiresAt', header: 'Expires', render: (u: any) => <span className={daysLeft(u.expiresAt) <= 3 ? 'font-semibold text-amber-600' : ''}>{date(u.expiresAt)}</span> }, { key: 'status', header: 'Status', render: (u: any) => <StatusBadge status={u.status} /> }],
      fields: [{ name: 'unitNumber', label: 'Unit number', required: true }, { name: 'abo', label: 'ABO', type: 'select', options: ['A', 'B', 'AB', 'O'], required: true }, { name: 'rh', label: 'Rh', type: 'select', options: ['POS', 'NEG'], required: true }, { name: 'component', label: 'Component', type: 'select', options: COMPONENTS, required: true }, { name: 'volumeMl', label: 'Volume (mL)', type: 'number' }, { name: 'collectedAt', label: 'Collected', type: 'date' }, { name: 'expiresAt', label: 'Expires', type: 'date' }],
      actions: [{ label: 'Discard unit', tone: 'danger', path: (u: any) => `/blood-bank/units/${u.id}/discard`, show: (u: any) => ['AVAILABLE', 'QUARANTINE', 'RESERVED', 'EXPIRED'].includes(u.status) }] },
    { id: 'donors', label: 'Donors', path: '/blood-bank/donors', searchable: true, createLabel: 'Register donor',
      columns: [{ key: 'donorNumber', header: 'Donor #' }, { key: 'name', header: 'Name', render: (d: any) => `${d.firstName} ${d.lastName}` }, { key: 'sex', header: 'Sex' }, { key: 'g', header: 'Group', render: (d: any) => groupLabel(d.abo, d.rh) }, { key: 'lastDonationAt', header: 'Last donation', render: (d: any) => date(d.lastDonationAt) }, { key: 'eligible', header: 'Eligibility', render: (d: any) => d.eligible ? <StatusBadge status="ELIGIBLE" /> : <span title={d.deferralReason}><StatusBadge status="DEFERRED" tone="red" /></span> }],
      fields: [{ name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name', required: true }, { name: 'sex', label: 'Sex', type: 'select', options: ['MALE', 'FEMALE'], required: true }, { name: 'dateOfBirth', label: 'Date of birth', type: 'date' }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'nationalId', label: 'National ID' }, { name: 'abo', label: 'ABO', type: 'select', options: ['A', 'B', 'AB', 'O'] }, { name: 'rh', label: 'Rh', type: 'select', options: ['POS', 'NEG'] }],
      detailPath: (d: any) => `/blood-bank/donors/${d.id}`, detailTitle: (d: any) => `Donor ${d.donorNumber}`,
      renderDetail: (d) => d && <div className="space-y-4"><KV items={[['Name', `${d.firstName} ${d.lastName}`], ['Group', groupLabel(d.abo, d.rh)], ['Phone', d.phone], ['Eligible now', d.eligibility?.eligible ? 'Yes' : 'No'], ['Reasons', d.eligibility?.reasons?.join('; ') || d.deferralReason], ['Deferred until', date(d.eligibility?.deferredUntil ?? d.deferredUntil)]]} />
        <Table rows={d.donations ?? []} columns={[{ key: 'donatedAt', header: 'Donated', render: (x: any) => date(x.donatedAt) }, { key: 'volumeMl', header: 'mL' }, { key: 'hbGdl', header: 'Hb' }, { key: 'ttiStatus', header: 'TTI', render: (x: any) => <StatusBadge status={x.ttiStatus} tone={x.ttiStatus === 'PASSED' ? 'green' : x.ttiStatus === 'FAILED' ? 'red' : 'amber'} /> }, { key: 'units', header: 'Units', render: (x: any) => (x.units ?? []).map((u: any) => u.unitNumber).join(', ') }]} /></div>,
      actions: [
        { label: 'Record donation', tone: 'primary', path: () => '/blood-bank/donations', transform: (v, d: any) => ({ donorId: d.id, volumeMl: v.volumeMl, hbGdl: v.hbGdl, weightKg: v.weightKg, abo: v.abo, rh: v.rh, components: [v.c1, v.c2, v.c3].filter(Boolean), ttiResults: { hiv: v.hiv ?? 'PENDING', hbv: v.hbv ?? 'PENDING', hcv: v.hcv ?? 'PENDING', syphilis: v.syphilis ?? 'PENDING' } }),
          fields: [{ name: 'hbGdl', label: 'Hb (g/dL)', type: 'number', required: true }, { name: 'weightKg', label: 'Weight (kg)', type: 'number', required: true }, { name: 'volumeMl', label: 'Volume (mL)', type: 'number' }, { name: 'abo', label: 'ABO (if new)', type: 'select', options: ['A', 'B', 'AB', 'O'] }, { name: 'rh', label: 'Rh', type: 'select', options: ['POS', 'NEG'] },
            { name: 'c1', label: 'Component 1', type: 'select', options: COMPONENTS }, { name: 'c2', label: 'Component 2', type: 'select', options: COMPONENTS }, { name: 'c3', label: 'Component 3', type: 'select', options: COMPONENTS },
            { name: 'hiv', label: 'HIV', type: 'select', options: TTI }, { name: 'hbv', label: 'HBsAg', type: 'select', options: TTI }, { name: 'hcv', label: 'HCV', type: 'select', options: TTI }, { name: 'syphilis', label: 'Syphilis', type: 'select', options: TTI }] },
        { label: 'Defer donor', tone: 'danger', path: (d: any) => `/blood-bank/donors/${d.id}/defer`, fields: [{ name: 'reason', label: 'Reason', required: true }, { name: 'until', label: 'Until', type: 'date' }] },
      ] },
    { id: 'donations', label: 'Donations & screening', path: '/blood-bank/donations',
      columns: [{ key: 'donatedAt', header: 'Date', render: (d: any) => dateTime(d.donatedAt) }, { key: 'donor', header: 'Donor', render: (d: any) => d.donor ? `${d.donor.firstName} ${d.donor.lastName} (${d.donor.donorNumber})` : '—' }, { key: 'volumeMl', header: 'mL' }, { key: 'ttiStatus', header: 'TTI screen', render: (d: any) => <StatusBadge status={d.ttiStatus} tone={d.ttiStatus === 'PASSED' ? 'green' : d.ttiStatus === 'FAILED' ? 'red' : 'amber'} /> }, { key: 'units', header: 'Units', render: (d: any) => (d.units ?? []).map((u: any) => `${u.component}:${u.status}`).join(', ') }],
      actions: [{ label: 'Record TTI screening', tone: 'primary', path: (d: any) => `/blood-bank/donations/${d.id}/screening`, show: (d: any) => d.ttiStatus === 'PENDING', fields: ['hiv', 'hbv', 'hcv', 'syphilis', 'malaria'].map((k) => ({ name: k, label: k.toUpperCase(), type: 'select' as const, options: TTI, required: k !== 'malaria' })) }] },
  ]} />;
}
