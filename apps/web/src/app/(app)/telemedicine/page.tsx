'use client';
import { CalendarPlus, CheckCircle2, Clock, Video, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table } from '@/components/DataTable';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { dateTime, fullName, money } from '@/lib/format';
import { useGet } from '@/lib/hooks';

export default function Telemedicine() {
  const router = useRouter();
  const { data, isLoading, error } = useGet<any[]>('/telemedicine');
  const rows = data ?? [];
  const live = rows.filter((r) => r.joinable && !['CANCELLED', 'DONE', 'NO_SHOW'].includes(r.status));
  const unpaid = rows.filter((r) => !r.payment || r.payment.dueMinor > 0);
  return (
    <div>
      <PageHeader title="Telemedicine" subtitle="Video consultations for the next 7 days. Patients pay the consultation fee in the patient portal before the room opens; book a video visit from Appointments (mode: telemedicine)."
        actions={<Link href="/appointments" className="btn primary"><CalendarPlus />Book a video visit</Link>} />
      <ErrorNote error={error} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Ready to join now" value={live.length} icon={Video} tone="green" loading={isLoading} />
        <StatCard label="Booked this week" value={rows.length} icon={Clock} loading={isLoading} />
        <div className="col-span-2 lg:col-span-1"><StatCard label="Not yet paid" value={unpaid.length} icon={Wallet} tone="amber" loading={isLoading} /></div>
      </div>
      <Card flush title="Video consults">
        {isLoading ? <Loading /> : <Table rows={rows} onRowClick={(r: any) => router.push(`/telemedicine/${r.id}`)} empty={<EmptyState icon={Video} title="No video consults booked" message="Patients can book a video visit in the patient portal, or the front desk can book one." />} columns={[
          { key: 'startAt', header: 'When', render: (r: any) => <b>{dateTime(r.startAt)}</b> },
          { key: 'patient', header: 'Patient', render: (r: any) => <span><b className="block">{fullName(r.patient)}</b><small className="text-slate-500">{r.patient?.mrn}</small></span> },
          { key: 'practitioner', header: 'Clinician', render: (r: any) => (r.practitioner ? `${r.practitioner.firstName} ${r.practitioner.lastName}` : <span className="muted">Any</span>) },
          { key: 'payment', header: 'Fee', render: (r: any) => !r.payment ? <span className="badge amber">Not started</span> : r.payment.dueMinor > 0 ? <span className="badge amber">{money(r.payment.dueMinor)} due</span> : <span className="badge green"><CheckCircle2 className="h-3 w-3" />Paid</span> },
          { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
          { key: 'a', header: '', className: 'text-right', render: (r: any) => r.joinable && !['CANCELLED', 'DONE', 'NO_SHOW'].includes(r.status) ? <Link className="btn primary sm" href={`/telemedicine/${r.id}`} onClick={(e) => e.stopPropagation()}><Video />Open room</Link> : null },
        ]} />}
      </Card>
    </div>
  );
}
