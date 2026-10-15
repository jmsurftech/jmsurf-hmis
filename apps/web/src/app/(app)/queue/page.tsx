'use client';
import { CheckCircle2, Clock, ExternalLink, Megaphone, Monitor, Play, RotateCcw, SkipForward, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, PageHeader, StatCard, Spinner } from '@/components/ui';
import { useConfirm } from '@/components/Toast';
import { useAction } from '@/lib/hooks';
import { fullName } from '@/lib/format';
import { api } from '@/lib/api';
import { SERVICE_POINTS } from '@/lib/pickers';
import { cn } from '@/lib/cn';

type Ticket = { id: string; visitId: string; token: string; priority: number; status: string; waitingMins: number; patient: any; visitNumber: string };
type Lane = { waiting: Ticket[]; called: Ticket[]; serving: Ticket[]; doneToday: number; avgWaitMins: number | null };
const LABEL: Record<string, string> = { TRIAGE: 'Triage', CONSULTATION: 'Consultation', LAB: 'Laboratory', PHARMACY: 'Pharmacy', CASHIER: 'Cashier', RADIOLOGY: 'Radiology' };
const lbl = (s: string) => LABEL[s] ?? s.charAt(0) + s.slice(1).toLowerCase();

export default function QueueBoard() {
  const [sp, setSp] = useState('TRIAGE'); const [next, setNext] = useState(''); const confirm = useConfirm();
  useEffect(() => { const q = new URLSearchParams(window.location.search).get('sp'); if (q && SERVICE_POINTS.includes(q)) setSp(q); }, []);
  const board = useQuery({ queryKey: ['/queue/board', 'all'], queryFn: () => api.get<Record<string, Lane>>('/queue/board'), refetchInterval: 10_000 });
  const inv = { invalidate: ['/queue'] };
  const callNext = useAction('post', '/queue/call-next', { ...inv, success: 'Next patient called' });
  const act = useAction<{ id: string; action: string; nextServicePoint?: string }>('post', (b) => `/queue/tickets/${b.id}/${b.action}`, { ...inv, success: 'Queue updated' });
  const b: Lane = board.data?.[sp] ?? { waiting: [], called: [], serving: [], doneToday: 0, avgWaitMins: null };
  const count = (s: string) => { const l = board.data?.[s]; return l ? l.waiting.length + l.called.length : 0; };

  const Col = ({ title, tone, items, actions, hint }: { title: string; tone: string; items: Ticket[]; actions: (t: Ticket) => React.ReactNode; hint: string }) => (
    <Card title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />{title}<span className="badge">{items.length}</span></span>} bodyClass="!p-3">
      {items.length ? <div className="qcol">{items.map((t) => (
        <div key={t.id} className="qcard">
          <span className="token">{t.token}</span>
          <div className="min-w-0 flex-1">
            <Link href={`/patients/${t.patient?.id ?? ''}`} className="block truncate font-bold text-inherit no-underline hover:text-brand">{fullName(t.patient)}</Link>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{t.patient?.mrn}<span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.waitingMins} min</span>{t.priority <= 2 && <span className="badge red">Priority {t.priority}</span>}</span>
          </div>
          <div className="flex shrink-0 gap-1.5">{actions(t)}</div>
        </div>
      ))}</div> : <EmptyState title="No one here" message={hint} />}
    </Card>
  );

  return (
    <div>
      <PageHeader title="Queue" subtitle="Live patient flow by service point. Refreshes every 10 seconds." actions={<>
        <Link href={`/queue/display?servicePoint=${sp}`} target="_blank" className="btn"><Monitor />TV display<ExternalLink className="!h-3.5 !w-3.5 opacity-60" /></Link>
        <button className="btn primary" disabled={callNext.isPending || !b.waiting.length} onClick={() => callNext.mutate({ servicePoint: sp })}>{callNext.isPending ? <Spinner /> : <Megaphone />}Call next</button>
      </>} />
      <div className="tabs">{SERVICE_POINTS.map((s) => <button key={s} className={cn('tab', sp === s && 'on')} onClick={() => setSp(s)}>{lbl(s)}<span className="n">{count(s)}</span></button>)}</div>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Waiting" value={b.waiting.length} icon={Users} loading={board.isLoading} />
        <StatCard label="Being served" value={b.serving.length + b.called.length} icon={Play} tone="blue" loading={board.isLoading} />
        <StatCard label="Done today" value={b.doneToday} icon={CheckCircle2} tone="green" loading={board.isLoading} />
        <StatCard label="Average wait" value={b.avgWaitMins != null ? `${b.avgWaitMins} min` : '—'} icon={Clock} tone="amber" loading={board.isLoading} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-600 dark:text-slate-300">When a patient is done here, send them to</span>
        <select className="input sm w-auto" value={next} onChange={(e) => setNext(e.target.value)}><option value="">Nowhere (finish)</option>{SERVICE_POINTS.filter((s) => s !== sp).map((s) => <option key={s} value={s}>{lbl(s)}</option>)}</select></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Col title="Waiting" tone="var(--warn)" items={b.waiting} hint={`Patients sent to ${lbl(sp).toLowerCase()} appear here.`} actions={(t) => <button className="btn sm icon" title="Skip" aria-label="Skip" onClick={async () => { if (await confirm({ title: `Skip ${t.token}?`, message: 'The patient leaves the queue. You can requeue them later.', confirm: 'Skip' })) act.mutate({ id: t.id, action: 'skip' }); }}><SkipForward /></button>} />
        <Col title="Called" tone="var(--info)" items={b.called} hint="Call the next patient to fill this column." actions={(t) => <><button className="btn sm icon" title="Requeue" aria-label="Requeue" onClick={() => act.mutate({ id: t.id, action: 'requeue' })}><RotateCcw /></button><button className="btn primary sm" onClick={() => act.mutate({ id: t.id, action: 'serve' })}><Play />Serve</button></>} />
        <Col title="Serving" tone="var(--ok)" items={b.serving} hint="Patients you are attending to now." actions={(t) => <><Link href={`/opd/${t.visitId}`} className="btn sm">Open</Link><button className="btn ok sm" onClick={() => act.mutate({ id: t.id, action: 'done', nextServicePoint: next || undefined })}><CheckCircle2 />Done</button></>} />
      </div>
    </div>
  );
}
