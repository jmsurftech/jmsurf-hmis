'use client';
import { ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { PasswordInput } from '@/components/PasswordInput';
import { useToast } from '@/components/Toast';
import { Card, Field, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const isDemo = (e: string) => e.toLowerCase().endsWith('@demo.jmsurf.health');

/** TOTP two-factor sign-in: enrol with an authenticator app, verify, or turn off (code + password). */
export function TwoFactorCard() {
  const { user, reload } = useAuth(); const toast = useToast();
  const [enrol, setEnrol] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState('');
  if (!user) return null;
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.push(ok, 'success'); } catch (e) { toast.push((e as Error).message, 'error'); } finally { setBusy(''); }
  };
  const codeInput = <input className="input font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Enter the 6-digit code" />;
  return (
    <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand" />Two-factor sign-in</span>}
      actions={<StatusBadge status={user.mfaEnabled ? 'ENABLED' : 'OFF'} tone={user.mfaEnabled ? 'green' : 'amber'} />}>
      {isDemo(user.email) ? <p className="m-0 text-sm text-slate-500">Demo accounts are shared, so two-factor sign-in is not available on them.</p>
        : !user.mfaEnabled && !enrol ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="m-0 max-w-xl text-slate-500">Protect your account with an authenticator app such as Google Authenticator, Microsoft Authenticator or Authy. You will enter a code from the app each time you sign in.</p>
            <button className="btn primary sm" disabled={busy === 'enrol'} onClick={() => run('enrol', async () => setEnrol(await api.post('/auth/mfa/enroll')), 'Scan the code, then enter the 6-digit code')}>{busy === 'enrol' ? <Spinner /> : <ShieldCheck />}Set up</button>
          </div>
        ) : !user.mfaEnabled && enrol ? (
          <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2"><div className="rounded-xl bg-white p-3"><QRCodeSVG value={enrol.otpauthUrl} size={160} /></div><span className="break-all font-mono text-xs text-slate-500">{enrol.secret}</span></div>
            <div className="flex flex-col gap-3">
              <Field label="Code from the app">{codeInput}</Field>
              <button className="btn primary" disabled={code.length !== 6 || busy === 'verify'} onClick={() => run('verify', async () => { await api.post('/auth/mfa/verify', { code }); setEnrol(null); setCode(''); await reload(); }, 'Two-factor sign-in is on')}>{busy === 'verify' && <Spinner />}Verify and turn on</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Code from the app">{codeInput}</Field>
            <Field label="Your password"><PasswordInput autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter your password" /></Field>
            <div className="flex items-end"><button className="btn danger w-full" disabled={code.length !== 6 || !pw || busy === 'disable'} onClick={() => run('disable', async () => { await api.post('/auth/mfa/disable', { code, password: pw }); setCode(''); setPw(''); await reload(); }, 'Two-factor sign-in is off')}>{busy === 'disable' && <Spinner />}Turn off</button></div>
          </div>
        )}
    </Card>
  );
}
