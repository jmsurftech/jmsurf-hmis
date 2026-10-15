'use client';
import { BedDouble, Banknote, FileCheck2, Users, Clock, FlaskConical } from 'lucide-react';
import { Bars, Donut, LineTrend } from '@/components/charts';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, StatCard } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';

interface Dashboard {
  kpis?: { visitsToday?: number; newPatients?: number; revenueTodayMinor?: number; bedOccupancyPct?: number; claimsPending?: number; avgWaitMinutes?: number; pendingLabs?: number; firstPassAcceptancePct?: number };
  visitsTrend?: { date: string; visits: number; admissions?: number }[];
  revenueTrend?: { date: string; cashMinor: number; insuranceMinor: number }[];
  payerMix?: { payer: string; count: number }[];
  topDiagnoses?: { name: string; count: number }[];
}
export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useGet<Dashboard>('/reports/dashboard');
  const k = data?.kpis ?? {};
  const rev = (data?.revenueTrend ?? []).map((r) => ({ date: r.date, cash: r.cashMinor / 100, insurance: r.insuranceMinor / 100 }));
  return (
    <div>
      <PageHeader title={`Good day, ${user?.firstName ?? ''}`} subtitle="Today across your facility" />
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : <>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Visits today" value={k.visitsToday ?? 0} hint={`${k.newPatients ?? 0} new patients`} icon={Users} />
          <StatCard label="Revenue today" value={money(k.revenueTodayMinor ?? 0)} icon={Banknote} tone="green" />
          <StatCard label="Bed occupancy" value={`${k.bedOccupancyPct ?? 0}%`} icon={BedDouble} tone="blue" />
          <StatCard label="Claims pending" value={k.claimsPending ?? 0} hint={`${k.firstPassAcceptancePct ?? 0}% first-pass`} icon={FileCheck2} tone="amber" />
          <StatCard label="Avg wait" value={`${k.avgWaitMinutes ?? 0} min`} icon={Clock} tone="red" />
          <StatCard label="Pending labs" value={k.pendingLabs ?? 0} icon={FlaskConical} tone="blue" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Visits (last 30 days)">{data?.visitsTrend?.length ? <LineTrend data={data.visitsTrend} x="date" lines={[{ key: 'visits', label: 'Visits' }, { key: 'admissions', label: 'Admissions' }]} /> : <EmptyState title="No visit data" />}</Card>
          <Card title="Revenue (KES)">{rev.length ? <Bars data={rev} x="date" bars={[{ key: 'cash', label: 'Cash' }, { key: 'insurance', label: 'Insurance/SHA' }]} /> : <EmptyState title="No revenue data" />}</Card>
          <Card title="Payer mix">{data?.payerMix?.length ? <Donut data={data.payerMix} nameKey="payer" valueKey="count" /> : <EmptyState title="No data" />}</Card>
          <Card title="Top diagnoses">{data?.topDiagnoses?.length ? <Bars data={data.topDiagnoses} x="name" bars={[{ key: 'count', label: 'Cases' }]} layout="vertical" /> : <EmptyState title="No data" />}</Card>
        </div>
      </>}
    </div>
  );
}
