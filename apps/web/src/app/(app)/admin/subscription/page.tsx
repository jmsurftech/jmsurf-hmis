'use client';
import { CheckCircle2, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Table } from '@/components/DataTable';
import { Card, ErrorNote, Field, KV, Loading, Modal, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/ui';
import { STATUS_TONE } from '@/components/Security';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/lib/hooks';
import { date, money } from '@/lib/format';

function PayDialog({ inv, onClose, onPaid }: { inv: any; onClose: () => void; onPaid: () => void }) {
  const { user } = useAuth() as any;
  const [phone, setPhone] = useState(user?.phone ?? ''); const [state, setState] = useState<'idle' | 'sending' | 'PENDING' | 'PAID' | 'FAILED'>('idle'); const [msg, setMsg] = useState('');
  useEffect(() => {
    if (state !== 'PENDING') return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try {
        const r = await api.get<any>(`/subscription/invoices/${inv.id}`);
        if (r.status === 'PAID') { setState('PAID'); clearInterval(t); onPaid(); }
        else if (r.status === 'UNPAID') { setState('FAILED'); setMsg('Payment was cancelled or failed'); clearInterval(t); }
      } catch { /* keep polling */ }
      if (n > 40) { setState('FAILED'); setMsg('Timed out waiting for M-Pesa confirmation'); clearInterval(t); }
    }, 3000);
    return () => clearInterval(t);
  }, [state]); // eslint-disable-line
  const send = async () => {
    setState('sending'); setMsg('');
    try { await api.post(`/subscription/invoices/${inv.id}/pay`, { phone }); setState('PENDING'); } catch (e) { setState('FAILED'); setMsg((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Pay ${inv.number}`}>
      <div className="space-y-3">
        <p className="text-sm">Amount due: <strong>{money(inv.amountMinor)}</strong> ({inv.period})</p>
        <Field label="M-Pesa phone number"><input className="input" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <button className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700" disabled={!phone || state === 'sending' || state === 'PENDING' || state === 'PAID'} onClick={send}>
          {state === 'sending' || state === 'PENDING' ? <Spinner /> : <Smartphone className="h-4 w-4" />}Send M-Pesa STK push</button>
        {state === 'PENDING' && <p className="text-center text-sm text-slate-500">Enter your M-Pesa PIN on your phone…</p>}
        {state === 'PAID' && <p className="flex items-center justify-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Payment received. Thank you.</p>}
        {state === 'FAILED' && <p className="text-center text-sm text-red-600">{msg}</p>}
      </div>
    </Modal>
  );
}

export default function SubscriptionPage() {
  const { data: s, isLoading, error, refetch } = useGet<any>('/subscription');
  const { reload } = useAuth(); const [pay, setPay] = useState<any>(null);
  if (isLoading) return <Loading />;
  if (error || !s) return <ErrorNote error={error} />;
  return (
    <div>
      <PageHeader title="Subscription" subtitle={`${s.name} · ${s.plan} plan`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Status" value={<StatusBadge status={s.subscriptionStatus} tone={STATUS_TONE[s.subscriptionStatus]} />} hint={s.subscriptionStatus === 'TRIAL' ? `Trial ends ${date(s.trialEndsAt)}` : undefined} />
        <StatCard label="Outstanding" value={money(s.outstandingMinor)} tone={s.outstandingMinor ? 'red' : 'green'} />
        <StatCard label="Visits this month" value={s.visitsThisMonth} tone="blue" />
        <StatCard label="Estimated this month" value={money(s.estimate.amountMinor)} hint={`${money(s.estimate.baseMinor)} + ${s.estimate.visits} × ${money(s.estimate.perVisitMinor)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Invoices" className="lg:col-span-2">
          <Table rows={s.invoices} empty="No invoices yet" columns={[
            { key: 'number', header: 'Invoice' }, { key: 'period', header: 'Period' }, { key: 'visits', header: 'Visits' },
            { key: 'amountMinor', header: 'Amount', render: (i: any) => money(i.amountMinor) }, { key: 'dueDate', header: 'Due', render: (i: any) => date(i.dueDate) },
            { key: 'status', header: 'Status', render: (i: any) => <StatusBadge status={i.status} tone={i.status === 'PAID' ? 'green' : 'amber'} /> },
            { key: 'p', header: '', render: (i: any) => i.status !== 'PAID' && i.status !== 'VOID' && <button className="btn-primary py-1 text-xs" onClick={() => setPay(i)}>Pay with M-Pesa</button> },
          ]} />
        </Card>
        <Card title="Plans">
          <KV items={[['Clinic', `${money(s.pricing.plans.CLINIC)}/mo`], ['Hospital', `${money(s.pricing.plans.HOSPITAL)}/mo`], ['Enterprise', 'Custom'], ['Per visit', money(s.pricing.perVisitMinor)]]} />
          <p className="mt-3 text-xs text-slate-500">To change your plan, contact support@jmsurf.health. The modules enabled on your plan: {s.enabledModules.join(', ')}.</p>
        </Card>
      </div>
      {pay && <PayDialog inv={pay} onClose={() => setPay(null)} onPaid={() => { refetch(); reload(); }} />}
    </div>
  );
}
