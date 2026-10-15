'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { StatusBadge, Tabs } from '@/components/ui';
import { money } from '@/lib/format';
export default function Prices() {
  const [tab, setTab] = useState('items');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: 'Service items' }, { id: 'lists', label: 'Price lists' }]} />;
  if (tab === 'lists') return <CrudPage title="Price lists & service items" path="/price-lists" createLabel="New price list" columns={[{ key: 'name', header: 'Name' }, { key: 'payerType', header: 'Applies to' }, { key: 'scheme', header: 'Scheme', render: (p: any) => p.scheme?.name ?? '—' }, { key: 'isDefault', header: 'Default', render: (p: any) => p.isDefault ? <StatusBadge status="DEFAULT" tone="green" /> : '' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'payerType', label: 'Payer type', type: 'select', options: ['CASH', 'SHA', 'INSURANCE', 'CORPORATE'] }, { name: 'schemeId', label: 'Scheme ID' }, { name: 'isDefault', label: 'Default list', type: 'checkbox' }]}>{tabs}</CrudPage>;
  return <CrudPage title="Price lists & service items" path="/service-items" createLabel="New service item" columns={[
    { key: 'code', header: 'Code' }, { key: 'name', header: 'Name' }, { key: 'category', header: 'Category' }, { key: 'shaCode', header: 'SHA code' }, { key: 'priceMinor', header: 'Cash price', render: (s: any) => money(s.priceMinor ?? s.cashPriceMinor), className: 'text-right' }, { key: 'active', header: 'Status', render: (s: any) => <StatusBadge status={s.active === false ? 'INACTIVE' : 'ACTIVE'} /> }]}
    fields={[{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', type: 'select', options: ['CONSULTATION', 'LAB', 'IMAGING', 'PROCEDURE', 'BED', 'NURSING', 'THEATRE', 'DRUG', 'CONSUMABLE', 'OTHER'], required: true }, { name: 'shaCode', label: 'SHA intervention code' }, { name: 'price', label: 'Cash price (KES)', type: 'money', required: true }, { name: 'vatable', label: 'VAT applicable', type: 'checkbox' }]}>{tabs}</CrudPage>;
}
