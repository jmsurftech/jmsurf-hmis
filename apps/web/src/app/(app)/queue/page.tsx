'use client';
import { CheckCircle2, Megaphone, Monitor, Play, RotateCcw, SkipForward } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { useAction } from '@/lib/hooks';
import { fullName } from '@/lib/format';
import { api } from '@/lib/api';
import { SERVICE_POINTS } from '@/lib/pickers';

type Ticket = { id: string; visitId: string; token: string; priority: number; status: string; waitingMins: number; patient: any; visitNumber: string };
type Board = Record<string, { waiting: Ticket[]; called: Ticket[]; serving: Ticket[]; doneToday: number; avgWaitMins: number | null }>;

export default function QueueBoard() {
  const [sp, setSp] = useState('TRIAGE');
  const board = useQuery({ queryKey: ['/queue/board', sp], queryFn: () => api.get<Board>('/queue/board', { servicePoint: sp }), refetchInterval: 10_000 });
  const inv = { invalidate: ['/queue'] };
  const callNext = useAction('post', '/queue/call-next', { ...inv, success: 'Next patient called' });
  const act = useAction<{ id: string; action: string; nextServicePoint?: string }>('post', (b) => `/queue/tickets/${b.id}/${b.action}`, inv);
  const b = board.data?.[sp] ?? { waiting: [], called: [], serving: [], doneToday: 0, avgWaitMins: null };
  const [next, setNext] = useState('');
  const Column = ({ title, items, actions }: { title: string; items: Ticket[]; actions: (t: Ticket) => React.ReactNode }) => (
    <Card title={`${title} (${items.length})`}>
      {items.length ? <ul className="space-y-2">{items.map((t) => (
        <li key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div><p className="text-lg font-bold">{t.token}</p><p className="text-sm">{fullName(t.patient)} <span className="text-xs text-slate-500">{t.patient?.mrn}</span></p><p className="text-xs text-slate-500">{t.priority <= 2 ? <StatusBadge status={`P${t.priority}`} tone="red" /> : null} {t.waitingMins} min</p></div>
          <div className="flex gap-1">{actions(t)}</div>
        </li>))}</ul> : <EmptyState title="Empty" />}
    </Card>
  );
  return (
    <div>
      <PageHeader title="Queue" subtitle={`Live patient flow · ${b.doneToday} done today${b.avgWaitMins != null ? ` · avg wait ${b.avgWaitMins} min` : ''}`} actions={<>
        <select className="input w-auto" value={sp} onChange={(e) => setSp(e.target.value)} aria-label="Service point">{SERVICE_POINTS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <Link href={`/queue/display?servicePoint=${sp}`} target="_blank" className="btn-secondary"><Monitor className="h-4 w-4" />TV display</Link>
        <button className="btn-primary" disabled={callNext.isPending} onClick={() => callNext.mutate({ servicePoint: sp })}><Megaphone className="h-4 w-4" />Call next</button>
      </>} />
      <div className="mb-3 flex items-center gap-2 text-sm"><span className="text-slate-500">When done, send to:</span>
        <select className="input w-auto py-1" value={next} onChange={(e) => setNext(e.target.value)}><option value="">Nowhere (finish)</option>{SERVICE_POINTS.filter((s) => s !== sp).map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Column title="Waiting" items={b.waiting} actions={(t) => <button className="btn-secondary px-2" title="Skip" onClick={() => act.mutate({ id: t.id, action: 'skip' })}><SkipForward className="h-4 w-4" /></button>} />
        <Column title="Called" items={b.called} actions={(t) => <><button className="btn-secondary px-2" title="Requeue" onClick={() => act.mutate({ id: t.id, action: 'requeue' })}><RotateCcw className="h-4 w-4" /></button><button className="btn-primary px-2" title="Serve" onClick={() => act.mutate({ id: t.id, action: 'serve' })}><Play className="h-4 w-4" /></button></>} />
        <Column title="Serving" items={b.serving} actions={(t) => <><Link href={`/opd/${t.visitId}`} className="btn-secondary px-2 text-xs">Open</Link><button className="btn-primary px-2" title="Done" onClick={() => act.mutate({ id: t.id, action: 'done', nextServicePoint: next || undefined })}><CheckCircle2 className="h-4 w-4" /></button></>} />
      </div>
    </div>
  );
}
