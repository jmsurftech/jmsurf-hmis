'use client';
import { zodResolver } from '@/lib/zodResolver';
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, Hospital, Stethoscope, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout } from '@/components/AuthLayout';
import { PasswordInput } from '@/components/PasswordInput';
import { Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, type AuthUser } from '@/lib/auth';
import { cn } from '@/lib/cn';

const schema = z.object({
  organisationName: z.string().trim().min(2, 'Enter the organisation name'),
  kmhflCode: z.string().optional(),
  countryCode: z.string().min(2),
  plan: z.string(),
  firstName: z.string().trim().min(1, 'Enter your first name'),
  lastName: z.string().trim().min(1, 'Enter your last name'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().optional(),
  password: z.string().min(10, 'Use at least 10 characters').regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter').regex(/\d/, 'Add a digit').regex(/[^A-Za-z0-9]/, 'Add a symbol'),
  confirm: z.string(),
  terms: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue' }) }),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match' });
type F = z.infer<typeof schema>;
const STEPS = ['Organisation', 'Plan', 'Your account', 'Review'];
const STEP_FIELDS: (keyof F)[][] = [['organisationName', 'countryCode', 'kmhflCode'], ['plan'], ['firstName', 'lastName', 'email', 'phone', 'password', 'confirm'], ['terms']];
const COUNTRIES = [['KE', 'Kenya'], ['UG', 'Uganda'], ['TZ', 'Tanzania'], ['RW', 'Rwanda'], ['ET', 'Ethiopia'], ['GH', 'Ghana'], ['NG', 'Nigeria'], ['ZM', 'Zambia'], ['ZA', 'South Africa']];
const PLANS = [
  { id: 'CLINIC', icon: Stethoscope, name: 'Clinic', price: 'KES 4,999 / month', d: 'Outpatient clinics and medical centres' },
  { id: 'HOSPITAL', icon: Hospital, name: 'Hospital', price: 'KES 14,999 / month', d: 'Inpatient care, theatre, maternity, dialysis' },
  { id: 'PER_VISIT', icon: Users, name: 'Per visit', price: 'KES 49 / visit', d: 'Low-volume or seasonal clinics' },
  { id: 'ENTERPRISE', icon: Building2, name: 'Enterprise', price: 'Custom', d: 'Groups and networks with many facilities' },
];

export default function Signup() {
  const [step, setStep] = useState(0); const [err, setErr] = useState('');
  const { setSession } = useAuth(); const router = useRouter();
  const { register, handleSubmit, trigger, getValues, setValue, watch, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { countryCode: 'KE', plan: 'HOSPITAL' } as any });
  const next = async () => { if (await trigger(STEP_FIELDS[step])) setStep(step + 1); };
  const submit = handleSubmit(async ({ confirm: _c, terms: _t, ...v }) => {
    setErr('');
    try {
      const r = await api.post<{ accessToken: string; refreshToken?: string; user: AuthUser }>('/auth/signup', { ...v, kmhflCode: v.kmhflCode || undefined, phone: v.phone || undefined });
      setSession(r.accessToken, r.user, r.refreshToken); router.replace('/dashboard?welcome=1');
    } catch (e) { setErr((e as Error).message); }
  }, () => setErr('Some details need attention. Go back and check each step.'));
  const v = getValues(); const plan = watch('plan');
  return (
    <AuthLayout>
      <div className="authcard lg">
        <div className="mb-6 flex items-center gap-3"><img src="/hmis-logo.svg" alt="" className="h-12 w-12" /><div><h1>Create your facility</h1><p className="m-0 text-sm text-slate-500">30-day free trial. No setup fee.</p></div></div>
        <div className="steps">{STEPS.map((s, i) => <div key={s} className={cn(i === step && 'cur')}><i className={cn(i <= step && 'on')} /><span>{s}</span></div>)}</div>
        {err && <div className="alert bad mb-4"><AlertTriangle />{err}</div>}
        <form onSubmit={(e) => { e.preventDefault(); step === 3 ? submit() : next(); }} className="flex flex-col gap-4" noValidate>
          {step === 0 && <>
            <Field label="Organisation name" error={errors.organisationName?.message} hint="The hospital, clinic or group as patients know it."><input className="input" placeholder="Enter your organisation name" autoFocus {...register('organisationName')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country"><select className="input" {...register('countryCode')}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
              <Field label="KMHFL / KMHFR code" hint="Kenya facilities. Optional now."><input className="input" inputMode="numeric" placeholder="Enter the facility code" {...register('kmhflCode')} /></Field>
            </div>
          </>}
          {step === 1 && <div className="grid gap-3 sm:grid-cols-2">
            {PLANS.map((p) => (
              <button type="button" key={p.id} onClick={() => setValue('plan', p.id)} className={cn('tile flex-col items-start', plan === p.id && '!border-[var(--brand)] ring-4 ring-[rgb(189_35_50/.12)]')}>
                <span className="flex w-full items-center justify-between"><span className="ti"><p.icon /></span>{plan === p.id && <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--brand)] text-white"><Check className="h-4 w-4" /></span>}</span>
                <b className="mt-2 text-[15px]">{p.name}</b><span className="text-sm font-bold text-brand">{p.price}</span><small>{p.d}</small>
              </button>
            ))}
            <p className="m-0 text-xs text-slate-500 sm:col-span-2">You can change plans at any time. Prices exclude VAT.</p>
          </div>}
          {step === 2 && <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.firstName?.message}><input className="input" autoComplete="given-name" placeholder="Enter your first name" {...register('firstName')} /></Field>
            <Field label="Last name" error={errors.lastName?.message}><input className="input" autoComplete="family-name" placeholder="Enter your last name" {...register('lastName')} /></Field>
            <Field label="Work email" error={errors.email?.message} className="sm:col-span-2" hint="You will sign in with this."><input className="input" type="email" autoComplete="email" placeholder="Enter your email" {...register('email')} /></Field>
            <Field label="Phone" className="sm:col-span-2" hint="Optional. Include the country code."><input className="input" type="tel" autoComplete="tel" placeholder="Enter your phone number" {...register('phone')} /></Field>
            <Field label="Password" error={errors.password?.message}><PasswordInput autoComplete="new-password" placeholder="10+ characters, upper, lower, digit, symbol" {...register('password')} /></Field>
            <Field label="Confirm password" error={errors.confirm?.message}><PasswordInput autoComplete="new-password" placeholder="Enter it again" {...register('confirm')} /></Field>
          </div>}
          {step === 3 && <>
            <dl className="kv2 rounded-2xl border border-[var(--glass-edge)] bg-white/60 p-4 dark:bg-slate-800/40">
              {[['Organisation', v.organisationName], ['Country', COUNTRIES.find(([c]) => c === v.countryCode)?.[1]], ['KMHFL code', v.kmhflCode || 'Not given'], ['Plan', PLANS.find((p) => p.id === v.plan)?.name], ['Administrator', `${v.firstName} ${v.lastName}`], ['Email', v.email]].map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x}</dd></div>)}
            </dl>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5" {...register('terms')} /><span>I agree to the terms of service and confirm that this facility will process patient data under the Data Protection Act.</span></label>
            {errors.terms && <small className="err -mt-2 text-xs font-semibold text-[var(--bad)]">{errors.terms.message}</small>}
          </>}
          <div className="mt-2 flex justify-between gap-3">
            {step > 0 ? <button type="button" className="btn" onClick={() => setStep(step - 1)}><ArrowLeft />Back</button> : <Link href="/login" className="btn ghost">I already have an account</Link>}
            <button className="btn primary" disabled={isSubmitting}>{isSubmitting && <Spinner />}{step === 3 ? 'Create facility' : 'Continue'}{step < 3 && <ArrowRight />}</button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
