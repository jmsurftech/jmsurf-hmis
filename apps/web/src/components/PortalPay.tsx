'use client';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Smartphone, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, Modal, Spinner } from './ui';
import { money } from '@/lib/format';
import { portal } from '@/lib/portal';

/** Patient portal M-Pesa prompt for one bill, with status polling. */
export function PayDialog({ bill, onClose, onPaid }: { bill: any; onClose: () => void; onPaid?: () => void }) {
  const qc = useQueryClient(); const due = Math.max(bill.patientAmountMinor - bill.paidMinor, 0);
  const [phone, setPhone] = useState(''); const [state, setState] = useState<'idle' | 'sending' | 'PENDING' | 'DONE' | 'FAILED'>('idle'); const [id, setId] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => {
    if (state !== 'PENDING') return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try {
        const r = await portal.get(`/payments/${id}`);
        if (r.status === 'COMPLETED') { setState('DONE'); setMsg(r.reference ? `M-Pesa ref ${r.reference}` : ''); clearInterval(t); qc.invalidateQueries({ queryKey: ['portal'] }); onPaid?.(); }
        else if (r.status === 'FAILED') { setState('FAILED'); setMsg(r.providerData?.failure ?? 'The payment was cancelled or failed.'); clearInterval(t); }
      } catch { /* keep polling */ }
      if (n > 40) { setState('FAILED'); setMsg('We did not hear back from M-Pesa. If you paid, it will show here shortly.'); clearInterval(t); }
    }, 3000);
    return () => clearInterval(t);
  }, [state, id, qc]);
  const send = async () => {
    setState('sending'); setMsg('');
    try { const r = await portal.post(`/bills/${bill.id}/stk`, { phone }); setId(r.id); setState('PENDING'); } catch (e) { setState('FAILED'); setMsg((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Pay bill ${bill.billNumber}`} subtitle={`Amount due ${money(due, bill.currency)}`}>
      {state === 'DONE' ? <div className="py-4 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><b className="mt-2 block text-lg">Payment received</b><p className="text-sm text-slate-500">{msg}</p><button className="btn primary" onClick={onClose}>Done</button></div> :
        <div className="space-y-4">
          <Field label="M-Pesa number" hint="You will get a prompt on this phone. Enter your M-Pesa PIN to pay."><input className="input" inputMode="tel" placeholder="Enter your M-Pesa number" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <button className="btn mpesa lg w-full" disabled={phone.replace(/\D/g, '').length < 9 || state === 'sending' || state === 'PENDING' || due < 100} onClick={send}>{state === 'sending' || state === 'PENDING' ? <Spinner /> : <Smartphone />}Pay {money(due, bill.currency)} with M-Pesa</button>
          {state === 'PENDING' && <p className="m-0 text-center text-sm text-slate-500">Check your phone and enter your M-Pesa PIN…</p>}
          {state === 'FAILED' && <p className="m-0 flex items-center justify-center gap-2 text-sm text-red-600"><XCircle className="h-4 w-4" />{msg}</p>}
        </div>}
    </Modal>
  );
}

