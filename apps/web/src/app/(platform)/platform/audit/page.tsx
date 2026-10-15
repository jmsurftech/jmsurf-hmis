'use client';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { PageHeader, Seg, humanize } from '@/components/ui';
import { dateTime } from '@/lib/format';

const by = (r: any) => (r.user ? `${r.user.firstName} ${r.user.lastName}` : r.action.startsWith('PORTAL') ? 'Patient (portal)' : 'System');

export default function PlatformAudit() {
  const [scope, setScope] = useState('PLATFORM');
  return (
    <div>
      <PageHeader title="Platform audit" subtitle="Tamper-evident log. Platform actions are what super admins changed; all tenants shows every event across hospitals." />
      <div className="mb-4"><Seg options={[{ id: 'PLATFORM', label: 'Platform actions' }, { id: '', label: 'All tenants' }]} value={scope} onChange={setScope} /></div>
      <DataTable path="/platform/audit" query={{ tenantId: scope }} searchPlaceholder="Search action or record" exportName="platform-audit" emptyTitle="No events yet"
        columns={[
          { key: 'createdAt', header: 'When', render: (r: any) => dateTime(r.createdAt), csv: (r: any) => r.createdAt },
          { key: 'action', header: 'Action', render: (r: any) => <b>{humanize(r.action)}</b>, csv: (r: any) => r.action },
          { key: 'tenant', header: 'Tenant', render: (r: any) => r.tenant?.name ?? r.data?.tenant ?? <span className="badge brand">Platform</span>, csv: (r: any) => r.tenant?.name ?? r.data?.tenant ?? 'Platform' },
          { key: 'user', header: 'By', render: by, csv: by },
          { key: 'entity', header: 'Record', render: (r: any) => <span className="text-slate-500">{r.entity}</span> },
          { key: 'data', header: 'Details', render: (r: any) => (r.data?.after ? <code className="text-xs">{Object.entries(r.data.after).map(([k, v]) => `${k}: ${v ?? '—'}`).join(', ')}</code> : r.data?.reason ?? ''), csv: (r: any) => JSON.stringify(r.data ?? {}) },
        ]} />
    </div>
  );
}
