'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { FormDialog } from '@/components/FormDialog';
import { ScheduleGrid } from '@/components/ScheduleGrid';
import { PageHeader } from '@/components/ui';
import { fullName } from '@/lib/format';

export default function Theatre() {
  const [open, setOpen] = useState(false); const [def, setDef] = useState<Record<string, any>>({});
  return (
    <div>
      <PageHeader title="Theatre schedule" subtitle="Operating theatres, week view" actions={<button className="btn-primary" onClick={() => { setDef({}); setOpen(true); }}><Plus className="h-4 w-4" />Book surgery</button>} />
      <ScheduleGrid resourcesPath="/theatre/rooms" bookingsPath="/theatre/bookings" resourceKey="theatreId" onCellClick={(theatreId, d) => { setDef({ theatreId, scheduledAt: `${d}T08:00` }); setOpen(true); }}
        renderBooking={(b) => <><p className="font-semibold">{String(b.scheduledAt).slice(11, 16)} {b.procedureName ?? b.procedure}</p><p className="truncate">{fullName(b.patient)}</p><p className="opacity-70">{b.surgeon?.name ?? ''} · {b.status}</p></>} />
      <FormDialog open={open} onClose={() => setOpen(false)} title="Book surgery" path="/theatre/bookings" defaults={def} fields={[
        { name: 'patientId', label: 'Patient ID', required: true }, { name: 'theatreId', label: 'Theatre ID', required: true }, { name: 'scheduledAt', label: 'Start', type: 'datetime-local', required: true },
        { name: 'durationMinutes', label: 'Duration (min)', type: 'number' }, { name: 'procedureName', label: 'Procedure', required: true }, { name: 'surgeonId', label: 'Surgeon ID' }, { name: 'anaesthetistId', label: 'Anaesthetist ID' },
        { name: 'anaesthesia', label: 'Anaesthesia', type: 'select', options: ['GA', 'SPINAL', 'REGIONAL', 'LOCAL', 'SEDATION'] }, { name: 'urgency', label: 'Urgency', type: 'select', options: ['ELECTIVE', 'URGENT', 'EMERGENCY'] }, { name: 'notes', label: 'Notes', type: 'textarea' }]} />
    </div>
  );
}
