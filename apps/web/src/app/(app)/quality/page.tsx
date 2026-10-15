'use client';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge } from '@/components/ui';
import { dateTime } from '@/lib/format';
export default function Quality() {
  return <CrudPage title="Quality & incidents" subtitle="Incident reporting, investigation & corrective action" path="/quality/incidents" createLabel="Report incident" columns={[
    { key: 'incidentNumber', header: 'No.' }, { key: 'occurredAt', header: 'Occurred', render: (i: any) => dateTime(i.occurredAt) }, { key: 'category', header: 'Category' },
    { key: 'severity', header: 'Severity', render: (i: any) => <StatusBadge status={i.severity} tone={i.severity === 'SEVERE' || i.severity === 'SENTINEL' ? 'red' : i.severity === 'MODERATE' ? 'amber' : 'slate'} /> },
    { key: 'location', header: 'Location' }, { key: 'status', header: 'Status', render: (i: any) => <StatusBadge status={i.status} /> }]}
    fields={[{ name: 'occurredAt', label: 'When', type: 'datetime-local', required: true }, { name: 'location', label: 'Location / ward' }, { name: 'category', label: 'Category', type: 'select', options: ['MEDICATION_ERROR', 'FALL', 'NEEDLESTICK', 'HAI', 'EQUIPMENT', 'PATIENT_IDENTIFICATION', 'NEAR_MISS', 'OTHER'], required: true }, { name: 'severity', label: 'Severity', type: 'select', options: ['NO_HARM', 'MINOR', 'MODERATE', 'SEVERE', 'SENTINEL'], required: true }, { name: 'patientId', label: 'Patient ID (if any)' }, { name: 'description', label: 'What happened', type: 'textarea', required: true }, { name: 'immediateAction', label: 'Immediate action taken', type: 'textarea' }]} />;
}
