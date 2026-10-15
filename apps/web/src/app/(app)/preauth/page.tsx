'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge } from '@/components/ui';
import { useAction } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';

const OPEN_VISIT = { path: '/visits', query: { status: 'OPEN,IN_PROGRESS,ADMITTED' }, label: (v: any) => `${v.visitNumber} · ${v.patient?.firstName ?? ''} ${v.patient?.lastName ?? ''}`, sub: (v: any) => v.payerType };
export default function Preauth() {
  const [busy, setBusy] = useState('');
  const submit = useAction<string>('post', (id) => `/preauths/${id}/submit`, { invalidate: ['/preauths'], success: 'Submitted to payer', onSuccess: () => setBusy('') });
  return <CrudPage title="Pre-authorisation" subtitle="Requests to SHA and insurers before treatment" path="/preauths" createLabel="New pre-auth request" columns={[
    { key: 'id', header: 'Ref', render: (r: any) => r.externalRef ?? r.id.slice(0, 8) }, { key: 'interventionCode', header: 'Intervention' },
    { key: 'description', header: 'Service' }, { key: 'amountMinor', header: 'Requested', render: (r: any) => money(r.amountMinor) }, { key: 'approvedMinor', header: 'Approved', render: (r: any) => money(r.approvedMinor) },
    { key: 'createdAt', header: 'Date', render: (r: any) => date(r.createdAt) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'a', header: '', render: (r: any) => ['DRAFT', 'REJECTED'].includes(r.status) ? <button className="btn-secondary py-1 text-xs" disabled={busy === r.id} onClick={(e) => { e.stopPropagation(); setBusy(r.id); submit.mutate(r.id); }}>Submit</button> : null }]}
    fields={[{ name: 'visitId', label: 'Visit', type: 'picker', source: OPEN_VISIT, required: true }, { name: 'payerId', label: 'Payer (default: visit payer / SHA)', type: 'picker', source: PICK.payer }, { name: 'interventionCode', label: 'SHA intervention / package code' }, { name: 'description', label: 'Procedure / service', required: true }, { name: 'amount', label: 'Estimated cost (KES)', type: 'money', required: true }]} />;
}
