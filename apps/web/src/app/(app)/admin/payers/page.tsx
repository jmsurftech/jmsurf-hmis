'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { Tabs } from '@/components/ui';
import { money } from '@/lib/format';
import { PICK } from '@/lib/pickers';
export default function Payers() {
  const [tab, setTab] = useState('payers');
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'payers', label: 'Payers' }, { id: 'schemes', label: 'Schemes' }]} />;
  if (tab === 'schemes') return <CrudPage title="Payers & schemes" path="/payers/schemes" createLabel="New scheme" searchable={false} columns={[{ key: 'name', header: 'Scheme' }, { key: 'payer', header: 'Payer', render: (s: any) => s.payer?.name ?? '—' }, { key: 'copayPercent', header: 'Co-pay %' }, { key: 'annualLimitMinor', header: 'Annual limit', render: (s: any) => money(s.annualLimitMinor) }, { key: 'requiresPreauthAboveMinor', header: 'Pre-auth above', render: (s: any) => money(s.requiresPreauthAboveMinor) }]}
    transform={(v) => ({ ...v, copayPercent: v.copayPercent === undefined ? undefined : Number(v.copayPercent) })}
    fields={[{ name: 'payerId', label: 'Payer', type: 'picker', source: PICK.payer, required: true }, { name: 'name', label: 'Scheme name', required: true }, { name: 'copayPercent', label: 'Co-pay %', type: 'number' }, { name: 'annualLimit', label: 'Annual limit (KES)', type: 'money' }, { name: 'requiresPreauthAbove', label: 'Pre-auth required above (KES)', type: 'money' }]}>{tabs}</CrudPage>;
  return <CrudPage title="Payers & schemes" path="/payers" createLabel="New payer" searchable={false} columns={[{ key: 'name', header: 'Payer' }, { key: 'type', header: 'Type' }, { key: 'code', header: 'Code' }, { key: 'integration', header: 'Integration', render: (p: any) => p.integration ?? '—' }, { key: 'schemes', header: 'Schemes', render: (p: any) => p.schemes?.length ?? 0 }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['SHA', 'INSURER', 'CORPORATE', 'GOVERNMENT'], required: true }, { name: 'code', label: 'Code' }, { name: 'integration', label: 'Integration', type: 'select', options: ['manual', 'sha-hie', 'smart', 'slade360'] }]}>{tabs}</CrudPage>;
}
