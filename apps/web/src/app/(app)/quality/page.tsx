'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { FormDialog } from '@/components/FormDialog';
import { StatusBadge, Tabs } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { PICK } from '@/lib/pickers';
export default function Quality() {
  const [tab, setTab] = useState('incidents'); const [close, setClose] = useState<any>(null);
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'incidents', label: 'Incidents' }, { id: 'complaints', label: 'Complaints' }]} />;
  if (tab === 'complaints') return <CrudPage title="Quality & incidents" path="/quality/complaints" createLabel="Log complaint" columns={[
    { key: 'number', header: 'No.' }, { key: 'complainant', header: 'Complainant' }, { key: 'channel', header: 'Channel' }, { key: 'category', header: 'Category' }, { key: 'description', header: 'Description', className: 'max-w-xs truncate' }, { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} /> }]}
    fields={[{ name: 'complainant', label: 'Complainant', required: true }, { name: 'phone', label: 'Phone' }, { name: 'channel', label: 'Channel', type: 'select', options: ['IN_PERSON', 'PHONE', 'EMAIL', 'SMS', 'SUGGESTION_BOX'] }, { name: 'category', label: 'Category', type: 'select', options: ['SERVICE', 'BILLING', 'CLINICAL', 'STAFF_CONDUCT', 'FACILITY', 'OTHER'] }, { name: 'description', label: 'Description', type: 'textarea', required: true }]}>{tabs}</CrudPage>;
  return <CrudPage title="Quality & incidents" subtitle="Incident reporting, investigation & corrective action" path="/quality/incidents" createLabel="Report incident" onRowClick={(i: any) => i.status !== 'CLOSED' && setClose(i)} columns={[
    { key: 'number', header: 'No.' }, { key: 'occurredAt', header: 'Occurred', render: (i: any) => dateTime(i.occurredAt) }, { key: 'category', header: 'Category' },
    { key: 'severity', header: 'Severity', render: (i: any) => <StatusBadge status={i.severity} tone={i.severity === 'SEVERE' || i.severity === 'DEATH' ? 'red' : i.severity === 'MODERATE' ? 'amber' : 'slate'} /> },
    { key: 'location', header: 'Location' }, { key: 'status', header: 'Status', render: (i: any) => <StatusBadge status={i.status} /> }]}
    transform={(v) => ({ ...v, occurredAt: new Date(v.occurredAt).toISOString() })}
    fields={[{ name: 'occurredAt', label: 'When', type: 'datetime-local', required: true }, { name: 'location', label: 'Location / ward' }, { name: 'category', label: 'Category', type: 'select', options: ['MEDICATION_ERROR', 'FALL', 'NEEDLESTICK', 'HAI', 'EQUIPMENT', 'PATIENT_IDENTIFICATION', 'OTHER'], required: true }, { name: 'severity', label: 'Severity', type: 'select', options: ['NEAR_MISS', 'LOW', 'MODERATE', 'SEVERE', 'DEATH'], required: true }, { name: 'patientId', label: 'Patient (if any)', type: 'picker', source: PICK.patient }, { name: 'description', label: 'What happened', type: 'textarea', required: true }]}>
    {tabs}
    <FormDialog open={!!close} onClose={() => setClose(null)} title={`Close incident ${close?.number ?? ''}`} path={`/quality/incidents/${close?.id}/close`} invalidate={['/quality']} success="Incident closed" fields={[{ name: 'findings', label: 'Findings', type: 'textarea', required: true }, { name: 'actions', label: 'Corrective actions', type: 'textarea', required: true }]} />
  </CrudPage>;
}
