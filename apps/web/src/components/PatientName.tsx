'use client';
import { useGet } from '@/lib/hooks';
import { fullName } from '@/lib/format';

/** Resolve a patient id to a display name (cached per id by react-query). */
export function PatientName({ id, withMrn }: { id?: string | null; withMrn?: boolean }) {
  const { data } = useGet<any>(id ? `/patients/${id}` : null);
  if (!id) return <>—</>;
  return <>{data ? fullName(data) : '…'}{withMrn && data?.mrn ? <span className="ml-1 text-xs text-slate-500">{data.mrn}</span> : null}</>;
}
