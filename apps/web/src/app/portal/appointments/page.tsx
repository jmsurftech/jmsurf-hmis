'use client';
import { Video } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { kes, portal, portalStore, usePortal, usePortalAction, when } from '@/lib/portal';
import { Box, Busy, Empty, Err, Pill } from '../parts';

const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

function Booking({ onDone }: { onDone: () => void }) {
  const prs = usePortal<any[]>('/portal/practitioners', {}, false);
  const [pr, setPr] = useState(''); const [date, setDate] = useState(today()); const [mode, setMode] = useState('IN_PERSON');
  const [slot, setSlot] = useState(''); const [reason, setReason] = useState('');
  const slots = usePortal<any[]>(pr ? '/portal/slots' : null, { practitionerId: pr, date, mode }, false);
  const book = usePortalAction((b: any) => portal.post('/portal/appointments', b));
  useEffect(() => { if (!pr && prs.data?.[0]) setPr(prs.data[0].id); }, [prs.data, pr]);
  const submit = async () => { await book.mutateAsync({ practitionerId: pr, startAt: slot, mode, reason: reason || undefined, patientId: portalStore.subject() ?? undefined }); onDone(); };
  return (
    <Box title="Book an appointment">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {['IN_PERSON', 'TELEMEDICINE'].map((m) => <button key={m} onClick={() => { setMode(m); setSlot(''); }} className={`rounded-xl border p-2 text-sm ${mode === m ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200' : 'border-slate-200 dark:border-slate-700'}`}>{m === 'IN_PERSON' ? 'At the clinic' : 'Video call'}</button>)}
        </div>
        <div><label className="label">Clinician</label><select className="input" value={pr} onChange={(e) => { setPr(e.target.value); setSlot(''); }}>{(prs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` · ${p.specialty}` : ''}</option>)}</select></div>
        <div><label className="label">Date</label><input className="input" type="date" min={today()} value={date} onChange={(e) => { setDate(e.target.value); setSlot(''); }} /></div>
        <div><label className="label">Time</label>
          {slots.isLoading ? <Busy /> : (slots.data ?? []).length ? <div className="grid grid-cols-4 gap-1.5">{(slots.data ?? []).map((s) => (
            <button key={s.startAt} onClick={() => setSlot(s.startAt)} className={`rounded-lg border py-1.5 text-xs ${slot === s.startAt ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 dark:border-slate-700'}`}>
              {new Date(s.startAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })}</button>))}</div> : <Empty text="No free slots on this day" />}
        </div>
        <div><label className="label">Reason (optional)</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {mode === 'TELEMEDICINE' && <p className="text-xs text-slate-500">Video consultations are paid in advance by M-Pesa. You can join once paid.</p>}
        <Err error={book.error} />
        <button className="btn-primary w-full justify-center" disabled={!slot || book.isPending} onClick={submit}>{book.isPending ? 'Booking…' : 'Confirm booking'}</button>
      </div>
    </Box>
  );
}

function TeleJoin({ a }: { a: any }) {
  const st = usePortal<any>(`/portal/appointments/${a.id}/telemedicine`, {}, false);
  const [phone, setPhone] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const pay = async () => {
    setErr(null);
    try { const r = await portal.post<any>(`/portal/bills/${st.data.billId}/pay`, phone ? { phone } : {}); setMsg(r.message); setTimeout(() => st.refetch(), 15000); } catch (e: any) { setErr(e.message); }
  };
  const join = async () => {
    setErr(null);
    try { const r = await portal.post<any>(`/portal/appointments/${a.id}/telemedicine/join`); window.location.href = r.url; } catch (e: any) { setErr(e.message); }
  };
  if (st.isLoading) return <Busy />;
  if (!st.data) return <Err error={st.error} />;
  return (
    <div className="mt-2 rounded-xl bg-primary-50 p-3 text-sm dark:bg-primary-900/20">
      {st.data.paid ? (
        <button className="btn-primary w-full justify-center" onClick={join}><Video className="h-4 w-4" />Join video consultation</button>
      ) : (
        <div className="space-y-2">
          <p>Consultation fee: <b>{kes(st.data.amountDueMinor)}</b>. Pay to unlock the video link.</p>
          <input className="input" inputMode="tel" placeholder="M-Pesa number (default: your number)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="flex gap-2"><button className="btn-primary flex-1 justify-center" onClick={pay}>Pay with M-Pesa</button><button className="btn-secondary" onClick={() => st.refetch()}>Refresh</button></div>
          {msg && <p className="text-xs text-primary-700">{msg}</p>}
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function Appointments() {
  const [book, setBook] = useState(useSearchParams().get('book') === '1');
  const { data, isLoading, error } = usePortal<any[]>('/portal/appointments');
  const cancel = usePortalAction((id: string) => portal.post(`/portal/appointments/${id}/cancel`));
  const upcoming = (data ?? []).filter((a) => new Date(a.endAt) > new Date() && !['CANCELLED', 'DONE', 'NO_SHOW'].includes(a.status)).reverse();
  const past = (data ?? []).filter((a) => !upcoming.includes(a));
  return (
    <div>
      {book ? <Booking onDone={() => setBook(false)} /> : <button className="btn-primary mb-3 w-full justify-center" onClick={() => setBook(true)}>Book an appointment</button>}
      <Box title="Upcoming">
        {isLoading ? <Busy /> : <Err error={error} />}
        {!isLoading && !upcoming.length && <Empty text="No upcoming appointments" />}
        {upcoming.map((a) => (
          <div key={a.id} className="border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
            <div className="flex items-start justify-between"><div><p className="font-medium">{when(a.startAt)}</p><p className="text-xs text-slate-500">{a.practitioner?.name ?? 'Clinic'}{a.reason ? ` · ${a.reason}` : ''}</p></div>
              {a.mode === 'TELEMEDICINE' ? <Pill tone="blue">Video</Pill> : <Pill>{a.status}</Pill>}</div>
            {a.mode === 'TELEMEDICINE' && <TeleJoin a={a} />}
            {['BOOKED', 'CONFIRMED'].includes(a.status) && <button className="mt-2 text-xs text-red-600 underline" onClick={() => { if (confirm('Cancel this appointment?')) cancel.mutate(a.id); }}>Cancel appointment</button>}
          </div>))}
      </Box>
      <Box title="Past">
        {!past.length ? <Empty text="Nothing yet" /> : past.slice(0, 20).map((a) => (
          <div key={a.id} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800"><span>{when(a.startAt)}</span><Pill tone={a.status === 'CANCELLED' ? 'red' : 'slate'}>{a.status}</Pill></div>))}
      </Box>
    </div>
  );
}
export default function Page() { return <Suspense><Appointments /></Suspense>; }
