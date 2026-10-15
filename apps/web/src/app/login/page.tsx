'use client';
import { zodResolver } from '@/lib/zodResolver';
import { AlertTriangle, ArrowRight, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout } from '@/components/AuthLayout';
import { PasswordInput } from '@/components/PasswordInput';
import { Field, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const schema = z.object({ email: z.string().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') });

function LoginForm() {
  const { login, user, loading } = useAuth(); const router = useRouter(); const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const nextUrl = () => { const n = new URLSearchParams(window.location.search).get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard'; };
  useEffect(() => { if (!loading && user) router.replace(nextUrl()); }, [loading, user, router]);
  const onSubmit = handleSubmit(async (v) => {
    setErr('');
    try { await login(v.email.trim(), v.password); router.replace(nextUrl()); }
    catch (e) { setErr((e as Error).message === 'Invalid credentials' ? 'That email and password do not match an active account.' : (e as Error).message || 'Sign-in failed'); }
  });
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
