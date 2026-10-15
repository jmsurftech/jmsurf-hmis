'use client';
import { Check, LogOut, Plus, X } from 'lucide-react';
import { use, useState } from 'react';
import { Table } from '@/components/DataTable';
import { FormDialog } from '@/components/FormDialog';
import { Card, ErrorNote, KV, Loading, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { useAction, useGet, useList } from '@/lib/hooks';
import { date, dateTime, fullName } from '@/lib/format';

export default function Admission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState('notes'); const [dlg, setDlg] = useState<'' | 'note' | 'discharge' | 'transfer'>('');
  const { data: a, isLoading, error } = useGet<any>(`/ipd/admissions/${id}`);
  const notes = useList<any>(`/ipd/admissions/${id}/nursing-notes`, { pageSize: 100 }, tab === 'notes');
  const mar = useList<any>(`/ipd/admissions/${id}/mar`, { date: new Date().toISOString().slice(0, 10) }, tab === 'emar');
  const give = useAction<{ id: string; status: string }>('post', (b) => `/ipd/mar/${b.id}/administer`, { invalidate: [`/ipd/admissions/${id}`], success: 'Recorded' });
  if (isLoading) return <Loading />;
  if (error || !a) return <ErrorNote error={error ?? new Error('Admission not found')} />;
  return (
    <div>
      <PageHeader title={fullName(a.patient)} subtitle={`${a.admissionNumber ?? ''} · ${a.ward?.name ?? ''} ${a.bed?.label ?? ''} · admitted ${date(a.admittedAt)}`}
        actions={a.status !== 'DISCHARGED' && <><button className="btn-secondary" onClick={() => setDlg('transfer')}>Transfer bed</button><button className="btn-primary" onClick={() => setDlg('discharge')}><LogOut className="h-4 w-4" />Discharge</button></>} />
      <Card className="mb-4"><KV items={[['Status', <StatusBadge key="s" status={a.status} />], ['Admitting diagnosis', a.admittingDiagnosis], ['Attending', a.attending?.name], ['Payer', a.visit?.payerType], ['Length of stay', `${Math.max(1, Math.ceil((Date.now() - new Date(a.admittedAt).getTime()) / 864e5))} days`], ['Discharged', date(a.dischargedAt)]]} /></Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'notes', label: 'Nursing notes' }, { id: 'emar', label: 'eMAR' }]} />
      {tab === 'notes' && <Card title="Nursing notes" actions={<button className="btn-secondary py-1" onClick={() => setDlg('note')}><Plus className="h-4 w-4" />Add note</button>}>
        <ul className="space-y-3">{(notes.data?.data ?? []).map((n) => <li key={n.id} className="border-l-2 border-primary-400 pl-3 text-sm"><p className="text-xs text-slate-500">{dateTime(n.createdAt)} · {n.author?.name ?? n.authorName ?? ''} · {n.shift ?? ''}</p><p className="whitespace-pre-wrap">{n.note ?? n.text}</p></li>)}</ul>
        {!notes.data?.data?.length && <p className="text-sm text-slate-500">No notes yet</p>}
      </Card>}
      {tab === 'emar' && <Card title="Medication administration record (today)">
        <Table rows={mar.data?.data ?? []} columns={[
          { key: 'scheduledAt', header: 'Due', render: (m: any) => dateTime(m.scheduledAt) }, { key: 'drug', header: 'Medication', render: (m: any) => `${m.drug?.name ?? m.drugName ?? ''} ${m.dose ?? ''} ${m.route ?? ''}` },
          { key: 'status', header: 'Status', render: (m: any) => <StatusBadge status={m.status} /> }, { key: 'givenBy', header: 'Given by', render: (m: any) => m.givenBy?.name ?? '—' },
          { key: 'a', header: '', render: (m: any) => m.status === 'PENDING' || m.status === 'DUE' ? <span className="flex gap-1"><button className="btn-primary px-2 py-1 text-xs" onClick={() => give.mutate({ id: m.id, status: 'GIVEN' })}><Check className="h-3 w-3" />Given</button><button className="btn-secondary px-2 py-1 text-xs" onClick={() => give.mutate({ id: m.id, status: 'HELD' })}><X className="h-3 w-3" />Held</button></span> : null },
        ]} />
      </Card>}
      <FormDialog open={dlg === 'note'} onClose={() => setDlg('')} title="Nursing note" path={`/ipd/admissions/${id}/nursing-notes`} fields={[{ name: 'shift', label: 'Shift', type: 'select', options: ['DAY', 'NIGHT'] }, { name: 'note', label: 'Note', type: 'textarea', required: true }]} />
      <FormDialog open={dlg === 'transfer'} onClose={() => setDlg('')} title="Transfer bed" path={`/ipd/admissions/${id}/transfer`} invalidate={['/ipd']} fields={[{ name: 'wardId', label: 'Ward ID', required: true }, { name: 'bedId', label: 'Bed ID', required: true }, { name: 'reason', label: 'Reason' }]} />
      <FormDialog open={dlg === 'discharge'} onClose={() => setDlg('')} title="Discharge patient" path={`/ipd/admissions/${id}/discharge`} invalidate={['/ipd']} success="Patient discharged" fields={[
        { name: 'outcome', label: 'Outcome', type: 'select', options: ['RECOVERED', 'IMPROVED', 'REFERRED', 'ABSCONDED', 'LAMA', 'DIED'], required: true }, { name: 'followUpDate', label: 'Follow-up date', type: 'date' },
        { name: 'dischargeSummary', label: 'Discharge summary', type: 'textarea', required: true }, { name: 'dischargeMedications', label: 'Take-home medication', type: 'textarea' }]} />
    </div>
  );
}
