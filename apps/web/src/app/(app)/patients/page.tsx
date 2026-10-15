'use client';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/DataTable';
import { PageHeader, StatusBadge } from '@/components/ui';
import { age, date, fullName } from '@/lib/format';

export default function Patients() {
  const router = useRouter();
  return (
    <div>
      <PageHeader title="Patients" subtitle="Search by name, MRN, phone or ID number" actions={<Link href="/patients/new" className="btn-primary"><UserPlus className="h-4 w-4" />Register patient</Link>} />
      <DataTable path="/patients" searchPlaceholder="Search patients…" onRowClick={(p: any) => router.push(`/patients/${p.id}`)} columns={[
        { key: 'mrn', header: 'MRN' },
        { key: 'name', header: 'Name', render: (p: any) => <span className="font-medium">{fullName(p)}</span> },
        { key: 'sex', header: 'Sex' },
        { key: 'age', header: 'Age', render: (p: any) => age(p.dateOfBirth) },
        { key: 'phone', header: 'Phone' },
        { key: 'idNumber', header: 'ID', render: (p: any) => p.idNumber ? `${p.idType ?? ''} ${p.idNumber}` : '—' },
        { key: 'crId', header: 'Client Registry', render: (p: any) => <StatusBadge status={p.crId || p.clientRegistryId ? 'VERIFIED' : 'PENDING'} /> },
        { key: 'createdAt', header: 'Registered', render: (p: any) => date(p.createdAt) },
      ]} />
    </div>
  );
}
