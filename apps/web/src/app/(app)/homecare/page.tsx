'use client';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge } from '@/components/ui';
import { dateTime, fullName } from '@/lib/format';
export default function Homecare() {
  return <CrudPage title="Homecare" subtitle="Home visits & community care" path="/homecare/visits" createLabel="Schedule home visit" columns={[
    { key: 'patient', header: 'Patient', render: (r: any) => fullName(r.patient) }, { key: 'scheduledAt', header: 'Scheduled', render: (r: any) => dateTime(r.scheduledAt) },
    { key: 'address', header: 'Location' }, { key: 'service', header: 'Service' }, { key: 'staff', header: 'Assigned', render: (r: any) => r.assignedTo?.name ?? '—' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }]}
    fields={[{ name: 'patientId', label: 'Patient ID', required: true }, { name: 'scheduledAt', label: 'Date & time', type: 'datetime-local', required: true }, { name: 'service', label: 'Service', type: 'select', options: ['NURSING', 'WOUND_CARE', 'PALLIATIVE', 'PHYSIOTHERAPY', 'SAMPLE_COLLECTION', 'MEDICATION_DELIVERY'] }, { name: 'address', label: 'Address / location', full: true }, { name: 'assignedToId', label: 'Assign to (user ID)' }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />;
}
