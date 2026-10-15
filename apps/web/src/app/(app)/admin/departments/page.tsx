'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { Tabs } from '@/components/ui';
export default function Departments() {
  const [tab, setTab] = useState('departments');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'departments', label: 'Departments' }, { id: 'sp', label: 'Service points' }, { id: 'wards', label: 'Wards & beds' }]} />;
  if (tab === 'sp') return <CrudPage title="Departments" path="/queue/service-points" createLabel="New service point" columns={[{ key: 'name', header: 'Name' }, { key: 'code', header: 'Code' }, { key: 'type', header: 'Type' }, { key: 'department', header: 'Department', render: (s: any) => s.department?.name ?? '—' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Ticket prefix' }, { name: 'type', label: 'Type', type: 'select', options: ['RECEPTION', 'TRIAGE', 'CONSULTATION', 'LAB', 'RADIOLOGY', 'PHARMACY', 'CASHIER'] }, { name: 'departmentId', label: 'Department ID' }]}>{tabs}</CrudPage>;
  if (tab === 'wards') return <CrudPage title="Departments" path="/ipd/wards" createLabel="New ward" columns={[{ key: 'name', header: 'Ward' }, { key: 'gender', header: 'Gender' }, { key: 'beds', header: 'Beds', render: (w: any) => w.bedCount ?? w.beds?.length ?? 0 }, { key: 'dailyRateMinor', header: 'Daily rate', render: (w: any) => w.dailyRateMinor != null ? `KES ${(w.dailyRateMinor / 100).toLocaleString()}` : '—' }]}
    fields={[{ name: 'name', label: 'Ward name', required: true }, { name: 'gender', label: 'Gender', type: 'select', options: ['MALE', 'FEMALE', 'MIXED', 'PAEDIATRIC'] }, { name: 'bedCount', label: 'Number of beds', type: 'number', required: true }, { name: 'dailyRate', label: 'Daily bed rate (KES)', type: 'money' }]}>{tabs}</CrudPage>;
  return <CrudPage title="Departments" path="/departments" createLabel="New department" columns={[{ key: 'name', header: 'Name' }, { key: 'code', header: 'Code' }, { key: 'type', header: 'Type' }, { key: 'facility', header: 'Facility', render: (d: any) => d.facility?.name ?? '—' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code' }, { name: 'type', label: 'Type', type: 'select', options: ['CLINICAL', 'DIAGNOSTIC', 'SUPPORT', 'ADMINISTRATIVE'] }]}>{tabs}</CrudPage>;
}
