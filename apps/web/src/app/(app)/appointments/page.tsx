'use client';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FormDialog } from '@/components/FormDialog';
import { Card, PageHeader, StatusBadge } from '@/components/ui';
import { useAction, useList } from '@/lib/hooks';
import { fullName } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PICK } from '@/lib/pickers';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function Appointments() {
  const patientId = useSearchParams().get('patientId') ?? '';
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState(iso(new Date())); const [open, setOpen] = useState(!!patientId);
  const from = new Date(month); const to = new Date(month.getFullYear(), month.getMonth() + 1, 0); const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const { data } = useList<any>('/appointments', { from: iso(from), to: iso(next) });
  const status = useAction<{ id: string; status: string }>('patch', (b) => `/appointments/${b.id}`, { invalidate: ['/appointments'], success: 'Updated' });
  const checkIn = useAction<{ id: string }>('post', (b) => `/appointments/${b.id}/check-in`, { invalidate: ['/appointments', '/visits', '/queue'], success: 'Checked in: visit opened' });
  const byDay = useMemo(() => { const m: Record<string, any[]> = {}; (data?.data ?? []).forEach((a) => { const k = String(a.startAt ?? a.date).slice(0, 10); (m[k] ||= []).push(a); }); return m; }, [data]);
  const startPad = (from.getDay() + 6) % 7; const days = to.getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  return (
    <div>
      <PageHeader title="Appointments" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Book appointment</button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={month.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })} actions={<div className="flex gap-1"><button className="btn-secondary px-2 py-1" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></button><button className="btn-secondary px-2 py-1" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></button></div>}>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => d ? (
              <button key={i} onClick={() => setSelected(iso(d))} className={cn('min-h-[64px] rounded-lg border p-1 text-left text-xs sm:min-h-[84px]', selected === iso(d) ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-slate-200 dark:border-slate-800', iso(d) === iso(new Date()) && 'font-bold')}>
                <span>{d.getDate()}</span>
                {(byDay[iso(d)] ?? []).slice(0, 2).map((a) => <span key={a.id} className="mt-0.5 hidden truncate rounded bg-primary-100 px-1 text-[10px] text-primary-800 sm:block dark:bg-primary-900 dark:text-primary-200">{String(a.startAt).slice(11, 16)} {a.patient?.firstName}</span>)}
                {(byDay[iso(d)]?.length ?? 0) > 0 && <span className="mt-0.5 block text-[10px] text-primary-600 sm:hidden">{byDay[iso(d)].length}</span>}
                {(byDay[iso(d)]?.length ?? 0) > 2 && <span className="hidden text-[10px] text-slate-500 sm:block">+{byDay[iso(d)].length - 2} more</span>}
              </button>) : <div key={i} />)}
          </div>
        </Card>
        <Card title={new Date(selected).toDateString()}>
          {(byDay[selected] ?? []).length ? <ul className="space-y-2">{byDay[selected].map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
              <div className="flex justify-between"><span className="font-medium">{String(a.startAt).slice(11, 16)} · {fullName(a.patient)}</span><StatusBadge status={a.status} /></div>
              <p className="text-xs text-slate-500">{a.mode} {a.reason ?? ''}</p>
              {!['CANCELLED', 'DONE', 'NO_SHOW'].includes(a.status) && <div className="mt-2 flex gap-1">
                {a.status !== 'ARRIVED' && <button className="btn-primary px-2 py-0.5 text-[10px]" onClick={() => checkIn.mutate({ id: a.id })}>CHECK IN</button>}
                {['DONE', 'NO_SHOW', 'CANCELLED'].map((s) => <button key={s} className="btn-secondary px-2 py-0.5 text-[10px]" onClick={() => status.mutate({ id: a.id, status: s })}>{s.replace('_', ' ')}</button>)}</div>}
            </li>))}</ul> : <p className="text-sm text-slate-500">No appointments</p>}
        </Card>
      </div>
      <FormDialog open={open} onClose={() => setOpen(false)} title="Book appointment" path="/appointments" success="Appointment booked" defaults={{ patientId, startAt: `${selected}T09:00`, durationMinutes: 30, mode: 'IN_PERSON' }}
        transform={({ durationMinutes, ...v }) => { const start = new Date(v.startAt); return { ...v, startAt: start.toISOString(), endAt: new Date(start.getTime() + (Number(durationMinutes) || 30) * 60000).toISOString() }; }} fields={[
        { name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'startAt', label: 'Start', type: 'datetime-local', required: true },
        { name: 'durationMinutes', label: 'Duration (min)', type: 'number' }, { name: 'mode', label: 'Mode', type: 'select', options: ['IN_PERSON', 'TELEMEDICINE', 'HOME'] },
        { name: 'departmentId', label: 'Department', type: 'picker', source: PICK.department }, { name: 'practitionerId', label: 'Practitioner', type: 'picker', source: PICK.practitioner },
        { name: 'reason', label: 'Reason', type: 'textarea' },
      ]} />
    </div>
  );
}
export default function Page() { return <Suspense><Appointments /></Suspense>; }
