'use client';
import { BedDouble } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/DataTable';
import { Card, EmptyState, Loading, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { useList } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { date, fullName } from '@/lib/format';

const BED_COLORS: Record<string, string> = {
  AVAILABLE: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  OCCUPIED: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  RESERVED: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CLEANING: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  MAINTENANCE: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
};
export default function Ipd() {
  const router = useRouter();
  const { data, isLoading } = useList<any>('/inpatient/bed-board');
  const wards = data?.data ?? [];
  const beds = wards.flatMap((w) => w.beds ?? []);
  const count = (s: string) => beds.filter((b: any) => b.status === s).length;
  return (
    <div>
      <PageHeader title="Inpatient bed board" subtitle="Wards and beds by status" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total beds" value={beds.length} icon={BedDouble} />
        <StatCard label="Occupied" value={count('OCCUPIED')} tone="red" hint={beds.length ? `${Math.round((count('OCCUPIED') / beds.length) * 100)}% occupancy` : ''} />
        <StatCard label="Available" value={count('AVAILABLE')} tone="green" />
        <StatCard label="Cleaning / reserved" value={count('CLEANING') + count('RESERVED')} tone="amber" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">{Object.keys(BED_COLORS).map((s) => <span key={s} className={cn('rounded border px-2 py-0.5', BED_COLORS[s])}>{s}</span>)}</div>
      {isLoading ? <Loading /> : !wards.length ? <EmptyState title="No wards configured" /> : <div className="space-y-4">
        {wards.map((w) => (
          <Card key={w.id} title={`${w.name} · ${(w.beds ?? []).filter((b: any) => b.status === 'OCCUPIED').length}/${(w.beds ?? []).length} occupied`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {(w.beds ?? []).map((b: any) => (
                <button key={b.id} onClick={() => b.admission && router.push(`/ipd/admissions/${b.admission.id}`)} className={cn('rounded-lg border p-2 text-left text-xs', BED_COLORS[b.status] ?? BED_COLORS.MAINTENANCE)}>
                  <p className="font-semibold">{b.label}</p>
                  <p className="truncate">{b.admission ? `${fullName(b.admission.visit?.patient)} · ${b.admission.losDays}d` : b.status}</p>
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>}
      <h2 className="mb-2 mt-6 font-semibold">Current admissions</h2>
      <DataTable path="/inpatient/admissions" searchable={false} onRowClick={(a: any) => router.push(`/ipd/admissions/${a.id}`)} columns={[
        { key: 'visit', header: 'Visit', render: (a: any) => a.visit?.visitNumber }, { key: 'patient', header: 'Patient', render: (a: any) => fullName(a.visit?.patient) },
        { key: 'ward', header: 'Ward / bed', render: (a: any) => { const w = wards.find((x: any) => x.id === a.wardId); return `${w?.name ?? ''} ${w?.beds?.find((b: any) => b.id === a.bedId)?.label ?? ''}`; } }, { key: 'admittedAt', header: 'Admitted', render: (a: any) => date(a.admittedAt) },
        { key: 'status', header: 'Status', render: () => <StatusBadge status="ADMITTED" /> },
      ]} />
    </div>
  );
}
