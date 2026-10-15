'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Card, Field, KV, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';

export default function ProfilePage() {
  const { user, reload } = useAuth(); const toast = useToast();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' }); const [busy, setBusy] = useState('');
  const [enrol, setEnrol] = useState<{ secret: string; otpauthUrl: string } | null>(null); const [code, setCode] = useState(''); const [disablePw, setDisablePw] = useState('');
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.push(ok, 'success'); } catch (e) { toast.push((e as Error).message, 'error'); } finally { setBusy(''); }
  };
  if (!user) return null;
  const u = user as any;
  return (
    <div className="max-w-3xl">
      <PageHeader title="My profile & security" subtitle={user.email} />
      <div className="grid gap-4">
        <Card title="Account"><KV items={[['Name', `${user.firstName} ${user.lastName}`], ['Roles', user.roles.join(', ') || (user.isSuperAdmin ? 'Platform super-admin' : '—')], ['Last sign-in', dateTime(u.lastLoginAt)], ['Password changed', dateTime(u.passwordChangedAt)], ['Two-factor', <StatusBadge key="m" status={user.mfaEnabled ? 'ENABLED' : 'DISABLED'} tone={user.mfaEnabled ? 'green' : 'amber'} />]]} /></Card>

        <Card title="Two-factor authentication (TOTP)">
          {!user.mfaEnabled && !enrol && <div className="space-y-3 text-sm"><p className="text-slate-500">Protect your account with an authenticator app such as Google Authenticator, Authy or Microsoft Authenticator.</p>
            <button className="btn-primary" disabled={busy === 'enrol'} onClick={() => run('enrol', async () => setEnrol(await api.post('/auth/mfa/enroll')), 'Scan the QR code, then enter a code')}>{busy === 'enrol' && <Spinner />}Set up two-factor</button></div>}
          {!user.mfaEnabled && enrol && <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-2"><div className="rounded bg-white p-3"><QRCodeSVG value={enrol.otpauthUrl} size={180} /></div><p className="break-all text-center font-mono text-xs text-slate-500">{enrol.secret}</p></div>
            <div className="space-y-3"><Field label="Enter the 6-digit code"><input className="input font-mono tracking-[0.3em]" maxLength={6} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
              <button className="btn-primary" disabled={code.length !== 6 || busy === 'verify'} onClick={() => run('verify', async () => { await api.post('/auth/mfa/verify', { code }); setEnrol(null); setCode(''); await reload(); }, 'Two-factor enabled')}>{busy === 'verify' && <Spinner />}Verify & enable</button></div>
          </div>}
          {user.mfaEnabled && <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Current code"><input className="input font-mono" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Password"><input className="input" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} /></Field>
            <div className="flex items-end"><button className="btn-secondary w-full text-red-700" disabled={code.length !== 6 || !disablePw || busy === 'disable'} onClick={() => run('disable', async () => { await api.post('/auth/mfa/disable', { code, password: disablePw }); setCode(''); setDisablePw(''); await reload(); }, 'Two-factor disabled')}>Disable 2FA</button></div>
          </div>}
        </Card>

        <Card title="Change password">
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault();
            if (pw.newPassword !== pw.confirm) { toast.push('Passwords do not match', 'error'); return; }
            run('pw', async () => { await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }); setPw({ currentPassword: '', newPassword: '', confirm: '' }); }, 'Password changed. Other sessions were signed out.'); }}>
            <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Field label="Confirm"><input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <p className="text-xs text-slate-500 sm:col-span-2">At least 10 characters, with upper and lower case letters, a digit and a symbol.</p>
            <button className="btn-primary" disabled={!pw.currentPassword || !pw.newPassword || busy === 'pw'}>{busy === 'pw' && <Spinner />}Change password</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
