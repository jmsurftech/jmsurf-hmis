'use client';
import { ArrowLeft, Clock, Smartphone, Video } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { PayDialog } from '@/components/PortalPay';
import { Card, ErrorNote, Loading, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { dateTime, money } from '@/lib/format';
import { portalStore, usePortal, usePortalAction } from '@/lib/portal';

/** Patient side of a video consult: pay the fee, then join the room in the page. */
export default function Consult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, isLoading, error, refetch } = usePortal<any>(`/consults/${id}`);
  const prepare = usePortalAction(`/consults/${id}/prepare`, {});
  const [pay, setPay] = useState(false);
  if (isLoading) return <Loading />;
  if (error || !c) return <ErrorNote error={error ?? new Error('Consult not found')} />;
  const name = (() => { const a = portalStore.get(); return a ? `${a.patient.firstName} ${a.patient.lastName}` : 'Patient'; })();
  const due = c.payment?.dueMinor ?? 0;
  const room = c.meetingUrl ? `${c.meetingUrl}#config.prejoinPageEnabled=true&userInfo.displayName=${encodeURIComponent(`"${name}"`)}` : null;
  return (
    <div>
      <PageHeader eyebrow={<StatusBadge status={c.status} />} title="Video consultation" subtitle={`${dateTime(c.startAt)}${c.practitioner ? ` · with ${c.practitioner.firstName} ${c.practitioner.lastName}` : ''}`}
        actions={<Link href="/portal/bookings" className="btn"><ArrowLeft />Bookings</Link>} />
      {c.ended ? <Card><div className="py-6 text-center"><b className="block text-lg">This video visit has ended</b><p className="m-0 mt-1 text-sm text-slate-500">Any prescriptions from it are under Medicines.</p><Link href="/portal/medicines" className="btn mt-3">Open medicines</Link></div></Card>
      : room && !c.embed ? <Card><div className="py-6 text-center"><Video className="mx-auto h-10 w-10 text-brand" /><b className="mt-2 block text-lg">Your doctor's room is open</b><p className="m-0 mt-1 text-sm text-slate-500">The call opens in a new tab. Allow the camera and microphone when asked.</p><a href={room} target="_blank" rel="noreferrer" className="btn primary lg mt-4"><Video />Join the video call</a></div></Card>
      : room ? (
        <div className="card overflow-hidden !p-0">
          <iframe title="Video consultation" src={room} allow="camera; microphone; fullscreen; display-capture; autoplay" className="block h-[min(72vh,680px)] w-full border-0 bg-black" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="1. Pay the consultation fee" subtitle="The video room opens once the fee is paid.">
            {!c.prepared ? <button className="btn primary" disabled={prepare.isPending} onClick={() => prepare.mutate({}, { onSuccess: () => refetch() })}>{prepare.isPending ? <Spinner /> : <Smartphone />}Get the amount to pay</button>
              : c.paid ? <div className="alert ok m-0">Paid. Thank you.</div>
              : <div className="space-y-3"><b className="block text-2xl font-extrabold">{money(due, c.payment?.currency)}</b>
                <button className="btn mpesa" onClick={() => setPay(true)}><Smartphone />Pay with M-Pesa</button></div>}
          </Card>
          <Card title="2. Join the call" subtitle="Use a phone or computer with a camera, in a quiet place with good signal.">
            {c.open ? <p className="m-0 text-sm text-slate-500">{c.paid ? 'Loading the room…' : 'Pay first, then the room appears here.'}</p>
              : <p className="m-0 flex items-center gap-2 text-sm text-slate-500"><Clock className="h-4 w-4" />The room opens 15 minutes before {dateTime(c.startAt)}. Come back then.</p>}
            <p className="m-0 mt-3 flex items-center gap-2 text-xs text-slate-500"><Video className="h-3.5 w-3.5" />Allow the browser to use your camera and microphone when asked.</p>
          </Card>
        </div>
      )}
      {pay && c.payment?.billId && <PayDialog bill={{ id: c.payment.billId, billNumber: 'consultation', currency: c.payment.currency, patientAmountMinor: due, paidMinor: 0 }} onClose={() => setPay(false)} onPaid={() => refetch()} />}
    </div>
  );
}
