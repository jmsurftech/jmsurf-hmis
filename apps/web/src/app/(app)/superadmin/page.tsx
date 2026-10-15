'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { STATUS_TONE } from '@/components/Security';
import { useGet } from '@/lib/hooks';
import { date, money } from '@/lib/format';


export default function SuperAdminTenants() {
  const { user } = useAuth(); const router = useRouter(); const [status, setStatus] = useState('');
  const { data: o } = useGet<any>(user?.isSuperAdmin ? '/superadmin/overview' : null);
  if (!user?.isSuperAdmin) return <p className="text-sm text-slate-500">Super-admin only.</p>;
  return (
    <div>
      <PageHeader title="Tenants" subtitle="JMSURF SaaS console" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tenants" value={o?.tenants ?? '—'} hint={Object.entries(o?.byPlan ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ')} />
        <StatCard label="Active / trial" value={`${o?.byStatus?.ACTIVE ?? 0} / ${o?.byStatus?.TRIAL ?? 0}`} tone="green" />
        <StatCard label="Grace / read-only" value={`${o?.byStatus?.GRACE ?? 0} / ${o?.byStatus?.READ_ONLY ?? 0}`} tone="amber" />
        <StatCard label="Outstanding" value={money(o?.outstandingMinor ?? 0)} hint={`Collected 30d ${money(o?.collected30dMinor ?? 0)}`} tone="red" />
      </div>
      <DataTable path="/superadmin/tenants" query={{ status }} searchPlaceholder="Search name or slug…" onRowClick={(t: any) => router.push(`/superadmin/${t.id}`)}
        toolbar={<select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{Object.keys(STATUS_TONE).map((s) => <option key={s}>{s}</option>)}</select>}
        columns={[
          { key: 'name', header: 'Tenant', render: (t: any) => <div><p className="font-medium">{t.name}</p><p className="text-xs text-slate-500">{t.slug}</p></div> },
          { key: 'plan', header: 'Plan' },
          { key: 'subscriptionStatus', header: 'Status', render: (t: any) => <StatusBadge status={t.subscriptionStatus} tone={STATUS_TONE[t.subscriptionStatus]} /> },
          { key: 'users', header: 'Users', render: (t: any) => t._count?.users },
          { key: 'facilities', header: 'Facilities', render: (t: any) => t._count?.facilities },
          { key: 'trialEndsAt', header: 'Trial ends', render: (t: any) => date(t.trialEndsAt) },
          { key: 'createdAt', header: 'Created', render: (t: any) => date(t.createdAt) },
        ]} />
    </div>
  );
}
