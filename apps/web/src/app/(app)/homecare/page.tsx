'use client';
import { CrudPage } from '@/components/CrudPage';
import { PatientName } from '@/components/PatientName';
import { StatusBadge } from '@/components/ui';
import { dateTime, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';
const PROVIDER = { path: '/admin/practitioners', idOf: (p: any) => p.userId, label: (p: any) => `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`, sub: (p: any) => p.cadre };
export default function Homecare() {
  return <CrudPage title="Homecare" subtitle="Home visits & community care" path="/homecare/visits" createLabel="Schedule home visit" searchable={false} columns={[
    { key: 'patient', header: 'Patient', render: (r: any) => <PatientName id={r.patientId} withMrn /> }, { key: 'scheduledAt', header: 'Scheduled', render: (r: any) => dateTime(r.scheduledAt) },
    { key: 'serviceType', header: 'Service' }, { key: 'feeMinor', header: 'Fee', render: (r: any) => money(r.feeMinor) }, { key: 'escrowStatus', header: 'Escrow', render: (r: any) => <StatusBadge status={r.escrowStatus} /> }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }]}
    transform={(v) => ({ ...v, scheduledAt: new Date(v.scheduledAt).toISOString(), feeMinor: v.feeMinor ?? 0 })}
    fields={[{ name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'providerId', label: 'Provider', type: 'picker', source: PROVIDER, required: true }, { name: 'scheduledAt', label: 'Date & time', type: 'datetime-local', required: true }, { name: 'serviceType', label: 'Service', type: 'select', options: ['NURSING', 'CAREGIVER', 'PHYSIO', 'COUNSELLING'], required: true }, { name: 'fee', label: 'Fee (KES)', type: 'money', required: true }]} />;
}
