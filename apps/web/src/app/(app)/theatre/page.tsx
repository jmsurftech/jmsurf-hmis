'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { FormDialog } from '@/components/FormDialog';
import { ScheduleGrid } from '@/components/ScheduleGrid';
import { PageHeader } from '@/components/ui';

const THEATRES = ['Theatre 1', 'Theatre 2'];
const VISIT = { path: '/visits', query: { status: 'OPEN,IN_PROGRESS,ADMITTED' }, label: (v: any) => `${v.visitNumber} · ${v.patient?.firstName ?? ''} ${v.patient?.lastName ?? ''}`, sub: (v: any) => v.type };
const STAFF = { path: '/admin/practitioners', idOf: (p: any) => p.userId, label: (p: any) => `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`, sub: (p: any) => p.cadre };

export default function Theatre() {
  const [open, setOpen] = useState(false); const [def, setDef] = useState<Record<string, any>>({});
  return (
    <div>
      <PageHeader title="Theatre schedule" subtitle="Operating theatres, week view" actions={<button className="btn-primary" onClick={() => { setDef({ theatre: THEATRES[0], durationMinutes: 60 }); setOpen(true); }}><Plus className="h-4 w-4" />Book surgery</button>} />
      <ScheduleGrid resources={THEATRES} bookingsPath="/theatre/bookings" resourceKey="theatre" dateKey="scheduledStart" onCellClick={(theatre, d) => { setDef({ theatre, scheduledStart: `${d}T08:00`, durationMinutes: 60 }); setOpen(true); }}
        renderBooking={(b) => <><p className="font-semibold">{new Date(b.scheduledStart).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })} {b.procedure}</p><p className="opacity-70">{b.status}</p></>} />
      <FormDialog open={open} onClose={() => setOpen(false)} title="Book surgery" path="/theatre/bookings" defaults={def} success="Surgery booked"
        transform={({ durationMinutes, ...v }) => { const s = new Date(v.scheduledStart); return { ...v, scheduledStart: s.toISOString(), scheduledEnd: new Date(s.getTime() + (Number(durationMinutes) || 60) * 60000).toISOString() }; }} fields={[
        { name: 'visitId', label: 'Visit', type: 'picker', source: VISIT, required: true }, { name: 'theatre', label: 'Theatre', type: 'select', options: THEATRES, required: true }, { name: 'scheduledStart', label: 'Start', type: 'datetime-local', required: true },
        { name: 'durationMinutes', label: 'Duration (min)', type: 'number' }, { name: 'procedure', label: 'Procedure', required: true }, { name: 'surgeonId', label: 'Surgeon', type: 'picker', source: STAFF }, { name: 'anaesthetistId', label: 'Anaesthetist', type: 'picker', source: STAFF }]} />
    </div>
  );
}
