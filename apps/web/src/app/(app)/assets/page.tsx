'use client';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { date, money } from '@/lib/format';
export default function Assets() {
  const { facilityId } = useAuth();
  return <CrudPage title="Fixed assets" subtitle="Register, depreciation & maintenance" path="/assets" createLabel="New asset" columns={[
    { key: 'tag', header: 'Tag' }, { key: 'name', header: 'Asset' }, { key: 'category', header: 'Category' }, { key: 'location', header: 'Location' },
    { key: 'purchaseDate', header: 'Acquired', render: (a: any) => date(a.purchaseDate) }, { key: 'costMinor', header: 'Cost', render: (a: any) => money(a.costMinor), className: 'text-right' }, { key: 'nbv', header: 'NBV', render: (a: any) => money(a.depreciation?.netBookValueMinor), className: 'text-right' },
    { key: 'nextServiceAt', header: 'Next service', render: (a: any) => date(a.nextServiceAt) }, { key: 'status', header: 'Status', render: (a: any) => <StatusBadge status={a.status} /> }]}
    transform={(v) => ({ ...v, facilityId, usefulLifeYears: Number(v.usefulLifeYears) || 5 })}
    fields={[{ name: 'tag', label: 'Tag number', required: true }, { name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', type: 'select', options: ['MEDICAL_EQUIPMENT', 'FURNITURE', 'IT', 'VEHICLE', 'BUILDING', 'OTHER'], required: true }, { name: 'location', label: 'Location' }, { name: 'purchaseDate', label: 'Acquired', type: 'date' }, { name: 'cost', label: 'Cost (KES)', type: 'money', required: true }, { name: 'usefulLifeYears', label: 'Useful life (yrs)', type: 'number', required: true }, { name: 'nextServiceAt', label: 'Next service', type: 'date' }]} />;
}
