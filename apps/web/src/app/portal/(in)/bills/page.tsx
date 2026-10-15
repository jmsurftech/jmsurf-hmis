'use client';
import { CheckCircle2, Receipt, Smartphone, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { date, money } from '@/lib/format';
import { portal, usePortal } from '@/lib/portal';
import { useQueryClient } from '@tanstack/react-query';

function PayDialog({ bill, onClose }: { bill: any; onClose: () => void }) {
  const qc = useQueryClient(); const due = Math.max(bill.patientAmountMinor - bill.paidMinor, 0);
  const [phone, setPhone] = useState(''); const [state, setState] = useState<'idle' | 'sending' | 'PENDING' | 'DONE' | 'FAILED'>('idle'); const [id, setId] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => {
    if (state !== 'PENDING') return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try {
        const r = await portal.get(`/payments/${id}`);
        if (r.status === 'COMPLETED') { setState('DONE'); setMsg(r.reference ? `M-Pesa ref ${r.reference}` : ''); clearInterval(t); qc.invalidateQueries({ queryKey: ['portal'] }); }
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

export default function Bills() {
  const { data, isLoading, error } = usePortal<any[]>('/bills'); const [pay, setPay] = useState<any>(null);
  return (
    <div>
      <PageHeader title="Bills" subtitle="What you owe and what you have paid. Insurance and SHA portions are settled by the hospital." />
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={Receipt} title="No bills yet" /></Card> :
        <div className="grid gap-4">{data.map((b) => {
          const due = Math.max(b.patientAmountMinor - b.paidMinor, 0);
          return (
            <Card key={b.id} title={<span>Bill {b.billNumber}</span>} subtitle={`${date(b.createdAt)} · visit ${b.visit?.visitNumber ?? ''}`} actions={<StatusBadge status={b.status} />}>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                {[['Total', b.totalMinor], ['Paid', b.paidMinor], ['You owe', due]].map(([k, v]) => <div key={k as string} className="rounded-2xl border border-slate-200/70 p-3 dark:border-white/10"><b className={`block ${k === 'You owe' && due ? 'text-brand' : ''}`}>{money(v as number, b.currency)}</b><small className="text-slate-500">{k}</small></div>)}
              </div>
              <details><summary className="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">{b.lines.length} item{b.lines.length === 1 ? '' : 's'}{b.payments.length ? ` · ${b.payments.length} payment${b.payments.length === 1 ? '' : 's'}` : ''}</summary>
                <ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm">{b.lines.map((l: any) => <li key={l.id} className="flex justify-between gap-3"><span>{l.description}{l.quantity !== 1 ? ` × ${l.quantity}` : ''}{l.payer === 'SCHEME' && <span className="badge blue ml-2">Insurance</span>}</span><span>{money(l.totalMinor, b.currency)}</span></li>)}
                  {b.payments.map((p: any) => <li key={p.id} className="flex justify-between gap-3 text-emerald-700 dark:text-emerald-400"><span>Paid · {p.method} {p.reference ?? ''} · {date(p.createdAt)}</span><span>−{money(p.amountMinor, b.currency)}</span></li>)}</ul></details>
              {due >= 100 && <button className="btn mpesa mt-3 w-full sm:w-auto" onClick={() => setPay(b)}><Smartphone />Pay {money(due, b.currency)} with M-Pesa</button>}
            </Card>
          );
        })}</div>}
      {pay && <PayDialog bill={pay} onClose={() => setPay(null)} />}
    </div>
  );
}
