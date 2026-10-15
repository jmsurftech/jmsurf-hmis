'use client';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { usePortal, when } from '@/lib/portal';
import { Box, Busy } from '../parts';

export default function Sha() {
  const { data, isLoading, refetch, isFetching } = usePortal<any>('/portal/sha');
  return (
    <Box title="Social Health Authority (SHA) cover" action={<button className="text-xs text-primary-600" onClick={() => refetch()}>{isFetching ? 'Checking…' : 'Re-check'}</button>}>
      {isLoading ? <Busy /> : data && (
        <div className="flex items-start gap-3">
          {data.eligible ? <ShieldCheck className="h-10 w-10 text-emerald-600" /> : <ShieldX className="h-10 w-10 text-amber-600" />}
          <div className="text-sm">
            <p className="text-lg font-semibold">{data.eligible ? 'Active' : 'Not active'}</p>
            {data.fund && <p>Fund: {data.fund}</p>}
            {data.shaNumber && <p>SHA number: {data.shaNumber}</p>}
            {data.message && <p className="text-slate-500">{data.message}</p>}
            {data.checkedAt && <p className="text-xs text-slate-400">Checked {when(data.checkedAt)}</p>}
          </div>
        </div>)}
    </Box>
  );
}
