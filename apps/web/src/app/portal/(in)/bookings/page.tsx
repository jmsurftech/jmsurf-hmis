'use client';
import { CalendarDays, CalendarPlus, Video, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Seg, StatusBadge } from '@/components/ui';
import { useConfirm } from '@/components/Toast';
import { dateTime } from '@/lib/format';
import { usePortal, usePortalAction } from '@/lib/portal';

function BookDialog({ onClose }: { onClose: () => void }) {
  const opts = usePortal<any[]>('/booking-options');
  const [facilityId, setFac] = useState(''); const [departmentId, setDep] = useState(''); const [when, setWhen] = useState(''); const [mode, setMode] = useState<'IN_PERSON' | 'TELEMEDICINE'>('IN_PERSON'); const [reason, setReason] = useState('');
  useEffect(() => { if (opts.data?.length && !facilityId) setFac(opts.data[0].id); }, [opts.data, facilityId]);
  const fac = opts.data?.find((f) => f.id === facilityId);
  const book = usePortalAction('/appointments', { success: 'Booked. The hospital will confirm your visit.', onSuccess: onClose });
  const min = new Date(Date.now() + 60 * 60_000); min.setMinutes(0, 0, 0);
  return (
    <Modal open onClose={onClose} title="Book a visit" subtitle="Pick a clinic and a time. The hospital confirms the booking."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!facilityId || !when || book.isPending} onClick={() => book.mutate({ facilityId, departmentId: departmentId || undefined, startAt: new Date(when).toISOString(), mode, reason })}><CalendarPlus />Book</button></>}>
      {opts.isLoading ? <Loading rows={3} /> : <div className="grid gap-4">
        {(opts.data?.length ?? 0) > 1 && <Field label="Facility"><select className="input" value={facilityId} onChange={(e) => { setFac(e.target.value); setDep(''); }}>{opts.data!.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        <Field label="Clinic"><select className="input" value={departmentId} onChange={(e) => setDep(e.target.value)}><option value="">General outpatient</option>{fac?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Date and time"><input className="input" type="datetime-local" min={min.toISOString().slice(0, 16)} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Type of visit"><Seg options={[{ id: 'IN_PERSON', label: 'At the hospital' }, { id: 'TELEMEDICINE', label: 'Video call' }]} value={mode} onChange={setMode} /></Field>
        <Field label="Reason (optional)"><textarea className="input" rows={2} maxLength={300} placeholder="Enter a short reason for the visit" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>}
    </Modal>
  );
}

export default function Bookings() {
  const { data, isLoading, error } = usePortal<any[]>('/appointments'); const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new')) setOpen(true); }, []);
  const cancel = usePortalAction<string>((id) => `/appointments/${id}/cancel`, { success: 'Booking cancelled' });
  const now = Date.now();
  const upcoming = (data ?? []).filter((a) => new Date(a.startAt).getTime() >= now && ['BOOKED', 'CONFIRMED'].includes(a.status)).reverse();
  const past = (data ?? []).filter((a) => !upcoming.includes(a));
  const Row = ({ a, canCancel }: { a: any; canCancel?: boolean }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <span className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">{a.mode === 'TELEMEDICINE' ? <Video className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}</span>
        <span className="min-w-0"><b className="block">{dateTime(a.startAt)}</b><small className="block truncate text-slate-500">{[a.department ?? 'General outpatient', a.facility, a.mode === 'TELEMEDICINE' ? 'Video call' : null].filter(Boolean).join(' · ')}</small></span></span>
      <span className="flex items-center gap-2"><StatusBadge status={a.status} />{a.mode === 'TELEMEDICINE' && ['BOOKED', 'CONFIRMED', 'ARRIVED'].includes(a.status) && <Link className="btn sm primary" href={`/portal/consult/${a.id}`}><Video />Open video visit</Link>}
        {canCancel && <button className="btn sm" onClick={async () => { if (await confirm({ title: 'Cancel this booking?', confirm: 'Cancel booking' })) cancel.mutate(a.id); }}><X />Cancel</button>}</span>
    </li>
  );
  return (
    <div>
      <PageHeader title="Bookings" subtitle="Book, follow and cancel your visits." actions={<button className="btn primary" onClick={() => setOpen(true)}><CalendarPlus />Book a visit</button>} />
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : <div className="grid gap-4">
        <Card title="Upcoming" flush>{upcoming.length ? <ul className="divide-y divide-slate-200/70 dark:divide-white/10">{upcoming.map((a) => <Row key={a.id} a={a} canCancel />)}</ul> : <EmptyState icon={CalendarDays} title="No upcoming bookings" action={<button className="btn primary sm" onClick={() => setOpen(true)}><CalendarPlus />Book a visit</button>} />}</Card>
        {past.length > 0 && <Card title="Past and cancelled" flush><ul className="divide-y divide-slate-200/70 dark:divide-white/10">{past.map((a) => <Row key={a.id} a={a} />)}</ul></Card>}
      </div>}
      {open && <BookDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
