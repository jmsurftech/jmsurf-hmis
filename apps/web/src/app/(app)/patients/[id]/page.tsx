'use client';
import { AlertTriangle, CalendarPlus, Plus } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { OpenVisitDialog } from '@/components/OpenVisitDialog';
import { Card, ErrorNote, KV, Loading, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { useGet, useList } from '@/lib/hooks';
import { PICK } from '@/lib/pickers';
import { age, date, dateTime, fullName, money } from '@/lib/format';

const TABS = ['summary', 'visits', 'allergies', 'covers', 'bills'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }));

export default function PatientProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState('summary'); const [visitOpen, setVisitOpen] = useState(false); const [dialog, setDialog] = useState<'' | 'allergy' | 'cover'>('');
  const { data: p, isLoading, error } = useGet<any>(`/patients/${id}`);
  const visits = useList<any>('/visits', { patientId: id, pageSize: 50 }, tab === 'visits' || tab === 'summary');
  const allergies = useList<any>(`/patients/${id}/allergies`, {}, true);
  const covers = useList<any>(`/patients/${id}/covers`, {}, tab === 'covers' || tab === 'summary');
  const bills = useList<any>('/billing/bills', { patientId: id, pageSize: 50 }, tab === 'bills');
  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorNote error={error ?? new Error('Patient not found')} />;
  const alg = allergies.data?.data ?? p.allergies ?? [];
  return (
    <div>
      <PageHeader title={fullName(p)} subtitle={`${p.mrn} · ${p.sex} · ${age(p.dateOfBirth)} · ${p.phone ?? 'no phone'}`}
        actions={<><Link href={`/appointments?patientId=${id}`} className="btn-secondary"><CalendarPlus className="h-4 w-4" />Book</Link><button className="btn-primary" onClick={() => setVisitOpen(true)}><Plus className="h-4 w-4" />Open visit</button></>} />
      {alg.length > 0 && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"><AlertTriangle className="h-4 w-4" />Allergies: {alg.map((a: any) => a.substance).join(', ')}</div>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'summary' && <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Demographics" className="lg:col-span-2"><KV items={[['ID', p.idNumber ? `${p.idType ?? ''} ${p.idNumber}` : '—'], ['Client Registry', p.crId ?? 'Not linked'], ['SHA no.', p.shaNumber], ['Date of birth', date(p.dateOfBirth)], ['Blood group', p.bloodGroup], ['Marital status', p.maritalStatus], ['County', p.county], ['Sub-county', p.subCounty], ['Occupation', p.occupation], ['Email', p.email], ['Next of kin', Array.isArray(p.nextOfKin) && p.nextOfKin[0] ? `${p.nextOfKin[0].name} (${p.nextOfKin[0].relationship ?? ''}) ${p.nextOfKin[0].phone ?? ''}` : '—']]} /></Card>
        <Card title="Active covers">{(covers.data?.data ?? p.covers ?? []).length ? (covers.data?.data ?? p.covers).map((c: any) => <div key={c.id} className="mb-2 text-sm"><p className="font-medium">{c.scheme?.name ?? c.schemeName ?? c.payerName}</p><p className="text-xs text-slate-500">{c.memberNumber} · <StatusBadge status={c.active === false ? 'INACTIVE' : 'ACTIVE'} /></p></div>) : <p className="text-sm text-slate-500">Cash patient</p>}</Card>
        <Card title="Recent visits" className="lg:col-span-3"><VisitTable rows={(visits.data?.data ?? []).slice(0, 5)} /></Card>
      </div>}
      {tab === 'visits' && <div className="card"><VisitTable rows={visits.data?.data ?? []} /></div>}
      {tab === 'allergies' && <Card title="Allergies" actions={<button className="btn-secondary py-1" onClick={() => setDialog('allergy')}><Plus className="h-4 w-4" />Add</button>}>
        <Table rows={alg} columns={[{ key: 'substance', header: 'Substance' }, { key: 'reaction', header: 'Reaction' }, { key: 'severity', header: 'Severity', render: (a: any) => <StatusBadge status={a.severity} tone={a.severity === 'SEVERE' ? 'red' : 'amber'} /> }, { key: 'createdAt', header: 'Recorded', render: (a: any) => date(a.createdAt) }]} /></Card>}
      {tab === 'covers' && <Card title="Insurance & SHA covers" actions={<button className="btn-secondary py-1" onClick={() => setDialog('cover')}><Plus className="h-4 w-4" />Add cover</button>}>
        <Table rows={covers.data?.data ?? []} columns={[{ key: 'scheme', header: 'Scheme', render: (c: any) => c.scheme?.name ?? c.schemeId }, { key: 'memberNumber', header: 'Member no.' }, { key: 'principal', header: 'Principal', render: (c: any) => c.principalName ?? (c.isPrincipal ? 'Self' : '—') }, { key: 'validTo', header: 'Valid to', render: (c: any) => date(c.validTo) }, { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.active === false ? 'INACTIVE' : 'ACTIVE'} /> }]} /></Card>}
      {tab === 'bills' && <div className="card"><Table rows={bills.data?.data ?? []} columns={[{ key: 'billNumber', header: 'Bill', render: (b: any) => <Link className="text-primary-600" href={`/billing/${b.id}`}>{b.billNumber ?? b.id.slice(0, 8)}</Link> }, { key: 'createdAt', header: 'Date', render: (b: any) => date(b.createdAt) }, { key: 'payerType', header: 'Payer', render: (b: any) => b.visit?.payerType ?? '—' }, { key: 'totalMinor', header: 'Total', render: (b: any) => money(b.totalMinor) }, { key: 'balanceMinor', header: 'Balance', render: (b: any) => money(Math.max((b.patientAmountMinor ?? 0) - (b.paidMinor ?? 0), 0)) }, { key: 'status', header: 'Status', render: (b: any) => <StatusBadge status={b.status} /> }]} /></div>}
      <OpenVisitDialog open={visitOpen} onClose={() => setVisitOpen(false)} patient={p} />
      <FormDialog open={dialog === 'allergy'} onClose={() => setDialog('')} title="Add allergy" path={`/patients/${id}/allergies`} fields={[{ name: 'substance', label: 'Substance', required: true }, { name: 'reaction', label: 'Reaction' }, { name: 'severity', label: 'Severity', type: 'select', options: ['MILD', 'MODERATE', 'SEVERE'] }]} />
      <FormDialog open={dialog === 'cover'} onClose={() => setDialog('')} title="Add cover" path={`/patients/${id}/covers`} fields={[{ name: 'schemeId', label: 'Scheme', type: 'picker', source: PICK.scheme, required: true }, { name: 'memberNumber', label: 'Member number', required: true }, { name: 'principalName', label: 'Principal member' }, { name: 'relationship', label: 'Relationship', type: 'select', options: ['SELF', 'SPOUSE', 'CHILD', 'OTHER'] }, { name: 'validFrom', label: 'Valid from', type: 'date' }, { name: 'validTo', label: 'Valid to', type: 'date' }]} />
    </div>
  );
}

function VisitTable({ rows }: { rows: any[] }) {
  return <Table rows={rows} columns={[
    { key: 'visitNumber', header: 'Visit', render: (v: any) => <Link className="text-primary-600" href={`/opd/${v.id}`}>{v.visitNumber}</Link> },
    { key: 'startedAt', header: 'Date', render: (v: any) => dateTime(v.startedAt) }, { key: 'type', header: 'Type' }, { key: 'payerType', header: 'Payer' },
    { key: 'diagnosis', header: 'Diagnosis', render: (v: any) => v.diagnoses?.map((d: any) => d.title ?? d.code).join(', ') || '—' },
    { key: 'status', header: 'Status', render: (v: any) => <StatusBadge status={v.status} /> },
  ]} />;
}
