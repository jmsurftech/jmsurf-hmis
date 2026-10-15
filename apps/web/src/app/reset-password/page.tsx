'use client';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { AuthLayout } from '@/components/AuthLayout';
import { PasswordInput } from '@/components/PasswordInput';
import { Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

function ResetForm() {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords do not match.');
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    setBusy(true);
    try { await api.post('/auth/reset-password', { token, password: pw }); setDone(true); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="authcard" noValidate>
      <img src="/hmis-logo.svg" alt="" className="mb-5 h-14 w-14" />
      {done ? <>
        <h1>Password changed</h1>
        <p className="lead">You can now sign in with your new password.</p>
        <div className="alert ok mb-5"><CheckCircle2 />Your password has been updated.</div>
        <Link href="/login" className="btn primary lg w-full">Sign in</Link>
      </> : <>
        <h1>Choose a new password</h1>
        <p className="lead">Use at least 8 characters. Avoid passwords you use elsewhere.</p>
        {err && <div className="alert bad mb-4"><AlertTriangle />{err}</div>}
        <div className="flex flex-col gap-4">
          <Field label="New password"><PasswordInput autoComplete="new-password" placeholder="Enter a new password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Confirm new password"><PasswordInput autoComplete="new-password" placeholder="Enter it again" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <button className="btn primary lg w-full" disabled={busy}>{busy && <Spinner />}Save new password</button>
        </div>
      </>}
    </form>
  );
}
export default function ResetPassword() { return <AuthLayout><Suspense><ResetForm /></Suspense></AuthLayout>; }
