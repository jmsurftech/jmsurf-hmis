'use client';
import { Download, History, Printer } from 'lucide-react';
import { useState } from 'react';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, Spinner, StatusBadge, humanize } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { date } from '@/lib/format';
import { portal, usePortal } from '@/lib/portal';

export default function Visits() {
  const { data, isLoading, error } = usePortal<any[]>('/visits'); const toast = useToast(); const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const rec = await portal.get('/record');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' }));
      a.download = `health-record-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    } catch (e) { toast.push((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Visit history" subtitle="Every visit you have made to this hospital. Download a copy of your record or print this page."
        actions={<><button className="btn" onClick={() => window.print()}><Printer />Print</button><button className="btn primary" disabled={busy} onClick={download}>{busy ? <Spinner /> : <Download />}Download my record</button></>} />
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={History} title="No visits yet" /></Card> :
        <Card flush><ol className="m-0 list-none divide-y divide-slate-200/70 p-0 dark:divide-white/10">{data.map((v) => (
          <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <b className="block">{date(v.startedAt)} · {humanize(v.type)}</b>
              <small className="text-slate-500">Visit {v.visitNumber} · {humanize(v.payerType)}{v._count.orders ? ` · ${v._count.orders} test${v._count.orders === 1 ? '' : 's'}` : ''}{v._count.prescriptions ? ` · ${v._count.prescriptions} medicine${v._count.prescriptions === 1 ? '' : 's'}` : ''}</small>
              {v.diagnoses?.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{v.diagnoses.map((d: any) => <span key={d.code} className="badge">{d.display}</span>)}</div>}
            </div>
            <StatusBadge status={v.status} />
          </li>))}</ol></Card>}
    </div>
  );
}
