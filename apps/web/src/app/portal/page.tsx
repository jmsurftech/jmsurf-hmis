'use client';
import { CalendarPlus, FlaskConical, Pill as PillIcon, Receipt, ShieldCheck, Video } from 'lucide-react';
import Link from 'next/link';
import { kes, usePortal, when } from '@/lib/portal';
import { Box, Busy, Pill } from './parts';

export default function PortalHome() {
  const appts = usePortal<any[]>('/portal/appointments');
  const bills = usePortal<any>('/portal/bills');
  const results = usePortal<any>('/portal/results');
  const next = (appts.data ?? []).filter((a) => ['BOOKED', 'CONFIRMED', 'ARRIVED'].includes(a.status) && new Date(a.endAt) > new Date()).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))[0];
  const tiles = [
    { href: '/portal/appointments?book=1', label: 'Book', icon: CalendarPlus },
    { href: '/portal/results', label: 'Results', icon: FlaskConical },
    { href: '/portal/prescriptions', label: 'Medicines', icon: PillIcon },
    { href: '/portal/bills', label: 'Pay bill', icon: Receipt },
    { href: '/portal/sha', label: 'SHA status', icon: ShieldCheck },
  ];
  return (
    <div>
      <Box title="Next appointment">
        {appts.isLoading ? <Busy /> : next ? (
          <Link href="/portal/appointments" className="block">
            <p className="text-lg font-semibold">{when(next.startAt)}</p>
            <p className="text-sm text-slate-500">{next.practitioner?.name ?? 'Clinic'} · {next.reason ?? ''}</p>
            {next.mode === 'TELEMEDICINE' && <p className="mt-2 inline-flex items-center gap-1 text-sm text-primary-700"><Video className="h-4 w-4" />Video consultation: tap to join</p>}
          </Link>) : <p className="text-sm text-slate-500">No upcoming appointments. <Link className="text-primary-600 underline" href="/portal/appointments?book=1">Book one</Link></p>}
      </Box>
      <div className="mb-3 grid grid-cols-5 gap-2">{tiles.map((t) => (
        <Link key={t.href} href={t.href} className="flex flex-col items-center gap-1 rounded-xl bg-white p-2 text-center text-[11px] shadow-sm dark:bg-slate-900"><t.icon className="h-5 w-5 text-primary-600" />{t.label}</Link>))}</div>
      <Box title="Balance due" action={<Link href="/portal/bills" className="text-xs text-primary-600">View</Link>}>
        {bills.isLoading ? <Busy /> : <p className="text-2xl font-semibold">{kes(bills.data?.totalBalanceMinor)}</p>}
      </Box>
      <Box title="Latest results" action={<Link href="/portal/results" className="text-xs text-primary-600">All</Link>}>
        {results.isLoading ? <Busy /> : (results.data?.lab ?? []).slice(0, 3).map((r: any) => (
          <div key={r.orderId} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
            <span>{r.test}</span>{r.results.some((x: any) => x.flag && x.flag !== 'N') ? <Pill tone="amber">Review</Pill> : <Pill tone="green">Normal</Pill>}
          </div>))}
        {!results.isLoading && !(results.data?.lab ?? []).length && <p className="text-sm text-slate-500">No results yet.</p>}
      </Box>
    </div>
  );
}
