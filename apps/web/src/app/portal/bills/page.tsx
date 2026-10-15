'use client';
import { useState } from 'react';
import { kes, portal, usePortal, when } from '@/lib/portal';
import { Box, Busy, Empty, Err, Pill } from '../parts';

function PayBox({ bill, onPaid }: { bill: any; onPaid: () => void }) {
  const [phone, setPhone] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await portal.post<any>(`/portal/bills/${bill.id}/pay`, phone ? { phone } : {});
      setMsg(r.message);
      for (let i = 0; i < 12; i++) {
        await new Promise((res) => setTimeout(res, 5000));
        const s = await portal.get<any>(`/portal/payments/${r.paymentId}`);
        if (s.status !== 'PENDING') { setMsg(s.status === 'COMPLETED' ? `Payment received. Receipt ${s.receiptNumber}` : 'Payment was not completed.'); onPaid(); break; }
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <input className="input" inputMode="tel" placeholder="M-Pesa number (default: your number)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button className="btn-primary w-full justify-center" disabled={busy} onClick={pay}>{busy ? 'Waiting for M-Pesa…' : `Pay ${kes(bill.balanceMinor)} with M-Pesa`}</button>
      {msg && <p className="text-xs text-primary-700">{msg}</p>}{err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export default function Bills() {
  const { data, isLoading, error, refetch } = usePortal<any>('/portal/bills');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <Box title="Total balance"><p className="text-3xl font-semibold">{kes(data?.totalBalanceMinor)}</p></Box>
      {isLoading ? <Busy /> : <Err error={error} />}
      {!isLoading && !(data?.data ?? []).length && <Box><Empty text="No bills" /></Box>}
      {(data?.data ?? []).map((b: any) => (
        <Box key={b.id} title={b.billNumber} action={<Pill tone={b.balanceMinor > 0 ? 'amber' : 'green'}>{b.balanceMinor > 0 ? 'Balance due' : 'Paid'}</Pill>}>
          <p className="text-xs text-slate-500">{when(b.createdAt)} · {b.visit?.type}</p>
          <ul className="mt-2 text-sm">{b.lines.slice(0, 6).map((l: any, i: number) => <li key={i} className="flex justify-between"><span className="truncate pr-2">{l.description}</span><span>{kes(l.totalMinor)}</span></li>)}</ul>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm dark:border-slate-800"><span>You pay</span><b>{kes(b.patientAmountMinor)}</b></div>
          <div className="flex justify-between text-sm"><span>Paid</span><span>{kes(b.paidMinor)}</span></div>
          {b.balanceMinor > 0 && (open === b.id ? <PayBox bill={b} onPaid={() => refetch()} /> : <button className="btn-primary mt-2 w-full justify-center" onClick={() => setOpen(b.id)}>Pay {kes(b.balanceMinor)}</button>)}
        </Box>))}
    </div>
  );
}
