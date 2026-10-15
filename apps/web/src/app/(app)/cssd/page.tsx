'use client';
import { ModulePage } from '@/components/ModulePage';
import { PatientName } from '@/components/PatientName';
import { Table } from '@/components/DataTable';
import { KV, StatusBadge } from '@/components/ui';
import { date, dateTime } from '@/lib/format';
import { PICK } from '@/lib/pickers';
import { SPICK } from '@/lib/support-pickers';

const ind = (v?: string | null) => v ? <StatusBadge status={v} tone={v === 'PASS' ? 'green' : v === 'FAIL' ? 'red' : 'amber'} /> : '—';
export default function Cssd() {
  return <ModulePage title="CSSD" subtitle="Instrument sets, sterilisation cycles & traceability" tabs={[
    { id: 'sets', label: 'Instrument sets', path: '/cssd/sets', searchable: true, createLabel: 'New instrument set', invalidate: ['/cssd'],
      columns: [{ key: 'code', header: 'Code' }, { key: 'name', header: 'Set' }, { key: 'department', header: 'Department' }, { key: 'items', header: 'Items', render: (s: any) => (s.items ?? []).reduce((a: number, i: any) => a + Number(i.qty ?? 0), 0) }, { key: 'sterileUntil', header: 'Sterile until', render: (s: any) => date(s.sterileUntil) }, { key: 'status', header: 'Status', render: (s: any) => <StatusBadge status={s.status} tone={s.status === 'STERILE' ? 'green' : s.status === 'RECALLED' ? 'red' : s.status === 'DIRTY' ? 'amber' : 'blue'} /> }],
      fields: [{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true }, { name: 'department', label: 'Department' }, { name: 'itemsText', label: 'Items (one per line: name x qty)', type: 'textarea', required: true }],
      transform: ({ itemsText, ...v }) => ({ ...v, items: String(itemsText).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)\s*[x×]\s*(\d+)$/i); return { name: m ? m[1] : l, qty: m ? Number(m[2]) : 1 }; }) }),
      detailPath: (s: any) => `/cssd/sets/${s.id}`, detailTitle: (s: any) => `${s.code} – ${s.name}`,
      renderDetail: (d) => d && <div className="space-y-4"><KV items={[['Status', <StatusBadge key="s" status={d.status} />], ['Department', d.department], ['Sterile until', date(d.sterileUntil)]]} />
        <Table rows={d.items ?? []} columns={[{ key: 'name', header: 'Instrument' }, { key: 'qty', header: 'Qty' }]} />
        <h4 className="text-sm font-semibold">Usage history</h4>
        <Table rows={d.issues ?? []} empty={<p className="text-sm text-slate-500">Never issued.</p>} columns={[{ key: 'issuedAt', header: 'Issued', render: (i: any) => dateTime(i.issuedAt) }, { key: 'patientId', header: 'Patient', render: (i: any) => <PatientName id={i.patientId} withMrn /> }, { key: 'location', header: 'Location' }, { key: 'returnedAt', header: 'Returned', render: (i: any) => dateTime(i.returnedAt) }]} /></div>,
      actions: [
        { label: 'Issue to theatre / patient', tone: 'primary', path: (s: any) => `/cssd/sets/${s.id}/issue`, show: (s: any) => s.status === 'STERILE', fields: [{ name: 'surgeryId', label: 'Theatre booking', type: 'picker', source: SPICK.surgery() }, { name: 'patientId', label: 'Patient (if no booking)', type: 'picker', source: PICK.patient }, { name: 'location', label: 'Location' }] },
        { label: 'Return (dirty)', path: (s: any) => `/cssd/sets/${s.id}/return`, show: (s: any) => s.status === 'ISSUED' },
      ] },
    { id: 'cycles', label: 'Sterilisation cycles', path: '/cssd/cycles', searchable: true, createLabel: 'Start cycle (load)', invalidate: ['/cssd'],
      columns: [{ key: 'cycleNumber', header: 'Cycle' }, { key: 'machine', header: 'Autoclave' }, { key: 'method', header: 'Method' }, { key: 'setIds', header: 'Sets', render: (c: any) => c.setIds.length }, { key: 'startedAt', header: 'Started', render: (c: any) => dateTime(c.startedAt) }, { key: 'ci', header: 'CI', render: (c: any) => ind(c.chemicalIndicator) }, { key: 'bi', header: 'BI', render: (c: any) => ind(c.biologicalIndicator) }, { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} tone={c.status === 'PASSED' ? 'green' : c.status === 'RUNNING' ? 'blue' : 'red'} /> }],
      fields: [{ name: 'machine', label: 'Autoclave', type: 'select', options: ['Autoclave A', 'Autoclave B', 'Plasma steriliser'], required: true }, { name: 'method', label: 'Method', type: 'select', options: ['STEAM', 'ETO', 'PLASMA'] }, { name: 'set1', label: 'Set', type: 'picker', source: SPICK.instrumentSet('DIRTY'), required: true }, { name: 'set2', label: 'Set', type: 'picker', source: SPICK.instrumentSet('DIRTY') }, { name: 'set3', label: 'Set', type: 'picker', source: SPICK.instrumentSet('DIRTY') }, { name: 'set4', label: 'Set', type: 'picker', source: SPICK.instrumentSet('DIRTY') }, { name: 'temperatureC', label: 'Temp °C', type: 'number' }, { name: 'durationMin', label: 'Hold time (min)', type: 'number' }],
      transform: ({ set1, set2, set3, set4, ...v }) => ({ ...v, setIds: [...new Set([set1, set2, set3, set4].filter(Boolean))] }),
      detailPath: (c: any) => `/cssd/cycles/${c.id}`, detailTitle: (c: any) => `Cycle ${c.cycleNumber}`,
      renderDetail: (d) => d && <div className="space-y-4"><KV items={[['Autoclave', d.machine], ['Method', d.method], ['Temp °C', d.temperatureC], ['Pressure kPa', d.pressureKpa], ['Hold (min)', d.durationMin], ['Chemical', ind(d.chemicalIndicator)], ['Biological', ind(d.biologicalIndicator)], ['Bowie-Dick', ind(d.bowieDick)], ['Status', <StatusBadge key="s" status={d.status} />], ['Recall reason', d.recallReason]]} />
        <h4 className="text-sm font-semibold">Sets in load</h4><Table rows={d.sets ?? []} columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Set' }, { key: 'status', header: 'Status', render: (s: any) => <StatusBadge status={s.status} /> }]} />
        <h4 className="text-sm font-semibold">Patients exposed (traceability)</h4><Table rows={d.exposures ?? []} empty={<p className="text-sm text-slate-500">No sets from this load used yet.</p>} columns={[{ key: 'patientId', header: 'Patient', render: (i: any) => <PatientName id={i.patientId} withMrn /> }, { key: 'issuedAt', header: 'Used', render: (i: any) => dateTime(i.issuedAt) }, { key: 'location', header: 'Location' }]} /></div>,
      actions: [
        { label: 'Record indicators / complete', tone: 'primary', path: (c: any) => `/cssd/cycles/${c.id}/complete`, show: (c: any) => c.status === 'RUNNING', fields: [{ name: 'chemicalIndicator', label: 'Chemical indicator', type: 'select', options: ['PASS', 'FAIL'], required: true }, { name: 'biologicalIndicator', label: 'Biological indicator', type: 'select', options: ['PASS', 'FAIL', 'PENDING'] }, { name: 'bowieDick', label: 'Bowie-Dick', type: 'select', options: ['PASS', 'FAIL'] }, { name: 'temperatureC', label: 'Temp °C', type: 'number' }, { name: 'pressureKpa', label: 'Pressure kPa', type: 'number' }, { name: 'durationMin', label: 'Hold (min)', type: 'number' }, { name: 'shelfLifeDays', label: 'Shelf life (days)', type: 'number' }] },
        { label: 'BI result', path: (c: any) => `/cssd/cycles/${c.id}/biological`, show: (c: any) => c.biologicalIndicator === 'PENDING' && c.status === 'PASSED', fields: [{ name: 'biologicalIndicator', label: 'Biological indicator', type: 'select', options: ['PASS', 'FAIL'], required: true }] },
        { label: 'Recall load', tone: 'danger', path: (c: any) => `/cssd/cycles/${c.id}/recall`, show: (c: any) => c.status !== 'RECALLED' && c.status !== 'RUNNING', fields: [{ name: 'reason', label: 'Reason', required: true }] },
      ] },
    { id: 'tracking', label: 'Set tracking', path: '/cssd/issues',
      columns: [{ key: 'issuedAt', header: 'Issued', render: (i: any) => dateTime(i.issuedAt) }, { key: 'set', header: 'Set', render: (i: any) => i.set ? `${i.set.code} – ${i.set.name}` : '—' }, { key: 'cycle', header: 'Cycle', render: (i: any) => i.cycle?.cycleNumber ?? '—' }, { key: 'patientId', header: 'Patient', render: (i: any) => <PatientName id={i.patientId} withMrn /> }, { key: 'location', header: 'Location' }, { key: 'returnedAt', header: 'Returned', render: (i: any) => dateTime(i.returnedAt) }] },
  ]} />;
}
