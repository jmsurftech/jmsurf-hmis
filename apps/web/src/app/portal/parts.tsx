'use client';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
export const Box = ({ title, children, className, action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) => (
  <section className={cn('mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>
    {title && <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>}
    {children}
  </section>
);
export const Busy = () => <div className="flex justify-center p-6 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
export const Empty = ({ text }: { text: string }) => <p className="py-4 text-center text-sm text-slate-500">{text}</p>;
export const Err = ({ error }: { error: unknown }) => error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null;
export const Pill = ({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) => {
  const t = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', blue: 'bg-blue-100 text-blue-800' }[tone];
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', t)}>{children}</span>;
};
