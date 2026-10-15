'use client';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { useAction } from '@/lib/hooks';
import { dateTime, fullName } from '@/lib/format';

export default function Radiology() {
  const [stage, setStage] = useState('REQUESTED'); const [sel, setSel] = useState<any>(null);
  const start = useAction<string>('post', (id) => `/radiology/orders/${id}/start`, { invalidate: ['/radiology'], success: 'Exam started' });
  const verify = useAction<string>('post', (id) => `/radiology/orders/${id}/verify`, { invalidate: ['/radiology'], success: 'Report verified' });
  return (
    <div>
      <PageHeader title="Radiology" subtitle="Imaging worklist & reporting" />
      <Tabs value={stage} onChange={setStage} tabs={[{ id: 'REQUESTED', label: 'Scheduled' }, { id: 'IN_PROGRESS', label: 'In progress / to report' }, { id: 'COMPLETED', label: 'Reported' }, { id: 'VERIFIED', label: 'Verified' }]} />
      <DataTable path="/radiology/orders" query={{ status: stage }} columns={[
        { key: 'accession', header: 'Accession', render: (o: any) => o.accessionNumber ?? o.id.slice(0, 8) },
        { key: 'patient', header: 'Patient', render: (o: any) => fullName(o.patient) },
        { key: 'exam', header: 'Exam', render: (o: any) => o.serviceItem?.name ?? o.examName ?? o.name },
        { key: 'modality', header: 'Modality' }, { key: 'createdAt', header: 'Ordered', render: (o: any) => dateTime(o.createdAt) },
        { key: 'status', header: 'Status', render: (o: any) => <StatusBadge status={o.status} /> },
        { key: 'a', header: '', render: (o: any) => <span className="flex gap-1">
          {o.viewerUrl && <a href={o.viewerUrl} target="_blank" rel="noreferrer" className="btn-secondary py-1 text-xs"><ExternalLink className="h-3 w-3" />Images</a>}
          {stage === 'REQUESTED' && <button className="btn-primary py-1 text-xs" onClick={() => start.mutate(o.id)}>Start exam</button>}
          {stage === 'IN_PROGRESS' && <button className="btn-primary py-1 text-xs" onClick={() => setSel(o)}>Report</button>}
          {stage === 'COMPLETED' && <button className="btn-primary py-1 text-xs" onClick={() => verify.mutate(o.id)}>Verify</button>}</span> },
      ]} />
      <FormDialog open={!!sel} onClose={() => setSel(null)} title="Radiology report" path={`/radiology/orders/${sel?.id}/report`} invalidate={['/radiology']} success="Report saved" fields={[
        { name: 'technique', label: 'Technique', type: 'textarea' }, { name: 'findings', label: 'Findings', type: 'textarea', required: true },
        { name: 'impression', label: 'Impression', type: 'textarea', required: true }, { name: 'critical', label: 'Critical finding (notify clinician)', type: 'checkbox' }]} />
    </div>
  );
}
