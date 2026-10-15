'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { FormDialog } from '@/components/FormDialog';
import { PatientName } from '@/components/PatientName';
import { ScheduleGrid } from '@/components/ScheduleGrid';
import { PageHeader } from '@/components/ui';
import { PICK } from '@/lib/pickers';

const CHAIRS = ['Chair 1', 'Chair 2', 'Chair 3', 'Chair 4'];
export default function Dialysis() {
  const [open, setOpen] = useState(false); const [def, setDef] = useState<Record<string, any>>({});
  return (
    <div>
      <PageHeader title="Dialysis" subtitle="Chair schedule & sessions" actions={<button className="btn-primary" onClick={() => { setDef({ chair: CHAIRS[0] }); setOpen(true); }}><Plus className="h-4 w-4" />Schedule session</button>} />
      <ScheduleGrid resources={CHAIRS} bookingsPath="/dialysis/sessions" resourceKey="chair" onCellClick={(chair, d) => { setDef({ chair, scheduledAt: `${d}T07:00` }); setOpen(true); }}
        renderBooking={(b) => <><p className="font-semibold">{new Date(b.scheduledAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p><p className="truncate"><PatientName id={b.patientId} /></p><p className="opacity-70">{b.status}{b.ktv ? ` · Kt/V ${b.ktv}` : ''}</p></>} />
      <FormDialog open={open} onClose={() => setOpen(false)} title="Schedule dialysis session" path="/dialysis/sessions" defaults={def} success="Session scheduled"
        transform={(v) => ({ ...v, scheduledAt: new Date(v.scheduledAt).toISOString() })} fields={[
        { name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'chair', label: 'Chair', type: 'select', options: CHAIRS, required: true }, { name: 'scheduledAt', label: 'Start', type: 'datetime-local', required: true },
        { name: 'machine', label: 'Machine' }]} />
    </div>
  );
}
