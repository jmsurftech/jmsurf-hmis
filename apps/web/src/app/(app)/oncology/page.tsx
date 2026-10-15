'use client';
import { useState } from 'react';
import { ModulePage } from '@/components/ModulePage';
import { PatientName } from '@/components/PatientName';
import { Table } from '@/components/DataTable';
import { Card, Field, KV, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { date, dateTime } from '@/lib/format';
import { PICK } from '@/lib/pickers';
import { SPICK } from '@/lib/support-pickers';

function BsaCalc() {
  const [h, setH] = useState('170'); const [w, setW] = useState('70');
  const ok = Number(h) > 0 && Number(w) > 0;
  const { data, error } = useGet<any>(ok ? '/oncology/bsa' : null, { heightCm: h, weightKg: w });
  return <Card title="BSA calculator (Mosteller)" className="mb-4">
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Height (cm)"><input className="input w-28" type="number" value={h} onChange={(e) => setH(e.target.value)} /></Field>
      <Field label="Weight (kg)"><input className="input w-28" type="number" value={w} onChange={(e) => setW(e.target.value)} /></Field>
      <p className="pb-2 text-lg font-semibold">{error ? <span className="text-sm text-red-600">{(error as Error).message}</span> : data ? `${data.bsa} m²` : '—'}</p>
      <p className="pb-2 text-xs text-slate-500">BSA = √(height × weight / 3600)</p>
    </div>
  </Card>;
}
const doseText = (ds: any[] = []) => ds.map((d) => `${d.drug} ${d.dose} ${d.unit}${d.capped ? ' (capped)' : ''}`).join(' · ');

export default function Oncology() {
  return <ModulePage title="Oncology" subtitle="Chemotherapy protocols, BSA dosing, cycle scheduling & administration" tabs={[
    { id: 'schedule', label: 'Chemo schedule', path: '/oncology/schedule', invalidate: ['/oncology'],
      columns: [{ key: 'scheduledDate', header: 'Due', render: (c: any) => <span className={new Date(c.scheduledDate) < new Date() ? 'font-semibold text-amber-600' : ''}>{date(c.scheduledDate)}</span> }, { key: 'patientId', header: 'Patient', render: (c: any) => <PatientName id={c.patientId} withMrn /> }, { key: 'protocol', header: 'Protocol' }, { key: 'cycleNo', header: 'Cycle' }, { key: 'bsa', header: 'BSA', render: (c: any) => `${c.bsa} m²` }, { key: 'plannedDoses', header: 'Planned doses', render: (c: any) => <span className="text-xs">{doseText(c.plannedDoses)}</span> }, { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} /> }],
      renderDetail: (c: any) => <div className="space-y-3"><KV items={[['Patient', <PatientName key="p" id={c.patientId} withMrn />], ['Protocol', c.protocol], ['Cycle', c.cycleNo], ['Due', date(c.scheduledDate)], ['BSA', `${c.bsa} m²`], ['Status', <StatusBadge key="s" status={c.status} />], ['Notes', c.notes]]} />
        <Table rows={c.plannedDoses ?? []} columns={[{ key: 'drug', header: 'Drug' }, { key: 'dose', header: 'Dose' }, { key: 'unit', header: 'Unit' }, { key: 'route', header: 'Route' }, { key: 'days', header: 'Days', render: (d: any) => (d.days ?? []).join(', ') }]} /></div>,
      detailTitle: (c: any) => `Cycle ${c.cycleNo} · ${c.protocol}`,
      actions: [
        { label: 'Record administration', tone: 'primary', path: (c: any) => `/oncology/cycles/${c.id}/administer`, fields: [{ name: 'weightKg', label: 'Weight today (kg) – recalculates BSA & doses', type: 'number' }, { name: 'notes', label: 'Notes (premeds, reactions, lot numbers)', type: 'textarea' }] },
        { label: 'Delay cycle', path: (c: any) => `/oncology/cycles/${c.id}/delay`, fields: [{ name: 'newDate', label: 'New date', type: 'date', required: true }, { name: 'reason', label: 'Reason (e.g. neutropenia)', required: true }, { name: 'shiftFollowing', label: 'Shift following cycles', type: 'checkbox' }], defaults: () => ({ shiftFollowing: true }) },
      ] },
    { id: 'regimens', label: 'Patient regimens', path: '/oncology/regimens', custom: <BsaCalc />, createLabel: 'Start regimen', invalidate: ['/oncology'],
      columns: [{ key: 'patientId', header: 'Patient', render: (r: any) => <PatientName id={r.patientId} withMrn /> }, { key: 'protocol', header: 'Protocol', render: (r: any) => r.protocol?.code }, { key: 'bsa', header: 'BSA', render: (r: any) => `${r.bsa} m²` }, { key: 'doseModPct', header: 'Dose %' }, { key: 'progress', header: 'Cycles', render: (r: any) => `${r.cyclesGiven}/${r.cyclesTotal}` }, { key: 'next', header: 'Next cycle', render: (r: any) => r.nextCycle ? date(r.nextCycle.scheduledDate) : '—' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> }],
      fields: [{ name: 'patientId', label: 'Patient', type: 'picker', source: PICK.patient, required: true }, { name: 'protocolId', label: 'Protocol', type: 'picker', source: SPICK.protocol, required: true }, { name: 'heightCm', label: 'Height (cm)', type: 'number', required: true }, { name: 'weightKg', label: 'Weight (kg)', type: 'number', required: true }, { name: 'startDate', label: 'Cycle 1 date', type: 'date', required: true }, { name: 'doseModPct', label: 'Dose modification %', type: 'number' }, { name: 'cycles', label: 'Number of cycles (default from protocol)', type: 'number' }],
      detailPath: (r: any) => `/oncology/regimens/${r.id}`, detailTitle: (r: any) => `Regimen · ${r.protocol?.code ?? ''}`,
      renderDetail: (d) => d && <div className="space-y-4"><KV items={[['Patient', <PatientName key="p" id={d.patientId} withMrn />], ['Protocol', d.protocol?.name], ['Height / weight', `${d.heightCm} cm / ${d.weightKg} kg`], ['BSA (Mosteller)', `${d.bsa} m²`], ['Dose %', d.doseModPct], ['Interval', `${d.protocol?.intervalDays} days`], ['Status', <StatusBadge key="s" status={d.status} />]]} />
        <Table rows={d.cycles} columns={[{ key: 'cycleNo', header: '#' }, { key: 'scheduledDate', header: 'Date', render: (c: any) => date(c.scheduledDate) }, { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} /> }, { key: 'planned', header: 'Planned', render: (c: any) => <span className="text-xs">{doseText(c.plannedDoses)}</span> }, { key: 'given', header: 'Given', render: (c: any) => c.givenDoses ? <span className="text-xs">{doseText(c.givenDoses)}</span> : '—' }, { key: 'administeredAt', header: 'Given at', render: (c: any) => dateTime(c.administeredAt) }]} /></div>,
      actions: [{ label: 'Stop regimen', tone: 'danger', path: (r: any) => `/oncology/regimens/${r.id}/stop`, show: (r: any) => r.status === 'ACTIVE' }] },
    { id: 'protocols', label: 'Protocols', path: '/oncology/protocols', searchable: true, createLabel: 'New protocol',
      columns: [{ key: 'code', header: 'Code' }, { key: 'name', header: 'Name' }, { key: 'indication', header: 'Indication' }, { key: 'cycles', header: 'Cycles' }, { key: 'intervalDays', header: 'Interval (d)' }, { key: 'drugs', header: 'Drugs', render: (p: any) => <span className="text-xs">{(p.drugs ?? []).map((d: any) => `${d.drug} ${d.dose} ${d.unit}`).join(' · ')}</span> }],
      fields: [{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true }, { name: 'indication', label: 'Indication' }, { name: 'cycles', label: 'Cycles', type: 'number', required: true }, { name: 'intervalDays', label: 'Interval (days)', type: 'number', required: true },
        { name: 'drugsText', label: 'Drugs – one per line: Drug, dose, unit (mg/m2|mg/kg|mg), route, days (1;8), max dose', type: 'textarea', required: true, placeholder: 'Doxorubicin, 60, mg/m2, IV, 1\nVincristine, 1.4, mg/m2, IV, 1, 2' }],
      transform: ({ drugsText, ...v }) => ({ ...v, drugs: String(drugsText).split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((p) => p[0]).map(([drug, dose, unit, route, days, maxDose]) => ({ drug, dose: Number(dose), unit: unit || 'mg/m2', route: route || undefined, days: days ? days.split(/[;\s]+/).map(Number).filter(Boolean) : [1], ...(maxDose ? { maxDose: Number(maxDose) } : {}) })) }) },
  ]} />;
}
