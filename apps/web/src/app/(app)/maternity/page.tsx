'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge, Tabs } from '@/components/ui';
import { date, fullName } from '@/lib/format';

export default function Maternity() {
  const [tab, setTab] = useState('anc');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'anc', label: 'ANC' }, { id: 'labour', label: 'Labour & delivery' }, { id: 'pnc', label: 'PNC' }]} />;
  if (tab === 'anc') return <CrudPage title="Maternity" subtitle="Antenatal care register (MOH 405)" path="/maternity/anc" createLabel="New ANC visit" columns={[
    { key: 'patient', header: 'Mother', render: (r: any) => fullName(r.patient) }, { key: 'ancNumber', header: 'ANC no.' }, { key: 'visitNumber', header: 'Visit #' }, { key: 'gestationWeeks', header: 'GA (wks)' },
    { key: 'edd', header: 'EDD', render: (r: any) => date(r.edd) }, { key: 'risk', header: 'Risk', render: (r: any) => <StatusBadge status={r.riskLevel ?? 'NORMAL'} /> }]}
    fields={[{ name: 'patientId', label: 'Patient ID', required: true }, { name: 'lmp', label: 'LMP', type: 'date' }, { name: 'gravida', label: 'Gravida', type: 'number' }, { name: 'parity', label: 'Parity' }, { name: 'gestationWeeks', label: 'Gestation (weeks)', type: 'number' }, { name: 'fundalHeight', label: 'Fundal height (cm)', type: 'number' }, { name: 'hb', label: 'Hb (g/dL)', type: 'number' }, { name: 'hivStatus', label: 'HIV status', type: 'select', options: ['NEGATIVE', 'POSITIVE', 'UNKNOWN'] }, { name: 'notes', label: 'Notes', type: 'textarea' }]}>{tabs}</CrudPage>;
  if (tab === 'labour') return <CrudPage title="Maternity" subtitle="Labour, delivery & partograph" path="/maternity/deliveries" createLabel="Record delivery" columns={[
    { key: 'patient', header: 'Mother', render: (r: any) => fullName(r.patient) }, { key: 'deliveredAt', header: 'Delivered', render: (r: any) => date(r.deliveredAt) }, { key: 'mode', header: 'Mode' }, { key: 'outcome', header: 'Outcome' }, { key: 'apgar5', header: 'APGAR 5' }, { key: 'birthWeightG', header: 'Weight (g)' }]}
    fields={[{ name: 'patientId', label: 'Mother patient ID', required: true }, { name: 'deliveredAt', label: 'Delivery time', type: 'datetime-local', required: true }, { name: 'mode', label: 'Mode', type: 'select', options: ['SVD', 'CS', 'ASSISTED_VAGINAL', 'BREECH'] }, { name: 'outcome', label: 'Outcome', type: 'select', options: ['LIVE_BIRTH', 'FRESH_STILLBIRTH', 'MACERATED_STILLBIRTH'] }, { name: 'babySex', label: 'Baby sex', type: 'select', options: ['MALE', 'FEMALE'] }, { name: 'birthWeightG', label: 'Birth weight (g)', type: 'number' }, { name: 'apgar1', label: 'APGAR 1 min', type: 'number' }, { name: 'apgar5', label: 'APGAR 5 min', type: 'number' }, { name: 'bloodLossMl', label: 'Blood loss (ml)', type: 'number' }, { name: 'complications', label: 'Complications', type: 'textarea' }]}>{tabs}</CrudPage>;
  return <CrudPage title="Maternity" subtitle="Postnatal care" path="/maternity/pnc" createLabel="New PNC visit" columns={[
    { key: 'patient', header: 'Mother', render: (r: any) => fullName(r.patient) }, { key: 'visitDate', header: 'Date', render: (r: any) => date(r.visitDate ?? r.createdAt) }, { key: 'timing', header: 'Timing' }, { key: 'babyStatus', header: 'Baby' }, { key: 'fpMethod', header: 'FP method' }]}
    fields={[{ name: 'patientId', label: 'Patient ID', required: true }, { name: 'timing', label: 'Timing', type: 'select', options: ['48H', '1-2W', '4-6W'] }, { name: 'motherStatus', label: 'Mother condition' }, { name: 'babyStatus', label: 'Baby condition' }, { name: 'fpMethod', label: 'Family planning' }, { name: 'notes', label: 'Notes', type: 'textarea' }]}>{tabs}</CrudPage>;
}
