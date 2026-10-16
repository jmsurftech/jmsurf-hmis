'use client';
import { AlertOctagon, Download, ShieldAlert, UserX } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { Field, Modal, Spinner } from './ui';
import { useToast } from './Toast';

/** Emergency access to restricted records: reason required, time-limited, audited and reviewed by an admin. */
export function BreakGlassDialog({ open, onClose, patientId, onGranted }: { open: boolean; onClose: () => void; patientId?: string; onGranted?: () => void }) {
  const [reason, setReason] = useState(''); const [minutes, setMinutes] = useState(60);
  const act = useAction('post', '/security/break-glass', { success: 'Emergency access granted. This access is logged and will be reviewed.', invalidate: ['/emr', '/visits', '/security'], onSuccess: () => { setReason(''); onClose(); onGranted?.(); } });
  return (
    <Modal open={open} onClose={onClose} title="Break-glass emergency access"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary bg-red-600 hover:bg-red-700" disabled={reason.trim().length < 15 || act.isPending} onClick={() => act.mutate({ reason, patientId, minutes })}>{act.isPending && <Spinner />}Grant access</button></>}>
      <div className="space-y-3 text-sm">
        <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"><AlertOctagon className="h-5 w-5 shrink-0" />Use only in a genuine clinical emergency. Your name, the reason and every record you open are logged, and an administrator reviews them.</p>
        <Field label="Clinical reason (at least 15 characters)"><textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unconscious patient in A&E, need HIV/psychiatric history for treatment" /></Field>
        <Field label="Duration"><select className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[15, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></Field>
      </div>
    </Modal>
  );
}

export function BreakGlassButton({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  return <><button className="btn-secondary text-red-700 dark:text-red-400" onClick={() => setOpen(true)}><ShieldAlert className="h-4 w-4" />Emergency access</button><BreakGlassDialog open={open} onClose={() => setOpen(false)} patientId={patientId} /></>;
}

/** Data-subject request tools (admin): export full record as FHIR-style JSON; anonymise. */
export function PatientPrivacyActions({ patientId, mrn }: { patientId: string; mrn: string }) {
  const { hasRole } = useAuth(); const toast = useToast();
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  const anon = useAction('post', `/privacy/patients/${patientId}/anonymise`, { success: 'Patient anonymised', invalidate: ['/patients'], onSuccess: () => setOpen(false) });
  if (!hasRole()) return null;
  const exportJson = async () => {
    setBusy(true);
    try {
      const b = await api.get(`/privacy/patients/${patientId}/export`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/fhir+json' }));
      a.download = `patient-${mrn}-export.json`; a.click();
    } catch (e) { toast.push((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <button className="btn-secondary" onClick={exportJson} disabled={busy}>{busy ? <Spinner /> : <Download className="h-4 w-4" />}Export record</button>
      <button className="btn-secondary text-red-700 dark:text-red-400" onClick={() => setOpen(true)}><UserX className="h-4 w-4" />Anonymise</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Anonymise patient (data-subject erasure)"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" disabled={confirm !== 'ANONYMISE' || reason.length < 10 || anon.isPending} onClick={() => anon.mutate({ reason, confirm })}>{anon.isPending && <Spinner />}Anonymise permanently</button></>}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-400">This removes names, IDs, contacts, the photo and next of kin, and reduces the date of birth to the year. Clinical and financial records are kept without identifiers for the statutory retention period. You cannot undo this. It is refused while the record is under a legal hold or has an open visit.</p>
          <Field label="Reason / DSR reference"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label='Type "ANONYMISE" to confirm'><input className="input font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}
