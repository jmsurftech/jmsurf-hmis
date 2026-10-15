'use client';
import { Pill } from 'lucide-react';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { date } from '@/lib/format';
import { usePortal } from '@/lib/portal';

export default function Medicines() {
  const { data, isLoading, error } = usePortal<any[]>('/prescriptions');
  return (
    <div>
      <PageHeader title="Medicines" subtitle="Everything prescribed for you. Always follow the instructions on the label and your clinician's advice." />
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={Pill} title="No prescriptions yet" /></Card> :
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.map((r) => (
          <div key={r.id} className="card card-body flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--teal) 14%, transparent)', color: 'var(--teal)' }}><Pill className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2"><b className="block">{r.drugName}</b><StatusBadge status={r.status} /></div>
              <p className="m-0 text-sm">{[r.dose, r.route, r.frequency, r.durationDays ? `for ${r.durationDays} days` : null].filter(Boolean).join(' · ')}</p>
              {r.instructions && <p className="m-0 mt-1 text-sm text-slate-500">{r.instructions}</p>}
              <small className="mt-1 block text-slate-500">Quantity {r.quantity} · {date(r.createdAt)}</small>
            </div>
          </div>
        ))}</div>}
    </div>
  );
}
