'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { FormDialog } from '@/components/FormDialog';
import { ScheduleGrid } from '@/components/ScheduleGrid';
import { PageHeader } from '@/components/ui';
import { fullName } from '@/lib/format';

export default function Dialysis() {
  const [open, setOpen] = useState(false); const [def, setDef] = useState<Record<string, any>>({});
  return (
    <div>
      <PageHeader title="Dialysis" subtitle="Chair schedule & sessions" actions={<button className="btn-primary" onClick={() => { setDef({}); setOpen(true); }}><Plus className="h-4 w-4" />Schedule session</button>} />
      <ScheduleGrid resourcesPath="/dialysis/chairs" bookingsPath="/dialysis/sessions" resourceKey="chairId" onCellClick={(chairId, d) => { setDef({ chairId, scheduledAt: `${d}T07:00` }); setOpen(true); }}
        renderBooking={(b) => <><p className="font-semibold">{String(b.scheduledAt).slice(11, 16)} · {b.shift ?? ''}</p><p className="truncate">{fullName(b.patient)}</p><p className="opacity-70">{b.status}{b.ufGoalMl ? ` · UF ${b.ufGoalMl}ml` : ''}</p></>} />
      <FormDialog open={open} onClose={() => setOpen(false)} title="Schedule dialysis session" path="/dialysis/sessions" defaults={def} fields={[
        { name: 'patientId', label: 'Patient ID', required: true }, { name: 'chairId', label: 'Chair ID', required: true }, { name: 'scheduledAt', label: 'Start', type: 'datetime-local', required: true },
        { name: 'shift', label: 'Shift', type: 'select', options: ['MORNING', 'AFTERNOON', 'EVENING'] }, { name: 'durationMinutes', label: 'Duration (min)', type: 'number' }, { name: 'ufGoalMl', label: 'UF goal (ml)', type: 'number' },
        { name: 'dialyzer', label: 'Dialyzer' }, { name: 'recurring', label: 'Repeat weekly', type: 'checkbox' }]} />
    </div>
  );
}
