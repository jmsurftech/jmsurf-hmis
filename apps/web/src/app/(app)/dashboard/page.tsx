'use client';
import {
  ArrowRight, Banknote, BedDouble, CalendarDays, ClipboardList, Clock, FileCheck2, FlaskConical, ListOrdered, Megaphone, Package, Pill, Receipt, Sparkles, Stethoscope, UserPlus, Users,
} from 'lucide-react';
import Link from 'next/link';
import { AreaTrend, Bars, Donut } from '@/components/charts';
import { Card, EmptyState, ErrorNote, humanize, StatCard } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { EcgLine, MedicalFloat, StethoscopeArt } from '@/components/MedicalArt';

interface Dashboard {
  showMoney?: boolean; visitsToday?: number; revenueTodayMinor?: number | null; revenueMonthMinor?: number | null;
  collectionsToday?: { totalMinor: number; byMethod: { method: string; amountMinor: number; count: number }[] } | null;
  collectionsMonth?: { totalMinor: number; byMethod: { method: string; amountMinor: number; count: number }[] } | null;
  claimsPending?: { count: number; valueMinor: number } | null; beds?: { total: number; occupied: number; occupancyPct: number };
  topDiagnoses?: { code: string; display: string; count: number }[]; labTurnaround?: { avgMinutes: number | null; orders: number }; lowStockCount?: number;
  trend?: { day: string; visits: number; collectedMinor: number }[]; payerMix?: { payerType: string; visits: number }[];
  queue?: { servicePoint: string; waiting: number; called: number; serving: number }[];
  appointmentsToday?: number; inpatients?: number; labPending?: number; prescriptionsPending?: number;
}

const QUICK = [
  { href: '/patients/new', label: 'Register patient', d: 'New file and open a visit', icon: UserPlus, roles: ['RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER'] },
  { href: '/queue', label: 'Call next', d: 'Live queue by service point', icon: Megaphone, roles: ['RECEPTION', 'NURSE', 'TRIAGE_NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'LAB_TECH', 'PHARMACIST', 'CASHIER'] },
  { href: '/opd', label: 'Consultations', d: 'Patients waiting for a clinician', icon: Stethoscope, roles: ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'] },
  { href: '/cashier', label: 'Take payment', d: 'Cash, M-Pesa, card or insurance', icon: Receipt, roles: ['CASHIER'] },
  { href: '/appointments', label: 'Appointments', d: 'Today and the week ahead', icon: CalendarDays, roles: ['RECEPTION', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE'] },
  { href: '/claims', label: 'Claims', d: 'Scrub, submit and follow up', icon: FileCheck2, roles: ['CLAIMS_OFFICER', 'ACCOUNTANT', 'MANAGER'] },
  { href: '/lab', label: 'Lab worklist', d: 'Collect, result and verify', icon: FlaskConical, roles: ['LAB_TECH'] },
  { href: '/pharmacy', label: 'Dispense', d: 'Prescriptions and counter sales', icon: Pill, roles: ['PHARMACIST'] },
  { href: '/inventory', label: 'Stock', d: 'Levels, batches and expiry', icon: Package, roles: ['STOREKEEPER', 'PHARMACIST', 'PROCUREMENT'] },
];
const SP_LABEL: Record<string, string> = { TRIAGE: 'Triage', CONSULTATION: 'Consultation', LAB: 'Laboratory', PHARMACY: 'Pharmacy', CASHIER: 'Cashier', RADIOLOGY: 'Radiology' };
const kes = (minor: number) => `KES ${(minor / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const { data, isLoading, error } = useGet<Dashboard>('/reports/dashboard');
  const d = data ?? {};
  const showMoney = !!d.showMoney;
  const trend = (d.trend ?? []).map((t) => ({ day: new Date(t.day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }), visits: t.visits, collected: Math.round(t.collectedMinor / 100) }));
  const coll = (d.collectionsMonth?.byMethod ?? []).map((m) => ({ method: humanize(m.method), amount: Math.round(m.amountMinor / 100), count: m.count }));
  const mix = (d.payerMix ?? []).map((p) => ({ name: humanize(p.payerType), visits: p.visits }));
  const top = (d.topDiagnoses ?? []).slice(0, 8).map((t) => ({ name: t.display.length > 34 ? `${t.display.slice(0, 32)}…` : t.display, count: t.count }));
  const quick = QUICK.filter((q) => hasRole(...q.roles)).slice(0, 4);
  const welcome = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('welcome');

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote error={error} />
      <div className="hero-card">
        <span className="orb" style={{ width: 380, height: 380, background: '#ff9aa6', top: -150, right: -60 }} />
        <span className="orb" style={{ width: 240, height: 240, background: '#ffc2a8', bottom: -120, left: '30%' }} />
        <MedicalFloat tone="light" count={7} />
        <div className="pointer-events-none absolute bottom-3 right-6 hidden w-24 text-white/90 md:block lg:right-[38%]" style={{ transform: 'rotate(-10deg)' }}><StethoscopeArt /></div>
        <EcgLine tone="light" className="pointer-events-none absolute inset-x-0 bottom-0 opacity-70" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <span className="chipw"><span className="live-dot" />{new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <h1 className="m-0 mt-4 text-[clamp(1.6rem,2.6vw,2.3rem)] font-extrabold tracking-tight">{greeting()}, {user?.firstName}</h1>
            <p className="muted m-0 mt-1.5 text-[15px]">{welcome ? 'Your facility is ready. Start by adding your team, price lists and payers in Settings.' : `Here is ${user?.tenant?.name ?? 'your facility'} right now.`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {welcome && hasRole('ADMIN') ? <Link href="/admin" className="btn white"><Sparkles />Finish setup</Link> : null}
            {hasRole('RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER') && <Link href="/patients/new" className="btn white"><UserPlus />Register patient</Link>}
            <Link href="/queue" className="btn"><ListOrdered />Queue</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Visits today" value={(d.visitsToday ?? 0).toLocaleString()} hint={`${d.appointmentsToday ?? 0} appointments booked`} icon={Users} loading={isLoading} href="/opd" />
        {showMoney
          ? <StatCard label="Collected today" value={kes(d.collectionsToday?.totalMinor ?? 0)} hint={`Billed ${kes(d.revenueTodayMinor ?? 0)} today`} icon={Banknote} tone="green" loading={isLoading} href="/cashier" />
          : <StatCard label="In the queue" value={(d.queue ?? []).reduce((s, q) => s + q.waiting, 0)} hint="Waiting across service points" icon={ListOrdered} tone="green" loading={isLoading} href="/queue" />}
        <StatCard label="Bed occupancy" value={`${d.beds?.occupancyPct ?? 0}%`} hint={`${d.beds?.occupied ?? 0} of ${d.beds?.total ?? 0} beds · ${d.inpatients ?? 0} admitted`} icon={BedDouble} tone="blue" loading={isLoading} href="/ipd" />
        {showMoney
          ? <StatCard label="Claims pending" value={(d.claimsPending?.count ?? 0).toLocaleString()} hint={`${kes(d.claimsPending?.valueMinor ?? 0)} awaiting payment`} icon={FileCheck2} tone="amber" loading={isLoading} href="/claims" />
          : <StatCard label="Lab pending" value={d.labPending ?? 0} hint="Orders not yet verified" icon={FlaskConical} tone="amber" loading={isLoading} href="/lab" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card title={showMoney ? 'Visits and collections' : 'Visits'} subtitle="Last 14 days">
          {isLoading ? <div className="skeleton h-[260px]" /> : trend.some((t) => t.visits || t.collected)
            ? <AreaTrend data={trend} x="day" areas={showMoney ? [{ key: 'visits', label: 'Visits' }] : [{ key: 'visits', label: 'Visits' }]} height={260} />
            : <EmptyState title="No visits in the last two weeks" message="Visits appear here as soon as patients are seen." />}
          {showMoney && trend.length > 0 && <div className="mt-4"><div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Collected per day (KES)</div><Bars data={trend} x="day" bars={[{ key: 'collected', label: 'Collected' }]} height={140} fmt={short} /></div>}
        </Card>
        <Card title="Live queue" subtitle="Patients waiting now" actions={<Link href="/queue" className="btn sm">Open<ArrowRight /></Link>}>
          {(d.queue ?? []).length === 0 ? <EmptyState icon={ListOrdered} title="No one is waiting" message="New visits join the triage queue automatically." /> : (
            <div className="flex flex-col">{(d.queue ?? []).map((q) => (
              <Link key={q.servicePoint} href={`/queue?sp=${q.servicePoint}`} className="list-row text-inherit no-underline">
                <span className="tile-ic grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-soft)] text-brand"><ListOrdered className="h-5 w-5" /></span>
                <span className="flex-1"><b className="block text-sm">{SP_LABEL[q.servicePoint] ?? humanize(q.servicePoint)}</b><small className="text-slate-500">{q.serving} being served · {q.called} called</small></span>
                <span className="text-2xl font-extrabold tracking-tight">{q.waiting}</span>
              </Link>
            ))}</div>
          )}
          <div className="divider" />
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Lab pending', d.labPending ?? 0, '/lab', FlaskConical], ['To dispense', d.prescriptionsPending ?? 0, '/pharmacy', Pill], ['Low stock', d.lowStockCount ?? 0, '/inventory', Package]].map(([l, v, h, I]: any) => (
              <Link key={l} href={h} className="rounded-2xl bg-white/60 p-3 text-inherit no-underline transition hover:bg-white dark:bg-slate-800/50 dark:hover:bg-slate-800"><I className="mx-auto h-5 w-5 text-brand" /><b className="mt-1 block text-xl">{v}</b><small className="text-[11.5px] text-slate-500">{l}</small></Link>
            ))}
          </div>
        </Card>
      </div>

      {quick.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quick.map((q) => <Link key={q.href} href={q.href} className="tile"><span className="ti"><q.icon /></span><span className="min-w-0"><b>{q.label}</b><small>{q.d}</small></span><ArrowRight className="ml-auto h-4 w-4 text-slate-400" /></Link>)}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Top diagnoses" subtitle="Last 30 days" actions={hasRole('MANAGER', 'DOCTOR') ? <Link href="/reports" className="btn sm">Reports<ArrowRight /></Link> : undefined}>
          {top.length ? <Bars data={top} x="name" bars={[{ key: 'count', label: 'Cases' }]} layout="vertical" height={Math.max(200, top.length * 38)} /> : <EmptyState icon={ClipboardList} title="No diagnoses yet" message="Coded diagnoses from consultations appear here." />}
        </Card>
        {showMoney ? (
          <Card title="Collections this month" subtitle={`Total ${money(d.collectionsMonth?.totalMinor ?? 0)}`}>
            {coll.length ? <Donut data={coll} nameKey="method" valueKey="amount" height={Math.max(220, top.length * 38)} fmt={(v) => `KES ${v.toLocaleString('en-KE')}`} /> : <EmptyState icon={Banknote} title="No payments yet this month" />}
          </Card>
        ) : (
          <Card title="Visits by payer" subtitle="This month">
            {mix.length ? <Donut data={mix} nameKey="name" valueKey="visits" height={240} /> : <EmptyState title="No visits yet this month" />}
          </Card>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Lab turnaround" value={d.labTurnaround?.avgMinutes != null ? `${d.labTurnaround.avgMinutes} min` : '—'} hint={`Average over ${d.labTurnaround?.orders ?? 0} orders, 30 days`} icon={Clock} tone="violet" loading={isLoading} />
        <StatCard label="Visits by payer" value={mix.length ? mix.sort((a, b) => b.visits - a.visits)[0].name : '—'} hint={mix.map((m) => `${m.name} ${m.visits}`).join(' · ') || 'This month'} icon={Users} tone="teal" loading={isLoading} />
        {showMoney
          ? <StatCard label="Billed this month" value={kes(d.revenueMonthMinor ?? 0)} hint={`Collected ${kes(d.collectionsMonth?.totalMinor ?? 0)}`} icon={Receipt} tone="green" loading={isLoading} href="/billing" />
          : <StatCard label="Low stock items" value={d.lowStockCount ?? 0} hint="At or below reorder level" icon={Package} tone="red" loading={isLoading} href="/inventory" />}
      </div>
    </div>
  );
}
