'use client';
import { CheckCircle2, Smartphone, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Field, Spinner } from './ui';

type Status = 'idle' | 'sending' | 'PENDING' | 'SUCCESS' | 'FAILED';
/** M-Pesa STK push with status polling. POST /payments/mpesa/stk → Payment (PENDING); GET /payments/{id} → { status, reference }. */
export function MpesaStk({ amountMinor, initPath = '/payments/mpesa/stk', body, defaultPhone, onSuccess }: { amountMinor: number; initPath?: string; body: Record<string, unknown>; defaultPhone?: string | null; onSuccess?: (r: any) => void }) {
  const [phone, setPhone] = useState(defaultPhone ?? ''); const [status, setStatus] = useState<Status>('idle'); const [id, setId] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => {
    if (status !== 'PENDING' || !id) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try {
        const r = await api.get<{ status: string; reference?: string; receiptNumber?: string; providerData?: any }>(`/payments/${id}`);
        if (r.status === 'SUCCESS' || r.status === 'COMPLETED') { setStatus('SUCCESS'); setMsg(r.reference ? `M-Pesa ref ${r.reference}` : ''); clearInterval(t); onSuccess?.(r); }
        else if (r.status === 'FAILED' || r.status === 'CANCELLED') { setStatus('FAILED'); setMsg(r.providerData?.failure ?? 'Payment failed or cancelled'); clearInterval(t); }
      } catch { /* keep polling */ }
      if (n > 40) { setStatus('FAILED'); setMsg('Timed out waiting for confirmation'); clearInterval(t); }
    }, 3000);
    return () => clearInterval(t);
  }, [status, id]); // eslint-disable-line
  const send = async () => {
    setStatus('sending'); setMsg('');
    try { const r = await api.post<{ id: string }>(initPath, { ...body, phone, amountMinor: amountMinor >= 100 ? amountMinor : undefined }); setId(r.id); setStatus('PENDING'); }
    catch (e) { setStatus('FAILED'); setMsg((e as Error).message); }
  };
  return (
    <div className="space-y-3">
      <Field label="M-Pesa phone number"><input className="input" placeholder="2547XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <button className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700" disabled={!phone || status === 'sending' || status === 'PENDING' || amountMinor <= 0} onClick={send}>
        {status === 'sending' || status === 'PENDING' ? <Spinner /> : <Smartphone className="h-4 w-4" />}Send STK push for {money(amountMinor)}
      </button>
      {status === 'PENDING' && <p className="text-center text-sm text-slate-500">Waiting for the customer to enter their M-Pesa PIN…</p>}
      {status === 'SUCCESS' && <p className="flex items-center justify-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Payment received {msg}</p>}
      {status === 'FAILED' && <p className="flex items-center justify-center gap-2 text-sm text-red-600"><XCircle className="h-4 w-4" />{msg}</p>}
    </div>
  );
}
