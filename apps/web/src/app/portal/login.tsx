'use client';
import { HeartPulse } from 'lucide-react';
import { useEffect, useState } from 'react';
import { portal, portalStore } from '@/lib/portal';

export function PortalLogin({ onDone }: { onDone: () => void }) {
  const [tenant, setTenant] = useState('demo');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tenant') ?? portalStore.tenant();
    if (t) setTenant(t);
  }, []);
  const request = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await portal.post<any>('/portal/auth/request-otp', { tenant, phone });
      setStep('code'); setMsg(`We sent a 6-digit code to ${r.phone}.${r.devOtp ? ` (Demo code: ${r.devOtp})` : ''}`);
      if (r.devOtp) setCode(r.devOtp);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await portal.post<any>('/portal/auth/verify', { tenant, phone, code });
      portalStore.set(r.accessToken, tenant); portalStore.setSubject(null); onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-white p-4 dark:from-slate-900 dark:to-slate-950">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2"><span className="rounded-lg bg-primary-600 p-2 text-white"><HeartPulse className="h-5 w-5" /></span>
          <div><h1 className="font-semibold">Patient portal</h1><p className="text-xs text-slate-500">Lango la wagonjwa</p></div></div>
        {step === 'phone' ? (
          <form onSubmit={request} className="space-y-3">
            <div><label className="label">Facility code</label><input className="input" value={tenant} onChange={(e) => setTenant(e.target.value.trim().toLowerCase())} required /></div>
            <div><label className="label">Phone number / Nambari ya simu</label><input className="input" inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
            <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            {msg && <p className="rounded-lg bg-primary-50 p-2 text-xs text-primary-800 dark:bg-primary-900/30 dark:text-primary-200">{msg}</p>}
            <div><label className="label">6-digit code</label><input className="input text-center text-lg tracking-[0.5em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus /></div>
            <button className="btn-primary w-full justify-center" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Log in'}</button>
            <button type="button" className="w-full text-xs text-slate-500 underline" onClick={() => { setStep('phone'); setCode(''); setMsg(null); }}>Use a different number</button>
          </form>
        )}
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}
