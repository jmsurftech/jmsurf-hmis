'use client';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AuthLayout } from '@/components/AuthLayout';
import { Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Enter a valid email address'); return; }
    setBusy(true);
    try { await api.post('/auth/forgot-password', { email: email.trim() }); setSent(true); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <form onSubmit={submit} className="authcard" noValidate>
        <img src="/hmis-logo.svg" alt="" className="mb-5 h-14 w-14" />
        {sent ? <>
          <h1>Check your email</h1>
          <p className="lead">If <b>{email}</b> belongs to an account, a link to choose a new password is on its way. It works once and expires in one hour.</p>
          <div className="alert ok"><MailCheck />Email sent. Look in spam if it does not arrive in a few minutes.</div>
        </> : <>
          <h1>Forgot your password?</h1>
          <p className="lead">Enter your email and we will send you a link to choose a new one.</p>
          <div className="flex flex-col gap-4">
            <Field label="Email" error={err}><span className="input-icon"><Mail /><input className="input" type="email" autoComplete="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} /></span></Field>
            <button className="btn primary lg w-full" disabled={busy}>{busy && <Spinner />}Send reset link</button>
          </div>
        </>}
        <Link href="/login" className="btn ghost mt-5 w-full"><ArrowLeft />Back to sign in</Link>
      </form>
    </AuthLayout>
  );
}
