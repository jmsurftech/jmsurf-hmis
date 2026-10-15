'use client';
import { zodResolver } from '@/lib/zodResolver';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Logo } from '@/components/AppShell';
import { Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, type AuthUser } from '@/lib/auth';
import { cn } from '@/lib/cn';

const schema = z.object({
  organisationName: z.string().min(2, 'Required'),
  kmhflCode: z.string().optional(),
  countryCode: z.string().min(2),
  plan: z.string().optional(),
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(10, 'At least 10 characters').regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter').regex(/\d/, 'Add a digit').regex(/[^A-Za-z0-9]/, 'Add a symbol'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type F = z.infer<typeof schema>;
const steps = ['Organisation', 'Facility', 'Admin user', 'Review'];
const stepFields: (keyof F)[][] = [['organisationName', 'countryCode'], ['kmhflCode', 'plan'], ['firstName', 'lastName', 'email', 'phone', 'password', 'confirm'], []];
const COUNTRIES = [['KE', 'Kenya'], ['UG', 'Uganda'], ['TZ', 'Tanzania'], ['RW', 'Rwanda'], ['ET', 'Ethiopia'], ['GH', 'Ghana'], ['NG', 'Nigeria'], ['ZM', 'Zambia'], ['ZA', 'South Africa']];

export default function Signup() {
  const [step, setStep] = useState(0); const [err, setErr] = useState('');
  const { setSession } = useAuth(); const router = useRouter();
  const { register, handleSubmit, trigger, getValues, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { countryCode: 'KE', plan: 'HOSPITAL' } });
  const next = async () => { if (await trigger(stepFields[step])) setStep(step + 1); };
  const submit = handleSubmit(async ({ confirm: _c, plan: _p, ...v }) => {
    setErr('');
    try {
      const r = await api.post<{ accessToken: string; refreshToken?: string; user: AuthUser }>('/auth/signup', v);
      setSession(r.accessToken, r.user, r.refreshToken); router.replace('/dashboard');
    } catch (e) { setErr((e as Error).message); }
  });
  const v = getValues();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="card w-full max-w-lg p-6">
        <div className="mb-4 flex justify-center"><Logo className="text-lg" /></div>
        <ol className="mb-6 flex items-center justify-between">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center text-xs">
              <span className={cn('mb-1 flex h-7 w-7 items-center justify-center rounded-full border text-xs', i < step ? 'border-primary-600 bg-primary-600 text-white' : i === step ? 'border-primary-600 text-primary-700' : 'border-slate-300 text-slate-400')}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>{s}
            </li>
          ))}
        </ol>
        {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</p>}
        <form onSubmit={(e) => { e.preventDefault(); step === 3 ? submit() : next(); }} className="space-y-4">
          {step === 0 && <>
            <Field label="Organisation name" error={errors.organisationName?.message}><input className="input" placeholder="e.g. Mercy Medical Centre" {...register('organisationName')} /></Field>
            <Field label="Country"><select className="input" {...register('countryCode')}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
          </>}
          {step === 1 && <>
            <Field label="KMHFL / KMHFR facility code (Kenya)"><input className="input" placeholder="e.g. 13023" {...register('kmhflCode')} /></Field>
            <Field label="Plan"><select className="input" {...register('plan')}><option value="CLINIC">Clinic: KES 4,999/mo</option><option value="HOSPITAL">Hospital: KES 14,999/mo</option><option value="PER_VISIT">Per visit: KES 49/visit</option><option value="ENTERPRISE">Enterprise: custom</option></select></Field>
            <p className="text-xs text-slate-500">No setup fee. You can change plans later.</p>
          </>}
          {step === 2 && <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={errors.firstName?.message}><input className="input" {...register('firstName')} /></Field>
            <Field label="Last name" error={errors.lastName?.message}><input className="input" {...register('lastName')} /></Field>
            <Field label="Email" error={errors.email?.message} className="col-span-2"><input className="input" type="email" {...register('email')} /></Field>
            <Field label="Phone" className="col-span-2"><input className="input" placeholder="+2547…" {...register('phone')} /></Field>
            <Field label="Password" error={errors.password?.message}><input className="input" type="password" {...register('password')} /></Field>
            <Field label="Confirm" error={errors.confirm?.message}><input className="input" type="password" {...register('confirm')} /></Field>
          </div>}
          {step === 3 && <dl className="space-y-2 text-sm">
            {[['Organisation', v.organisationName], ['Country', v.countryCode], ['KMHFL code', v.kmhflCode || '—'], ['Plan', v.plan], ['Admin', `${v.firstName} ${v.lastName} <${v.email}>`]].map(([k, x]) => <div key={k} className="flex justify-between border-b border-slate-100 pb-1 dark:border-slate-800"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{x}</dd></div>)}
          </dl>}
          <div className="flex justify-between pt-2">
            {step > 0 ? <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>Back</button> : <Link href="/login" className="btn-secondary">Sign in instead</Link>}
            <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />}{step === 3 ? 'Create facility' : 'Continue'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
