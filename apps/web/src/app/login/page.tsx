'use client';
import { zodResolver } from '@/lib/zodResolver';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Logo } from '@/components/AppShell';
import { Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, type AuthUser, type LoginResult } from '@/lib/auth';

const schema = z.object({ email: z.string().email(), password: z.string().min(1, 'Required') });

function LoginForm() {
  const { login, setSession } = useAuth(); const router = useRouter(); const [err, setErr] = useState('');
  const [mfa, setMfa] = useState<LoginResult | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const go = (u?: AuthUser) => {
    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(next && next.startsWith('/') ? next : u?.isSuperAdmin && !u.tenantId ? '/superadmin' : '/dashboard');
  };
  const onSubmit = handleSubmit(async (v) => {
    setErr('');
    try {
      const r = await login(v.email, v.password);
      if (r.mfaRequired) {
        setMfa(r);
        if (r.mfaEnrollRequired) setSetup(await api.post('/auth/mfa/setup', { mfaToken: r.mfaToken }));
        return;
      }
      go(r.user);
    } catch (e) { setErr((e as Error).message || 'Login failed'); }
  });
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api.post<LoginResult>('/auth/mfa/challenge', { mfaToken: mfa?.mfaToken, code });
      setSession(r.accessToken!, r.user!, r.refreshToken); go(r.user);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const errBox = err && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</p>;
  if (mfa) return (
    <form onSubmit={verify} className="card w-full max-w-sm space-y-4 p-6">
      <div className="flex justify-center"><Logo className="text-lg" /></div>
      <h1 className="text-center text-lg font-semibold">{setup ? 'Set up two-factor authentication' : 'Two-factor verification'}</h1>
      {errBox}
      {setup && <div className="space-y-2 text-center text-sm">
        <p className="text-slate-500">Your organisation requires MFA. Scan this QR code with Google Authenticator, Authy or Microsoft Authenticator.</p>
        <div className="flex justify-center rounded bg-white p-3"><QRCodeSVG value={setup.otpauthUrl} size={176} /></div>
        <p className="break-all font-mono text-xs text-slate-500">{setup.secret}</p>
      </div>}
      <Field label="6-digit code"><input className="input text-center font-mono tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
      <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy && <Spinner />}Verify</button>
      <button type="button" className="w-full text-sm text-slate-500" onClick={() => { setMfa(null); setSetup(null); setCode(''); }}>Back to sign in</button>
    </form>
  );
  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6">
      <div className="flex justify-center"><Logo className="text-lg" /></div>
      <h1 className="text-center text-lg font-semibold">Sign in to your facility</h1>
      {errBox}
      <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register('email')} /></Field>
      <Field label="Password" error={errors.password?.message}><input className="input" type="password" autoComplete="current-password" {...register('password')} /></Field>
      <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting && <Spinner />}Sign in</button>
      <p className="text-center text-sm text-slate-500">New facility? <Link href="/signup" className="text-primary-600">Create an account</Link></p>
    </form>
  );
}
export default function LoginPage() {
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50 p-4 dark:from-slate-950 dark:to-slate-900"><Suspense><LoginForm /></Suspense></div>;
}
