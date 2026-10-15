'use client';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge } from '@/components/ui';
import { date, fullName, money } from '@/lib/format';
export default function Preauth() {
  return <CrudPage title="Pre-authorisation" subtitle="Requests to SHA and insurers before treatment" path="/preauth" createLabel="New pre-auth request" columns={[
    { key: 'preauthNumber', header: 'Ref', render: (r: any) => r.preauthNumber ?? r.id.slice(0, 8) }, { key: 'patient', header: 'Patient', render: (r: any) => fullName(r.patient) }, { key: 'payer', header: 'Payer', render: (r: any) => r.payer?.name ?? r.scheme?.name ?? r.payerType },
    { key: 'procedure', header: 'Service' }, { key: 'requestedMinor', header: 'Requested', render: (r: any) => money(r.requestedMinor) }, { key: 'approvedMinor', header: 'Approved', render: (r: any) => money(r.approvedMinor) },
    { key: 'createdAt', header: 'Date', render: (r: any) => date(r.createdAt) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }]}
    fields={[{ name: 'visitId', label: 'Visit ID', required: true }, { name: 'payerType', label: 'Payer', type: 'select', options: ['SHA', 'INSURANCE'], required: true }, { name: 'schemeId', label: 'Scheme ID' }, { name: 'procedure', label: 'Procedure / service', required: true }, { name: 'diagnosisCode', label: 'ICD-11 code' }, { name: 'requested', label: 'Estimated cost (KES)', type: 'money', required: true }, { name: 'justification', label: 'Clinical justification', type: 'textarea', required: true }]} />;
}
