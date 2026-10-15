'use client';
import { KeyRound, Save, UserCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PasswordInput } from '@/components/PasswordInput';
import { useToast } from '@/components/Toast';
import { Avatar, Card, Field, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { humanize } from '@/components/ui';

export default function Account() {
  const { user } = useAuth(); const toast = useToast(); const { dark, toggle } = useTheme();
  const [p, setP] = useState({ firstName: '', lastName: '', phone: '' }); const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' }); const [changing, setChanging] = useState(false);
  useEffect(() => { if (user) setP({ firstName: user.firstName, lastName: user.lastName, phone: (user as any).phone ?? '' }); }, [user]);
  if (!user) return null;
  const save = async () => {
    setSaving(true);
    try { await api.patch('/auth/me', p); toast.push('Profile saved', 'success'); setTimeout(() => window.location.reload(), 600); } catch (e) { toast.push((e as Error).message, 'error'); } finally { setSaving(false); }
  };
  const change = async () => {
    if (pw.newPassword.length < 8) return toast.push('Use at least 8 characters for the new password', 'warn');
    if (pw.newPassword !== pw.confirm) return toast.push('The new passwords do not match', 'warn');
    setChanging(true);
    try { await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }); toast.push('Password changed', 'success'); setPw({ currentPassword: '', newPassword: '', confirm: '' }); }
    catch (e) { toast.push((e as Error).message, 'error'); } finally { setChanging(false); }
  };
  return (
    <div>
      <PageHeader title="My account" subtitle="Your profile, password and display preferences." />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Avatar name={`${user.firstName} ${user.lastName}`} size={84} />
            <div><b className="text-lg">{user.firstName} {user.lastName}</b><p className="m-0 text-sm text-slate-500">{user.email}</p></div>
            <div className="flex flex-wrap justify-center gap-1.5">{user.roles.map((r) => <span key={r} className="badge brand">{humanize(r)}</span>)}</div>
            {user.tenant?.name && <p className="m-0 text-sm text-slate-500">{user.tenant.name}</p>}
          </div>
          <div className="divider" />
          <div className="flex items-center justify-between"><span className="text-sm font-semibold">Dark mode</span><button className="btn sm" onClick={toggle}>{dark ? 'Turn off' : 'Turn on'}</button></div>
        </Card>
        <div className="flex flex-col gap-5">
          <Card title={<span className="flex items-center gap-2"><UserCircle2 className="h-5 w-5 text-brand" />Profile</span>} actions={<button className="btn primary sm" onClick={save} disabled={saving}>{saving ? <Spinner /> : <Save />}Save</button>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name"><input className="input" value={p.firstName} onChange={(e) => setP({ ...p, firstName: e.target.value })} placeholder="Enter your first name" /></Field>
              <Field label="Last name"><input className="input" value={p.lastName} onChange={(e) => setP({ ...p, lastName: e.target.value })} placeholder="Enter your last name" /></Field>
              <Field label="Phone"><input className="input" type="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} placeholder="Enter your phone number" /></Field>
              <Field label="Email" hint="Ask an administrator to change your sign-in email."><input className="input" value={user.email} disabled /></Field>
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-brand" />Change password</span>} actions={<button className="btn primary sm" onClick={change} disabled={changing || !pw.currentPassword}>{changing ? <Spinner /> : <KeyRound />}Change</button>}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Current password"><PasswordInput autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} placeholder="Enter your current password" /></Field>
              <Field label="New password"><PasswordInput autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} placeholder="At least 8 characters" /></Field>
              <Field label="Confirm new password"><PasswordInput autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Enter it again" /></Field>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
