'use client';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { useAction } from '@/lib/hooks';
import { dateTime, fullName } from '@/lib/format';

export default function Radiology() {
  const [stage, setStage] = useState('REQUESTED,PAID'); const [sel, setSel] = useState<any>(null);
  const start = useAction<string>('post', (id) => `/radiology/orders/${id}/start`, { invalidate: ['/radiology'], success: 'Exam started' });
  const verify = useAction<string>('post', (id) => `/radiology/orders/${id}/verify`, { invalidate: ['/radiology'], success: 'Report verified' });
  return (
    <div>
      <PageHeader title="Radiology" subtitle="Imaging worklist & reporting" />
      <Tabs value={stage} onChange={setStage} tabs={[{ id: 'REQUESTED,PAID', label: 'Scheduled' }, { id: 'IN_PROGRESS', label: 'In progress / to report' }, { id: 'COMPLETED', label: 'Reported' }, { id: 'VERIFIED', label: 'Verified' }]} />
      <DataTable path="/radiology/worklist" query={{ status: stage }} columns={[
        { key: 'visit', header: 'Visit', render: (o: any) => o.visit?.visitNumber },
        { key: 'patient', header: 'Patient', render: (o: any) => fullName(o.visit?.patient) },
        { key: 'exam', header: 'Exam', render: (o: any) => o.description },
        { key: 'modality', header: 'Modality', render: (o: any) => o.imagingReport?.modality ?? (String(o.description).match(/^\[(\w+)\]/)?.[1] ?? '—') }, { key: 'createdAt', header: 'Ordered', render: (o: any) => dateTime(o.createdAt) },
        { key: 'status', header: 'Status', render: (o: any) => <StatusBadge status={o.status} /> },
        { key: 'a', header: '', render: (o: any) => <span className="flex gap-1">
          {stage === 'REQUESTED,PAID' && <button className="btn-primary py-1 text-xs" onClick={() => start.mutate(o.id)}>Start exam</button>}
          {stage === 'IN_PROGRESS' && <button className="btn-primary py-1 text-xs" onClick={() => setSel(o)}>Report</button>}
          {stage === 'COMPLETED' && <button className="btn-primary py-1 text-xs" onClick={() => verify.mutate(o.id)}>Verify</button>}
          {o.imagingReport?.studyUid && (o.imagingReport?.viewerUrl
            ? <a className="btn-secondary py-1 text-xs" href={o.imagingReport.viewerUrl} target="_blank" rel="noreferrer">Open viewer</a>
            : <span className="text-xs text-slate-400" title="Set ORTHANC_PUBLIC_URL on the API">PACS viewer not configured</span>)}</span> },
      ]} />
      <FormDialog open={!!sel} onClose={() => setSel(null)} title="Radiology report" path={`/radiology/orders/${sel?.id}/report`} invalidate={['/radiology']} success="Report saved" defaults={{ modality: String(sel?.description ?? '').match(/^\[(\w+)\]/)?.[1] ?? 'XR' }} fields={[
        { name: 'modality', label: 'Modality', type: 'select', options: ['XR', 'US', 'CT', 'MRI', 'MAMMO', 'FLUORO', 'ECHO'], required: true }, { name: 'studyUid', label: 'Study UID (PACS)' },
        { name: 'findings', label: 'Findings', type: 'textarea', required: true }, { name: 'impression', label: 'Impression', type: 'textarea', required: true }]} />
    </div>
  );
}
