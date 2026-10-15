'use client';
import { CrudPage } from '@/components/CrudPage';
export default function Facilities() {
  return <CrudPage title="Facilities" subtitle="Branches in your organisation" path="/admin/facilities" createLabel="New facility" searchable={false} columns={[
    { key: 'name', header: 'Name' }, { key: 'code', header: 'Code' }, { key: 'kmhflCode', header: 'KMHFL code' }, { key: 'shaFacilityId', header: 'SHA facility ID' }, { key: 'level', header: 'Level' }, { key: 'county', header: 'County' }, { key: 'phone', header: 'Phone' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Short code', required: true }, { name: 'kmhflCode', label: 'KMHFL code' }, { name: 'shaFacilityId', label: 'SHA facility ID' }, { name: 'level', label: 'KEPH level', type: 'select', options: ['1', '2', '3', '4', '5', '6'] }, { name: 'county', label: 'County' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Address', full: true }]}
    transform={(v) => ({ ...v, level: v.level ? Number(v.level) : undefined })} />;
}
