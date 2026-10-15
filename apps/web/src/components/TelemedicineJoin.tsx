'use client';
import { Plus, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useToast } from './Toast';
import { Modal } from './ui';

type Rx = { drugName: string; dose: string; frequency: string; durationDays?: number; quantity: number; instructions?: string };
const blank = (): Rx => ({ drugName: '', dose: '', frequency: '', durationDays: 5, quantity: 1 });

/** Doctor-side "Join video" for TELEMEDICINE appointments + e-prescription after the call. */
export function TelemedicineJoin({ appointmentId, compact }: { appointmentId: string; compact?: boolean }) {
  const toast = useToast();
  const [info, setInfo] = useState<{ url: string; visitId: string; paid: boolean; amountDueMinor: number } | null>(null);
  const [rxOpen, setRxOpen] = useState(false);
  const [items, setItems] = useState<Rx[]>([blank()]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>(`/telemedicine/${appointmentId}/join`);
      setInfo(r);
      window.open(r.url, '_blank', 'noopener');
      if (!r.paid) toast.push(`Patient has not paid yet (${money(r.amountDueMinor)} due); they can join once paid`, 'info');
    } catch (e: any) { toast.push(e.message, 'error'); } finally { setBusy(false); }
  };
  const submit = async () => {
    const valid = items.filter((i) => i.drugName && i.dose && i.frequency);
    setBusy(true);
    try {
      await api.post(`/telemedicine/${appointmentId}/prescriptions`, { items: valid.map((i) => ({ ...i, quantity: Number(i.quantity) || 1, durationDays: i.durationDays ? Number(i.durationDays) : undefined })), notes: notes || undefined });
      toast.push('E-prescription saved; consultation completed', 'success'); setRxOpen(false);
    } catch (e: any) { toast.push(e.message, 'error'); } finally { setBusy(false); }
  };
  const set = (i: number, k: keyof Rx, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <>
      <button className={compact ? 'btn-primary px-2 py-0.5 text-[10px]' : 'btn-primary'} disabled={busy} onClick={join}><Video className="h-3.5 w-3.5" />JOIN VIDEO</button>
      {info && <button className={compact ? 'btn-secondary px-2 py-0.5 text-[10px]' : 'btn-secondary'} onClick={() => setRxOpen(true)}>E-PRESCRIBE</button>}
      <Modal open={rxOpen} onClose={() => setRxOpen(false)} title="E-prescription (after call)" wide
        footer={<><button className="btn-secondary" onClick={() => setRxOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={submit}>Save & complete</button></>}>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <input className="input sm:col-span-2" placeholder="Drug" value={it.drugName} onChange={(e) => set(i, 'drugName', e.target.value)} />
              <input className="input" placeholder="Dose" value={it.dose} onChange={(e) => set(i, 'dose', e.target.value)} />
              <input className="input" placeholder="Frequency (e.g. BD)" value={it.frequency} onChange={(e) => set(i, 'frequency', e.target.value)} />
              <input className="input" type="number" placeholder="Days" value={it.durationDays ?? ''} onChange={(e) => set(i, 'durationDays', e.target.value)} />
              <div className="flex gap-1"><input className="input" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} />
                <button className="btn-secondary px-2" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button></div>
            </div>))}
          <button className="btn-secondary" onClick={() => setItems((xs) => [...xs, blank()])}><Plus className="h-4 w-4" />Add drug</button>
          <textarea className="input" rows={3} placeholder="Consultation summary / plan (shared with the patient)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
