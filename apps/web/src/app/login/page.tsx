'use client';
import { zodResolver } from '@/lib/zodResolver';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Logo } from '@/components/AppShell';
import { Field, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const schema = z.object({ email: z.string().email(), password: z.string().min(1, 'Required') });

function LoginForm() {
  const { login } = useAuth(); const router = useRouter(); const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async (v) => {
    setErr('');
    try {
      await login(v.email, v.password);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
    } catch (e) { setErr((e as Error).message || 'Login failed'); }
  });
  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6">
      <div className="flex justify-center"><Logo className="text-lg" /></div>
      <h1 className="text-center text-lg font-semibold">Sign in to your facility</h1>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</p>}
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
