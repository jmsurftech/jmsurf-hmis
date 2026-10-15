'use client';
import { Receipt, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { PayDialog } from '@/components/PortalPay';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { date, money } from '@/lib/format';
import { usePortal } from '@/lib/portal';

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
