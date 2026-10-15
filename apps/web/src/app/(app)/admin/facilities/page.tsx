'use client';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge } from '@/components/ui';
export default function Facilities() {
  return <CrudPage title="Facilities" subtitle="Branches in your organisation" path="/facilities" createLabel="New facility" columns={[
    { key: 'name', header: 'Name' }, { key: 'kmhflCode', header: 'KMHFL code' }, { key: 'level', header: 'Level' }, { key: 'county', header: 'County' }, { key: 'phone', header: 'Phone' }, { key: 'active', header: 'Status', render: (f: any) => <StatusBadge status={f.active === false ? 'INACTIVE' : 'ACTIVE'} /> }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'kmhflCode', label: 'KMHFL code' }, { name: 'level', label: 'KEPH level', type: 'select', options: ['LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5', 'LEVEL_6'] }, { name: 'county', label: 'County' }, { name: 'subCounty', label: 'Sub-county' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Address', full: true }]} />;
}
