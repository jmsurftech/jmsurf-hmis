'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { FormDialog } from '@/components/FormDialog';
import { Tabs } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PICK } from '@/lib/pickers';

export default function Departments() {
  const [tab, setTab] = useState('departments'); const [bedWard, setBedWard] = useState<any>(null);
  const { facilityId } = useAuth();
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'departments', label: 'Departments' }, { id: 'wards', label: 'Wards & beds' }]} />;
  if (tab === 'wards') return <CrudPage title="Departments" path="/inpatient/wards" createLabel="New ward" searchable={false} onRowClick={setBedWard} columns={[{ key: 'name', header: 'Ward' }, { key: 'type', header: 'Type' }, { key: 'beds', header: 'Beds', render: (w: any) => w.beds?.length ?? 0 }, { key: 'free', header: 'Available', render: (w: any) => (w.beds ?? []).filter((b: any) => b.status === 'AVAILABLE').length }]}
    fields={[{ name: 'name', label: 'Ward name', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['GENERAL', 'MATERNITY', 'PAEDIATRIC', 'ICU', 'HDU', 'NBU', 'PRIVATE', 'ISOLATION', 'SURGICAL'] }, { name: 'dailyRateServiceId', label: 'Daily bed charge (service item)', type: 'picker', source: PICK.serviceItem('BED') }]}>
    {tabs}<p className="mb-3 text-xs text-slate-500">Click a ward to add beds.</p>
    <FormDialog open={!!bedWard} onClose={() => setBedWard(null)} title={`Add bed to ${bedWard?.name ?? ''}`} path={`/inpatient/wards/${bedWard?.id}/beds`} invalidate={['/inpatient']} success="Bed added" fields={[{ name: 'label', label: 'Bed label', required: true, placeholder: 'e.g. B-12' }]} />
  </CrudPage>;
  return <CrudPage title="Departments" path="/admin/departments" createLabel="New department" searchable={false} transform={(v) => ({ ...v, facilityId: v.facilityId || facilityId })} columns={[{ key: 'name', header: 'Name' }, { key: 'type', header: 'Type' }, { key: 'costCentre', header: 'Cost centre' }, { key: 'active', header: 'Active', render: (d: any) => d.active === false ? 'No' : 'Yes' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['OPD', 'IPD', 'LAB', 'RADIOLOGY', 'PHARMACY', 'THEATRE', 'MATERNITY', 'DIALYSIS', 'ADMIN', 'SUPPORT'], required: true }, { name: 'facilityId', label: 'Facility (default: current)', type: 'picker', source: PICK.facility }, { name: 'costCentre', label: 'Cost centre' }]}>{tabs}</CrudPage>;
}
