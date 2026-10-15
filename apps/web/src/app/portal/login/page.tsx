'use client';
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, KeyRound, MessageSquareText, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthLayout } from '@/components/AuthLayout';
import { PasswordInput } from '@/components/PasswordInput';
import { Field, Seg, Spinner } from '@/components/ui';
import { portal, portalStore, type PortalAccount } from '@/lib/portal';

type Step = 'id' | 'code' | 'pick';

export default function PortalLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<'otp' | 'password'>('otp'); const [step, setStep] = useState<Step>('id');
  const [identifier, setIdentifier] = useState(''); const [code, setCode] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [info, setInfo] = useState('');
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  useEffect(() => { if (portalStore.get()) router.replace('/portal'); }, [router]);

  const finish = (list: PortalAccount[]) => {
    if (list.length === 1) { portalStore.set(list[0]); router.replace('/portal'); return; }
    setAccounts(list); setStep('pick');
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const sendCode = () => run(async () => {
    const r = await portal.post<{ channel: string }>('/otp/request', { identifier });
    setInfo(r.channel === 'email' ? 'If this email is on file at a hospital, we have sent a 6-digit code to it.' : 'If this number is on file at a hospital, we have sent a 6-digit code by SMS.');
    setStep('code');
  });
  const verify = () => run(async () => finish((await portal.post<{ accounts: PortalAccount[] }>('/otp/verify', { identifier, code })).accounts));
  const login = () => run(async () => finish((await portal.post<{ accounts: PortalAccount[] }>('/login', { identifier, password })).accounts));

  return (
    <AuthLayout>
      <form className="authcard" noValidate onSubmit={(e) => { e.preventDefault(); if (step === 'id') (mode === 'otp' ? sendCode() : login()); else if (step === 'code') verify(); }}>
        <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><UserRound className="h-7 w-7" /></span>
        <h1>Patient portal</h1>
        <p className="lead">See your bookings, results, medicines and bills, and pay with M-Pesa.</p>
        {err && <div className="alert bad mb-4"><AlertTriangle />{err}</div>}

        {step === 'id' && <div className="flex flex-col gap-4">
          <Seg options={[{ id: 'otp', label: 'One-time code' }, { id: 'password', label: 'Password' }]} value={mode} onChange={(m) => { setMode(m); setErr(''); }} />
          <Field label="Phone number or email" hint="Use the one you gave the hospital at registration."><input className="input" autoComplete="username" placeholder="Enter your phone number or email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></Field>
          {mode === 'password' && <Field label="Password"><PasswordInput autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
          <button className="btn primary lg w-full" disabled={busy || identifier.trim().length < 5 || (mode === 'password' && !password)}>{busy ? <Spinner /> : mode === 'otp' ? <MessageSquareText /> : <KeyRound />}{mode === 'otp' ? 'Send me a code' : 'Sign in'}<ArrowRight /></button>
          {mode === 'password' && <p className="m-0 text-center text-xs text-slate-500">No password yet? Sign in with a code first, then set one under My account.</p>}
        </div>}

        {step === 'code' && <div className="flex flex-col gap-4">
          {info && <div className="alert info"><MessageSquareText />{info}</div>}
          <Field label="6-digit code"><input className="input text-center text-2xl font-extrabold tracking-[.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
          <button className="btn primary lg w-full" disabled={busy || code.length !== 6}>{busy ? <Spinner /> : null}Verify and sign in<ArrowRight /></button>
          <div className="flex justify-between text-sm"><button type="button" className="btn ghost sm" onClick={() => { setStep('id'); setCode(''); }}><ArrowLeft />Change</button><button type="button" className="btn ghost sm" disabled={busy} onClick={sendCode}>Send a new code</button></div>
        </div>}

        {step === 'pick' && <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-semibold">You have records at more than one hospital. Choose one:</p>
          {accounts.map((a) => <button type="button" key={a.token} className="btn lg w-full justify-start text-left" onClick={() => { portalStore.set(a); router.replace('/portal'); }}>
            <Building2 /><span className="min-w-0"><b className="block truncate">{a.hospital.name}</b><small className="text-slate-500">{a.patient.firstName} {a.patient.lastName} · {a.patient.mrn}</small></span></button>)}
        </div>}

        <p className="m-0 mt-6 text-center text-sm text-slate-500">Hospital staff? <Link href="/login" className="font-bold text-brand">Staff sign-in</Link></p>
      </form>
    </AuthLayout>
  );
}
