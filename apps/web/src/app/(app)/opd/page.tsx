'use client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/DataTable';
import { PageHeader, StatusBadge } from '@/components/ui';
import { dateTime, fullName } from '@/lib/format';
export default function OpdList() {
  const router = useRouter();
  return <div><PageHeader title="OPD" subtitle="Open outpatient visits" />
    <DataTable path="/visits" query={{ status: 'OPEN,IN_PROGRESS', type: 'OPD' }} onRowClick={(v: any) => router.push(`/opd/${v.id}`)} columns={[
      { key: 'visitNumber', header: 'Visit' }, { key: 'patient', header: 'Patient', render: (v: any) => fullName(v.patient) }, { key: 'payerType', header: 'Payer' },
      { key: 'startedAt', header: 'Started', render: (v: any) => dateTime(v.startedAt) }, { key: 'triage', header: 'Triage', render: (v: any) => <StatusBadge status={v.triageCategory ?? v.triage?.[0]?.category} /> }, { key: 'status', header: 'Status', render: (v: any) => <StatusBadge status={v.status} /> },
    ]} /></div>;
}
