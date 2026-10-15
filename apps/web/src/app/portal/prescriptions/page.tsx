'use client';
import { usePortal, when } from '@/lib/portal';
import { Box, Busy, Empty, Err, Pill } from '../parts';

export default function Prescriptions() {
  const { data, isLoading, error } = usePortal<any[]>('/portal/prescriptions');
  return (
    <Box title="My medicines">
      {isLoading ? <Busy /> : <Err error={error} />}
      {!isLoading && !(data ?? []).length && <Empty text="No prescriptions" />}
      {(data ?? []).map((p) => (
        <div key={p.id} className="border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
          <div className="flex justify-between"><p className="font-medium">{p.drugName}</p><Pill tone={p.status === 'DISPENSED' ? 'green' : 'amber'}>{p.status}</Pill></div>
          <p className="text-sm">{p.dose} · {p.frequency}{p.durationDays ? ` · ${p.durationDays} days` : ''}</p>
          {p.instructions && <p className="text-xs text-slate-500">{p.instructions}</p>}
          <p className="text-xs text-slate-400">{when(p.createdAt)} · {p.visit?.type === 'TELEMEDICINE' ? 'e-prescription (video)' : p.visit?.visitNumber}</p>
        </div>))}
    </Box>
  );
}
