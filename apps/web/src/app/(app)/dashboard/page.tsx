'use client';
import { BedDouble, Banknote, FileCheck2, Users, Clock, FlaskConical } from 'lucide-react';
import { Bars, Donut } from '@/components/charts';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, StatCard } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';

interface Dashboard {
  visitsToday?: number; revenueTodayMinor?: number; revenueMonthMinor?: number;
  collectionsToday?: { totalMinor: number; byMethod: { method: string; amountMinor: number; count: number }[] };
  collectionsMonth?: { totalMinor: number; byMethod: { method: string; amountMinor: number; count: number }[] };
  claimsPending?: { count: number; valueMinor: number }; beds?: { total: number; occupied: number; occupancyPct: number };
  topDiagnoses?: { code: string; display: string; count: number }[]; labTurnaround?: { avgMinutes: number | null; orders: number }; lowStockCount?: number;
}
export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useGet<Dashboard>('/reports/dashboard');
  const d = data ?? {};
  const coll = (d.collectionsMonth?.byMethod ?? []).map((m) => ({ method: m.method, amount: m.amountMinor / 100, count: m.count }));
  const top = (d.topDiagnoses ?? []).map((t) => ({ name: t.display.length > 32 ? `${t.display.slice(0, 30)}…` : t.display, count: t.count }));
  return (
    <div>
      <PageHeader title={`Good day, ${user?.firstName ?? ''}`} subtitle="Today across your facility" />
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : <>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Visits today" value={d.visitsToday ?? 0} icon={Users} />
          <StatCard label="Revenue today" value={money(d.revenueTodayMinor ?? 0)} hint={`Month ${money(d.revenueMonthMinor ?? 0)}`} icon={Banknote} tone="green" />
          <StatCard label="Bed occupancy" value={`${d.beds?.occupancyPct ?? 0}%`} hint={`${d.beds?.occupied ?? 0}/${d.beds?.total ?? 0} beds`} icon={BedDouble} tone="blue" />
          <StatCard label="Claims pending" value={d.claimsPending?.count ?? 0} hint={money(d.claimsPending?.valueMinor ?? 0)} icon={FileCheck2} tone="amber" />
          <StatCard label="Lab turnaround" value={d.labTurnaround?.avgMinutes != null ? `${d.labTurnaround.avgMinutes} min` : '—'} hint={`${d.labTurnaround?.orders ?? 0} orders`} icon={Clock} tone="red" />
          <StatCard label="Low stock items" value={d.lowStockCount ?? 0} icon={FlaskConical} tone="blue" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Collections this month by method (KES)">{coll.length ? <Bars data={coll} x="method" bars={[{ key: 'amount', label: 'Amount' }]} /> : <EmptyState title="No collections yet" />}</Card>
          <Card title="Payment mix (count, this month)">{coll.length ? <Donut data={coll} nameKey="method" valueKey="count" /> : <EmptyState title="No data" />}</Card>
          <Card title="Top diagnoses" className="lg:col-span-2">{top.length ? <Bars data={top} x="name" bars={[{ key: 'count', label: 'Cases' }]} layout="vertical" /> : <EmptyState title="No data" />}</Card>
        </div>
      </>}
    </div>
  );
}
