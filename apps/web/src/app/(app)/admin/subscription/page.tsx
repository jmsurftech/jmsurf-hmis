'use client';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, CheckCircle2, CreditCard, Receipt, ShieldAlert, Smartphone, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Table } from '@/components/DataTable';
import { MedicalFloat } from '@/components/MedicalArt';
import { Card, EmptyState, ErrorNote, Field, Loading, PageHeader, Seg, Spinner, StatusBadge, humanize } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { useGet, useList } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const MONTHS = [1, 3, 6, 12] as const;
const PLAN_TEXT: Record<string, string> = { CLINIC: 'Outpatient clinics and medical centres, up to 10 staff users', HOSPITAL: 'Inpatient care, theatre, maternity, inventory, finance and HR' };

export default function Subscription() {
  const { hasRole } = useAuth(); const qc = useQueryClient();
  const { data: s, isLoading, error } = useGet<any>('/subscription');
  const inv = useList<any>('/subscription/invoices');
  const [plan, setPlan] = useState<'CLINIC' | 'HOSPITAL'>('HOSPITAL'); const [months, setMonths] = useState<number>(1);
  const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null); const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { if (s?.plan === 'CLINIC' || s?.plan === 'HOSPITAL') setPlan(s.plan); }, [s?.plan]);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const r = await api.get<any>(`/subscription/invoices/${pending}`).catch(() => null);
      if (!r) return;
      if (r.status === 'PAID') { setMsg({ tone: 'ok', text: `Payment received (${r.reference}). Thank you.` }); setPending(null); qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/subscription') }); }
      else if (r.status === 'OPEN') { setMsg({ tone: 'bad', text: r.failure ?? 'The payment did not go through.' }); setPending(null); }
    }, 4000);
    return () => clearInterval(t);
  }, [pending, qc]);
  if (isLoading) return <Loading />;
  if (error || !s) return <ErrorNote error={error ?? new Error('Could not load the subscription')} />;
  const perVisit = s.billingModel === 'PER_VISIT';
  const open = s.openInvoices?.[0];
  const price = (p: string, m: number) => { const monthly = s.prices[p]; const off = Number(s.prices.discounts?.[m] ?? 0); return Math.round((monthly * m * (100 - off)) / 10000) * 100; };
  const due = perVisit ? open?.amountMinor ?? 0 : open?.kind === 'USAGE' ? open.amountMinor : price(plan, months);
  const canPay = hasRole('ADMIN', 'ACCOUNTANT') && !s.managed && (perVisit ? !!open : true);
  const pay = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.post<any>('/subscription/pay', { phone, ...(perVisit ? {} : { plan, months }) }); setPending(r.id); setMsg({ tone: 'info', text: 'Check the phone and enter the M-Pesa PIN…' }); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(false); }
  };
  const ends = s.paidUntil && new Date(s.paidUntil) > new Date() ? s.paidUntil : s.trialEndsAt;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Subscription" subtitle="Your JMSURF HMIS plan, invoices and payments. Prices are in Kenya shillings and exclude VAT." />
      <div className="hero-card">
        <MedicalFloat tone="light" count={5} />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="chipw">{perVisit ? 'Pay per visit' : `${humanize(s.plan)} plan`}</span>
            <h2 className="m-0 mt-3 text-[clamp(1.5rem,2.6vw,2.2rem)] font-extrabold tracking-tight">
              {s.status === 'TRIAL' ? `Free trial: ${Math.max(s.daysLeft ?? 0, 0)} days left` : s.status === 'ACTIVE' ? (perVisit ? 'Active' : `Paid up to ${date(s.paidUntil)}`) : s.status === 'GRACE' ? 'Payment due' : s.status === 'READ_ONLY' ? 'Read-only until paid' : humanize(s.status)}
            </h2>
            <p className="muted m-0 mt-1">{s.status === 'GRACE' && s.readOnlyAt ? `Everything keeps working until ${date(s.readOnlyAt)}. After that the system becomes read-only.` : s.status === 'READ_ONLY' ? 'Your team can view records but cannot save anything new. Paying restores access at once.' : ends ? `Current period ends ${date(ends)}.` : perVisit ? `KES ${s.prices.PER_VISIT / 100} per patient visit, invoiced monthly.` : ''}</p>
          </div>
          <StatusBadge status={s.status === 'GRACE' ? 'DUE' : s.status} />
        </div>
      </div>
      {s.managed && <div className="alert info"><ShieldAlert />Your billing is handled directly by JMSURF. Contact support for invoices.</div>}
      {!s.payConfigured && !s.managed && <div className="alert warn"><ShieldAlert />Online M-Pesa payment is not switched on yet. Pay by bank transfer and send the slip to JMSURF support; it will be recorded here.</div>}

      {!s.managed && <div className="grid gap-4 lg:grid-cols-3">
        {!perVisit ? <Card title="Choose your plan and period" subtitle="Longer periods cost less" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">{(['CLINIC', 'HOSPITAL'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPlan(p)} className={cn('card card-body text-left transition', plan === p ? 'ring-2 ring-brand' : 'opacity-80 hover:opacity-100')}>
              <span className="flex items-center justify-between"><b className="text-lg">{humanize(p)}</b>{plan === p && <Check className="h-5 w-5 text-brand" />}</span>
              <span className="mt-1 block text-sm text-slate-500">{PLAN_TEXT[p]}</span>
              <span className="mt-3 block text-2xl font-extrabold">{money(s.prices[p])}<small className="text-sm font-semibold text-slate-500"> / month</small></span>
            </button>))}</div>
          <div className="mt-4"><Seg options={MONTHS.map((m) => ({ id: String(m), label: `${m} month${m > 1 ? 's' : ''}${Number(s.prices.discounts?.[m] ?? 0) ? ` · ${s.prices.discounts[m]}% off` : ''}` }))} value={String(months)} onChange={(v) => setMonths(Number(v))} /></div>
        </Card> : <Card title="Pay per visit" subtitle={`KES ${s.prices.PER_VISIT / 100} per patient visit, no monthly minimum`} className="lg:col-span-2">
          <p className="m-0 text-sm text-slate-600 dark:text-slate-300">On the 1st of each month you get an invoice for last month&apos;s visits. Pay within 7 days to avoid interruption.</p>
        </Card>}
        <Card title="Pay with M-Pesa">
          <div className="mb-4"><small className="block text-slate-500">Amount</small><b className="text-3xl font-extrabold">{money(due)}</b>{!perVisit && <small className="block text-slate-500">{humanize(plan)} · {months} month{months > 1 ? 's' : ''}</small>}</div>
          {canPay && s.payConfigured ? <div className="space-y-3">
            <Field label="M-Pesa number"><input className="input" inputMode="tel" placeholder="Enter the M-Pesa number" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <button className="btn mpesa lg w-full" disabled={busy || !!pending || phone.replace(/\D/g, '').length < 9 || due < 100} onClick={pay}>{busy || pending ? <Spinner /> : <Smartphone />}Pay {money(due)}</button>
          </div> : <p className="m-0 text-sm text-slate-500">{perVisit && !open ? 'Nothing to pay right now.' : 'Only an administrator or accountant can pay.'}</p>}
          {msg && <div className={`alert ${msg.tone} mt-3`}>{msg.tone === 'ok' ? <CheckCircle2 /> : msg.tone === 'bad' ? <XCircle /> : <Smartphone />}{msg.text}</div>}
        </Card>
      </div>}

      <Card title="Invoices" subtitle="From JMSURF TECHNOLOGIES" flush>
        <Table rows={inv.data?.data ?? []} empty={<EmptyState icon={Receipt} title="No invoices yet" message="Your first invoice is created a week before the trial ends." />} columns={[
          { key: 'number', header: 'Invoice', render: (r: any) => <b>{r.number}</b> },
          { key: 'kind', header: 'For', render: (r: any) => r.kind === 'USAGE' ? `${r.visits} visits` : `${humanize(r.plan)} · ${r.months} month${r.months > 1 ? 's' : ''}` },
          { key: 'period', header: 'Period', render: (r: any) => `${date(r.periodStart)} – ${date(r.periodEnd)}` },
          { key: 'dueAt', header: 'Due', render: (r: any) => <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-slate-400" />{date(r.dueAt)}</span> },
          { key: 'amountMinor', header: 'Amount', className: 'text-right', render: (r: any) => money(r.amountMinor, r.currency) },
          { key: 'status', header: 'Status', render: (r: any) => <span className="flex flex-col"><StatusBadge status={r.status} />{r.reference && <small className="text-slate-500">{r.method} {r.reference}</small>}</span> },
        ]} />
      </Card>
      <p className="m-0 flex items-center gap-2 text-xs text-slate-500"><CreditCard className="h-3.5 w-3.5" />Bank transfer and card payments are recorded by JMSURF support on request.</p>
    </div>
  );
}
