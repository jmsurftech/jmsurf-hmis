'use client';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge } from '@/components/ui';
import { date, money } from '@/lib/format';
export default function Assets() {
  return <CrudPage title="Fixed assets" subtitle="Register, depreciation & maintenance" path="/assets" createLabel="New asset" columns={[
    { key: 'tagNumber', header: 'Tag' }, { key: 'name', header: 'Asset' }, { key: 'category', header: 'Category' }, { key: 'location', header: 'Location', render: (a: any) => a.department?.name ?? a.location ?? '—' },
    { key: 'acquiredAt', header: 'Acquired', render: (a: any) => date(a.acquiredAt) }, { key: 'costMinor', header: 'Cost', render: (a: any) => money(a.costMinor), className: 'text-right' }, { key: 'nbvMinor', header: 'NBV', render: (a: any) => money(a.netBookValueMinor ?? a.nbvMinor), className: 'text-right' },
    { key: 'status', header: 'Status', render: (a: any) => <StatusBadge status={a.status} /> }]}
    fields={[{ name: 'tagNumber', label: 'Tag number' }, { name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', type: 'select', options: ['MEDICAL_EQUIPMENT', 'FURNITURE', 'IT', 'VEHICLE', 'BUILDING', 'OTHER'] }, { name: 'serialNumber', label: 'Serial no.' }, { name: 'acquiredAt', label: 'Acquired', type: 'date' }, { name: 'cost', label: 'Cost (KES)', type: 'money', required: true }, { name: 'usefulLifeYears', label: 'Useful life (yrs)', type: 'number' }, { name: 'depreciationMethod', label: 'Depreciation', type: 'select', options: ['STRAIGHT_LINE', 'REDUCING_BALANCE'] }, { name: 'nextServiceDate', label: 'Next service', type: 'date' }]} />;
}
