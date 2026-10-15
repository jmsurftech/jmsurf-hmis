'use client';
import { ChevronRight, History, KeyRound, LogOut, Pill } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PasswordInput } from '@/components/PasswordInput';
import { Card, Field, KV, PageHeader, humanize } from '@/components/ui';
import { date } from '@/lib/format';
import { portalStore, usePortal, usePortalAction } from '@/lib/portal';

export default function Account() {
  const router = useRouter(); const me = usePortal('/me'); const p = me.data?.patient;
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const save = usePortalAction('/password', { success: 'Password saved. You can now sign in with it.', onSuccess: () => { setPw(''); setPw2(''); } });
  return (
    <div>
      <PageHeader title="My account" subtitle={me.data?.hospital?.name} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:hidden">
        {[{ href: '/portal/medicines', label: 'Medicines', icon: Pill }, { href: '/portal/visits', label: 'Visit history and download', icon: History }].map((l) => (
          <Link key={l.href} href={l.href} className="card card-body flex items-center gap-3 text-inherit no-underline"><l.icon className="h-5 w-5 text-brand" /><b className="flex-1">{l.label}</b><ChevronRight className="h-4 w-4 text-slate-400" /></Link>))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your details" subtitle="Kept by the hospital. Ask the front desk to change them.">
          {p && <KV items={[['Name', [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ')], ['Hospital number', p.mrn], ['Sex', humanize(p.sex)], ['Date of birth', date(p.dateOfBirth)], ['Phone', p.phone], ['Email', p.email], ['County', p.county]]} />}
        </Card>
        <Card title={me.data?.hasPassword ? 'Change password' : 'Set a password'} subtitle="Optional. With a password you can sign in without waiting for a code.">
          <div className="grid gap-3">
            <Field label="New password" hint="At least 8 characters."><PasswordInput autoComplete="new-password" placeholder="Enter a new password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Repeat password" error={pw2 && pw !== pw2 ? 'The passwords do not match' : undefined}><PasswordInput autoComplete="new-password" placeholder="Enter it again" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <button className="btn primary" disabled={pw.length < 8 || pw !== pw2 || save.isPending} onClick={() => save.mutate({ password: pw })}><KeyRound />Save password</button>
          </div>
        </Card>
      </div>
      <button className="btn mt-5" onClick={() => { portalStore.clear(); router.replace('/portal/login'); }}><LogOut />Sign out</button>
    </div>
  );
}
