'use client';
import { useState } from 'react';
import { Table } from '@/components/DataTable';
import { Card, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { useAction, useList } from '@/lib/hooks';
import { dateTime } from '@/lib/format';

export default function BreakGlassReview() {
  const [tab, setTab] = useState('false');
  const { data } = useList<any>('/security/break-glass', { reviewed: tab });
  const review = useAction<{ id: string; note?: string }>('post', (b) => `/security/break-glass/${b.id}/review`, { success: 'Marked reviewed', invalidate: ['/security'] });
  return (
    <div>
      <PageHeader title="Break-glass review" subtitle="Emergency access to restricted records. Review each use." />
      <Tabs tabs={[{ id: 'false', label: 'Pending review' }, { id: 'true', label: 'Reviewed' }]} value={tab} onChange={setTab} />
      <Card>
        <Table rows={data?.data ?? []} empty="Nothing to review" columns={[
          { key: 'createdAt', header: 'When', render: (g: any) => dateTime(g.createdAt) },
          { key: 'user', header: 'User', render: (g: any) => g.user ? `${g.user.firstName} ${g.user.lastName}` : g.userId },
          { key: 'patient', header: 'Patient', render: (g: any) => g.patient ? `${g.patient.firstName} ${g.patient.lastName} (${g.patient.mrn})` : 'Any' },
          { key: 'reason', header: 'Reason', className: 'max-w-sm' },
          { key: 'expiresAt', header: 'Expires', render: (g: any) => <StatusBadge status={new Date(g.expiresAt) > new Date() ? 'ACTIVE' : 'EXPIRED'} tone={new Date(g.expiresAt) > new Date() ? 'red' : undefined} /> },
          { key: 'r', header: '', render: (g: any) => g.reviewedAt ? <span className="text-xs text-slate-500">{g.reviewNote ?? 'Reviewed'}</span>
            : <button className="btn-secondary py-1 text-xs" onClick={() => { const note = prompt('Review note (optional)') ?? undefined; review.mutate({ id: g.id, note }); }}>Mark reviewed</button> },
        ]} />
      </Card>
    </div>
  );
}
