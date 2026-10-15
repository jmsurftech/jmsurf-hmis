'use client';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/ui';
import { dateTime } from '@/lib/format';
export default function Audit() {
  const [entity, setEntity] = useState('');
  return <div><PageHeader title="Audit log" subtitle="Immutable record of clinical and financial actions" />
    <DataTable path="/admin/audit" query={{ entity }} toolbar={<input className="input sm:w-48" placeholder="Entity type" value={entity} onChange={(e) => setEntity(e.target.value)} />} columns={[
      { key: 'createdAt', header: 'Time', render: (a: any) => dateTime(a.createdAt) }, { key: 'user', header: 'User', render: (a: any) => a.user ? `${a.user.firstName} ${a.user.lastName}` : a.userId ?? 'system' },
      { key: 'action', header: 'Action' }, { key: 'entity', header: 'Entity', render: (a: any) => `${a.entity ?? a.entityType ?? ''} ${a.entityId ? `#${String(a.entityId).slice(0, 8)}` : ''}` },
      { key: 'ip', header: 'IP', render: (a: any) => a.ip ?? a.ipAddress ?? '—' }, { key: 'details', header: 'Details', render: (a: any) => <code className="block max-w-xs truncate text-xs">{a.details ? JSON.stringify(a.details) : ''}</code> }]} /></div>;
}
