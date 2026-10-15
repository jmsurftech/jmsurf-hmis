'use client';
import { Megaphone, Monitor, Play, CheckCircle2, SkipForward } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { useAction, useList } from '@/lib/hooks';
import { fullName } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

export default function QueueBoard() {
  const sps = useList<any>('/queue/service-points', { pageSize: 100 });
  const [sp, setSp] = useState('');
  useEffect(() => { if (!sp && sps.data?.data?.[0]) setSp(sps.data.data[0].id); }, [sps.data, sp]);
  const tickets = useQuery({ queryKey: ['/queue/tickets', sp], queryFn: () => api.get<Paginated<any>>('/queue/tickets', { servicePointId: sp, pageSize: 100 }), enabled: !!sp, refetchInterval: 10_000 });
  const inv = { invalidate: ['/queue'] };
  const callNext = useAction('post', `/queue/service-points/${sp}/call-next`, { ...inv, success: 'Next patient called' });
  const act = useAction<{ id: string; action: string }>('post', (b) => `/queue/tickets/${b.id}/${b.action}`, inv);
  const rows = tickets.data?.data ?? [];
  const col = (statuses: string[]) => rows.filter((t) => statuses.includes(t.status));
  const Column = ({ title, items, actions }: { title: string; items: any[]; actions: (t: any) => React.ReactNode }) => (
    <Card title={`${title} (${items.length})`}>
      {items.length ? <ul className="space-y-2">{items.map((t) => (
        <li key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div><p className="text-lg font-bold">{t.ticketNumber ?? t.number}</p><p className="text-sm">{fullName(t.patient)}</p><p className="text-xs text-slate-500">{t.priority && t.priority !== 'NORMAL' ? <StatusBadge status={t.priority} tone="red" /> : null} {t.waitMinutes != null ? `${t.waitMinutes} min` : ''}</p></div>
          <div className="flex gap-1">{actions(t)}</div>
        </li>))}</ul> : <EmptyState title="Empty" />}
    </Card>
  );
  return (
    <div>
      <PageHeader title="Queue" subtitle="Live patient flow per service point" actions={<>
        <select className="input w-auto" value={sp} onChange={(e) => setSp(e.target.value)}>{sps.data?.data.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <Link href={`/queue/display${sp ? `?servicePointId=${sp}` : ''}`} target="_blank" className="btn-secondary"><Monitor className="h-4 w-4" />TV display</Link>
        <button className="btn-primary" disabled={!sp || callNext.isPending} onClick={() => callNext.mutate(undefined)}><Megaphone className="h-4 w-4" />Call next</button>
      </>} />
      {!sps.isLoading && !sps.data?.data?.length && <EmptyState title="No service points" message="Create service points under Admin › Departments." />}
      <div className="grid gap-4 md:grid-cols-3">
        <Column title="Waiting" items={col(['WAITING'])} actions={(t) => <><button className="btn-secondary px-2" title="Call" onClick={() => act.mutate({ id: t.id, action: 'call' })}><Megaphone className="h-4 w-4" /></button><button className="btn-secondary px-2" title="Skip" onClick={() => act.mutate({ id: t.id, action: 'skip' })}><SkipForward className="h-4 w-4" /></button></>} />
        <Column title="Called" items={col(['CALLED'])} actions={(t) => <><button className="btn-secondary px-2" title="Recall" onClick={() => act.mutate({ id: t.id, action: 'call' })}><Megaphone className="h-4 w-4" /></button><button className="btn-primary px-2" title="Serve" onClick={() => act.mutate({ id: t.id, action: 'serve' })}><Play className="h-4 w-4" /></button></>} />
        <Column title="Serving" items={col(['SERVING', 'IN_PROGRESS'])} actions={(t) => <>{t.visitId && <Link href={`/opd/${t.visitId}`} className="btn-secondary px-2 text-xs">Open</Link>}<button className="btn-primary px-2" title="Done" onClick={() => act.mutate({ id: t.id, action: 'done' })}><CheckCircle2 className="h-4 w-4" /></button></>} />
      </div>
    </div>
  );
}
