'use client';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Pill, PhoneOff, Video } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { Avatar, Card, ErrorNote, KV, Loading, PageHeader, Spinner, StatusBadge, humanize } from '@/components/ui';
import { useConfirm } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { age, date, dateTime, fullName, money } from '@/lib/format';
import { useAction, useGet } from '@/lib/hooks';

/** Clinician side of a video consult: the room on the left, the patient's essentials on the right. */
export default function ConsultRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { user, hasRole } = useAuth(); const confirm = useConfirm();
  const { data: c, isLoading, error } = useGet<any>(`/telemedicine/${id}`);
  const start = useAction('post', `/telemedicine/${id}/start`, { invalidate: ['/telemedicine'], success: 'Consult started' });
  const end = useAction('post', `/telemedicine/${id}/end`, { invalidate: ['/telemedicine'], success: 'Consult finished' });
  if (isLoading) return <Loading />;
  if (error || !c) return <ErrorNote error={error ?? new Error('Consult not found')} />;
  const p = c.patient; const clinician = hasRole('DOCTOR', 'CLINICAL_OFFICER', 'NURSE');
  const started = !!c.visitId && !!c.meetingUrl; const due = c.payment?.dueMinor ?? 0;
  const me = user ? `${user.firstName} ${user.lastName}` : 'Clinician';
  const ended = ['DONE', 'CANCELLED', 'NO_SHOW'].includes(c.status);
  const room = started && !ended ? `${c.meetingUrl}#config.prejoinPageEnabled=false&userInfo.displayName=${encodeURIComponent(`"${me}"`)}` : null;
  return (
    <div>
      <PageHeader eyebrow={<StatusBadge status={c.status} />} title={<span className="flex items-center gap-3"><Avatar name={fullName(p)} size={44} />{fullName(p)}</span>}
        subtitle={`Video consult · ${dateTime(c.startAt)} · ${p?.mrn ?? ''} · ${humanize(p?.sex ?? 'UNKNOWN')} · ${age(p?.dateOfBirth)}`}
        actions={<><Link href="/telemedicine" className="btn"><ArrowLeft />All consults</Link>
          {c.visitId && <Link href={`/opd/${c.visitId}`} className="btn"><FileText />Notes and prescriptions</Link>}
          {clinician && started && c.status !== 'DONE' && <button className="btn danger" disabled={end.isPending} onClick={async () => { if (await confirm({ title: 'Finish this consult?', message: 'The booking is marked done. Notes and prescriptions stay on the visit.', confirm: 'Finish' })) end.mutate({}); }}><PhoneOff />Finish</button>}</>} />
      {p?.allergies?.length > 0 && <div className="alert bad mb-4"><AlertTriangle /><span><b>Allergies:</b> {p.allergies.map((a: any) => a.substance).join(', ')}</span></div>}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-hidden !p-0">
          {ended ? <div className="grid h-[min(50vh,420px)] place-items-center p-6 text-center"><div><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><b className="mt-2 block text-lg">This consult is {c.status === 'DONE' ? 'finished' : humanize(c.status).toLowerCase()}</b>{c.visitId && <Link href={`/opd/${c.visitId}`} className="btn mt-3"><FileText />Open the visit</Link>}</div></div>
            : room && !c.embed ? <div className="grid h-[min(50vh,420px)] place-items-center p-6 text-center"><div className="max-w-sm"><span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-brand/10 text-brand"><Video className="h-8 w-8" /></span><b className="block text-lg">The room is open</b><p className="text-sm text-slate-500">The call opens in a new tab. Keep this page open for the patient's details, notes and prescriptions.</p><a href={room} target="_blank" rel="noreferrer" className="btn primary lg"><Video />Join the video call</a></div></div>
            : room ? <iframe title="Video consultation" src={room} allow="camera; microphone; fullscreen; display-capture; autoplay" className="block h-[min(72vh,700px)] w-full border-0 bg-black" />
            : <div className="grid h-[min(60vh,520px)] place-items-center p-6 text-center">
              <div className="max-w-sm"><span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-brand/10 text-brand"><Video className="h-8 w-8" /></span>
                <b className="block text-lg">The room is ready when you are</b>
                <p className="text-sm text-slate-500">Starting opens the visit (so you can write notes and e-prescriptions) and the video room. The patient joins from the patient portal once the fee is paid.</p>
                {clinician ? <button className="btn primary lg" disabled={start.isPending} onClick={() => start.mutate({})}>{start.isPending ? <Spinner /> : <Video />}Start consult</button> : <p className="text-sm text-slate-500">A clinician starts the consult.</p>}
              </div></div>}
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Payment">{!c.visitId ? <p className="m-0 text-sm text-slate-500">Not started. The patient pays in the portal, or the fee is billed when you start.</p>
            : due > 0 ? <div className="alert warn m-0">{money(due)} not yet paid. The patient sees a pay button in the portal.</div> : <div className="alert ok m-0"><CheckCircle2 />Paid or covered</div>}</Card>
          <Card title="Patient"><KV items={[['Phone', p?.phone], ['Blood group', p?.bloodGroup], ['Cover', p?.covers?.map((x: any) => x.scheme?.name).join(', ') || 'Cash'], ['Reason', c.reason]]} /></Card>
          {c.visit?.prescriptions?.length > 0 && <Card title="Prescribed in this consult"><ul className="m-0 list-none space-y-1.5 p-0 text-sm">{c.visit.prescriptions.map((r: any) => <li key={r.id} className="flex items-center gap-2"><Pill className="h-4 w-4 text-brand" />{r.drugName} {r.dose} {r.frequency}</li>)}</ul></Card>}
          <Card title="Recent visits">{c.recentVisits?.length ? <ul className="m-0 list-none space-y-2 p-0 text-sm">{c.recentVisits.map((v: any) => <li key={v.id}><Link href={`/opd/${v.id}`} className="font-bold">{date(v.startedAt)} · {humanize(v.type)}</Link><small className="block text-slate-500">{v.diagnoses.map((d: any) => d.display).join(', ') || 'No diagnosis recorded'}</small></li>)}</ul> : <p className="m-0 text-sm text-slate-500">First visit.</p>}</Card>
        </div>
      </div>
    </div>
  );
}
