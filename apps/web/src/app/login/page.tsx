'use client';
import { zodResolver } from '@/lib/zodResolver';
import { AlertTriangle, ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout } from '@/components/AuthLayout';
import { PasswordInput } from '@/components/PasswordInput';
import { Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, type LoginResult } from '@/lib/auth';

const schema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') });

function LoginForm() {
  const { login, setSession, user, loading } = useAuth(); const router = useRouter(); const [err, setErr] = useState('');
  const [mfa, setMfa] = useState<LoginResult | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const nextUrl = () => { const n = new URLSearchParams(window.location.search).get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard'; };
  useEffect(() => { if (!loading && user) router.replace(nextUrl()); }, [loading, user, router]);
  const onSubmit = handleSubmit(async (v) => {
    setErr('');
    try {
      const r = await login(v.email.trim(), v.password);
      if (r.mfaRequired) {
        setMfa(r);
        if (r.mfaEnrollRequired) setSetup(await api.post('/auth/mfa/setup', { mfaToken: r.mfaToken }));
        return;
      }
      router.replace(nextUrl());
    }
    catch (e) { setErr((e as Error).message === 'Invalid credentials' ? 'That email and password do not match an active account.' : (e as Error).message || 'Sign-in failed'); }
  });
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api.post<LoginResult>('/auth/mfa/challenge', { mfaToken: mfa?.mfaToken, code });
      setSession(r.accessToken!, r.user!, r.refreshToken); router.replace(nextUrl());
    } catch (e) { setErr((e as Error).message || 'Verification failed'); } finally { setBusy(false); }
  };
  if (mfa) return (
    <form onSubmit={verify} className="authcard" noValidate>
      <img src="/hmis-logo.svg" alt="" className="mb-5 h-14 w-14" />
      <h1>{setup ? 'Set up two-factor sign-in' : 'Two-factor verification'}</h1>
      <p className="lead">{setup ? 'Your organisation requires two-factor sign-in. Scan the code with Google Authenticator, Microsoft Authenticator or Authy, then enter the 6-digit code.' : 'Enter the 6-digit code from your authenticator app.'}</p>
      {err && <div className="alert bad mb-4"><AlertTriangle />{err}</div>}
      {setup && <div className="mb-4 flex flex-col items-center gap-2">
        <div className="rounded-xl bg-white p-3"><QRCodeSVG value={setup.otpauthUrl} size={176} /></div>
        <p className="m-0 break-all font-mono text-xs text-slate-500">{setup.secret}</p>
      </div>}
      <div className="flex flex-col gap-4">
        <Field label="Verification code"><span className="input-icon"><ShieldCheck /><input className="input font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="Enter the 6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></span></Field>
        <button className="btn primary lg mt-1 w-full" disabled={busy || code.length !== 6}>{busy ? <Spinner /> : null}Verify<ArrowRight /></button>
        <button type="button" className="btn ghost w-full" onClick={() => { setMfa(null); setSetup(null); setCode(''); setErr(''); }}>Back to sign in</button>
      </div>
    </form>
  );
  return (
    <form onSubmit={onSubmit} className="authcard" noValidate>
      <img src="/hmis-logo.svg" alt="" className="mb-5 h-14 w-14" />
      <h1>Sign in to your facility</h1>
      <p className="lead">Welcome back. Use the email your administrator registered for you.</p>
      {err && <div className="alert bad mb-4"><AlertTriangle />{err}</div>}
      <div className="flex flex-col gap-4">
        <Field label="Email" error={errors.email?.message}><span className="input-icon"><Mail /><input className="input" type="email" autoComplete="email" placeholder="Enter your email" {...register('email')} /></span></Field>
        <Field label={<span className="flex justify-between"><span>Password</span><Link href="/forgot-password" className="text-[12.5px] font-semibold text-brand">Forgot password?</Link></span>} error={errors.password?.message}>
          <PasswordInput autoComplete="current-password" placeholder="Enter your password" {...register('password')} />
        </Field>
        <button className="btn primary lg mt-1 w-full" disabled={isSubmitting}>{isSubmitting ? <Spinner /> : null}Sign in<ArrowRight /></button>
      </div>
      <p className="m-0 mt-6 text-center text-sm text-slate-500">New facility? <Link href="/signup" className="font-bold text-brand">Create an account</Link></p>
      <p className="m-0 mt-2 text-center text-sm text-slate-500">Patient? <Link href="/portal/login" className="font-bold text-brand">Open the patient portal</Link></p>
    </form>
  );
}
export default function LoginPage() {
  return <AuthLayout><Suspense><LoginForm /></Suspense></AuthLayout>;
}
