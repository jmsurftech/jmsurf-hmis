'use client';
import { Inbox, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'primary' }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ElementType; tone?: 'primary' | 'blue' | 'amber' | 'red' | 'green' }) {
  const tones = { primary: 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300', blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300', green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
  return (
    <div className="card flex items-start justify-between p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value ?? '—'}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {Icon && <div className={cn('rounded-lg p-2', tones[tone])}><Icon className="h-5 w-5" /></div>}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};
const STATUS_MAP: Record<string, keyof typeof STATUS_TONES> = {
  ACTIVE: 'green', PAID: 'green', COMPLETED: 'green', DONE: 'green', APPROVED: 'green', VERIFIED: 'green', ACCEPTED: 'green', DISPENSED: 'green', AVAILABLE: 'green', ELIGIBLE: 'green', OPEN: 'blue', SUCCESS: 'green', POSTED: 'green', SETTLED: 'green', RECEIVED: 'green', NORMAL: 'green',
  PENDING: 'amber', WAITING: 'amber', DRAFT: 'slate', PARTIAL: 'amber', PARTIALLY_PAID: 'amber', SUBMITTED: 'blue', IN_PROGRESS: 'blue', CALLED: 'blue', SERVING: 'blue', SCHEDULED: 'blue', COLLECTED: 'blue', RESULTED: 'blue', CLEANING: 'amber', RESERVED: 'amber', LOW: 'amber', WARNING: 'amber', ABNORMAL: 'amber', H: 'amber', L: 'amber', QUERIED: 'amber', ADMITTED: 'blue',
  REJECTED: 'red', CANCELLED: 'red', FAILED: 'red', OCCUPIED: 'red', OVERDUE: 'red', CRITICAL: 'red', ERROR: 'red', EXPIRED: 'red', INELIGIBLE: 'red', HH: 'red', LL: 'red', CLOSED: 'slate', DISCHARGED: 'slate', INACTIVE: 'slate', MAINTENANCE: 'slate', INFO: 'blue',
};
export function StatusBadge({ status, tone }: { status?: string | null; tone?: keyof typeof STATUS_TONES }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const t = tone ?? STATUS_MAP[status.toUpperCase()] ?? 'slate';
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONES[t])}>{status.replace(/_/g, ' ')}</span>;
}

export function EmptyState({ title = 'Nothing here yet', message, action, icon: Icon = Inbox }: { title?: string; message?: string; action?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <Icon className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
      <p className="font-medium">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />; }
export function Loading() { return <div className="flex justify-center p-10 text-slate-400"><Spinner className="h-6 w-6" /></div>; }
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">{(error as Error).message || 'Could not load data'}</div>;
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={cn('card max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-xl', wide ? 'max-w-3xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.id ? 'border-primary-600 text-primary-700 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}>{t.label}</button>
      ))}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('card', className)}>
      {title && <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h3 className="text-sm font-semibold">{title}</h3>{actions}</div>}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
}

export function KV({ items }: { items: [string, React.ReactNode][] }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">{items.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v ?? '—'}</dd></div>)}</dl>;
}
