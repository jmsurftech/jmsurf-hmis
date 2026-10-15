'use client';
import { AlertTriangle, Inbox, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/** Page title block: big title, one-line explanation, actions on the right (wrap under the title on phones). */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="pagehead">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="acts no-print">{actions}</div>}
    </div>
  );
}

const TONE_VAR: Record<string, string> = { primary: 'var(--brand)', brand: 'var(--brand)', blue: 'var(--info)', amber: 'var(--warn)', red: 'var(--bad)', green: 'var(--ok)', violet: 'var(--violet)', teal: 'var(--teal)' };
/** Stat tile in the SMS style: coloured icon + bold label, a large value, a muted line underneath. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', href, loading }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ElementType; tone?: keyof typeof TONE_VAR | string; href?: string; loading?: boolean }) {
  const body = (
    <>
      <div className="kpi-top">{Icon && <span className="ic"><Icon /></span>}<span className="lbl">{label}</span></div>
      <div className="val">{loading ? <span className="skeleton inline-block h-8 w-24 align-middle" /> : value ?? '—'}</div>
      {hint && <div className="sub">{hint}</div>}
    </>
  );
  const style = { ['--k' as string]: TONE_VAR[tone] ?? 'var(--brand)' } as React.CSSProperties;
  return href ? <a href={href} className="card kpi" style={style}>{body}</a> : <div className="card kpi" style={style}>{body}</div>;
}

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'violet' | 'brand' | 'teal';
const STATUS_MAP: Record<string, Tone> = {
  ACTIVE: 'green', PAID: 'green', COMPLETED: 'green', DONE: 'green', APPROVED: 'green', VERIFIED: 'green', ACCEPTED: 'green', DISPENSED: 'green', AVAILABLE: 'green', ELIGIBLE: 'green', SUCCESS: 'green', POSTED: 'green', SETTLED: 'green', RECEIVED: 'green', NORMAL: 'green', N: 'green', RECONCILED: 'green', ADMINISTERED: 'green', PRESENT: 'green', RESOLVED: 'green', FULFILLED: 'green', CLOSED_OK: 'green',
  OPEN: 'blue', SUBMITTED: 'blue', IN_PROGRESS: 'blue', CALLED: 'blue', SERVING: 'blue', SCHEDULED: 'blue', COLLECTED: 'blue', RESULTED: 'blue', ADMITTED: 'blue', IN_REVIEW: 'blue', BOOKED: 'blue', CONFIRMED: 'blue', ORDERED: 'blue', SENT: 'blue', INFO: 'blue', CHECKED_IN: 'blue', VALIDATED: 'blue',
  PENDING: 'amber', WAITING: 'amber', PARTIAL: 'amber', PARTIALLY_PAID: 'amber', PARTIALLY_APPROVED: 'amber', CLEANING: 'amber', RESERVED: 'amber', LOW: 'amber', WARNING: 'amber', ABNORMAL: 'amber', H: 'amber', L: 'amber', QUERIED: 'amber', REQUESTED: 'amber', PREAUTH_PENDING: 'amber', DUE: 'amber', MISSED: 'amber', ON_LEAVE: 'amber', INVESTIGATING: 'amber', HELD: 'amber',
  REJECTED: 'red', CANCELLED: 'red', FAILED: 'red', OCCUPIED: 'red', OVERDUE: 'red', CRITICAL: 'red', ERROR: 'red', EXPIRED: 'red', INELIGIBLE: 'red', HH: 'red', LL: 'red', STAT: 'red', SEVERE: 'red', NO_SHOW: 'red', VOID: 'red', DECEASED: 'red', REFUSED: 'red', HIGH: 'red',
  DRAFT: 'slate', CLOSED: 'slate', DISCHARGED: 'slate', INACTIVE: 'slate', MAINTENANCE: 'slate', ROUTINE: 'slate', SKIPPED: 'slate', MODERATE: 'amber', MILD: 'slate', MEDIUM: 'amber',
};
export function statusTone(s?: string | null): Tone { return (s && STATUS_MAP[s.toUpperCase()]) || 'slate'; }
export function StatusBadge({ status, tone, dot = true }: { status?: string | null; tone?: Tone; dot?: boolean }) {
  if (!status) return <span className="muted">—</span>;
  const t = tone ?? statusTone(status);
  return <span className={cn('badge', t !== 'slate' && t)}>{dot && <span className="dot" />}{humanize(status)}</span>;
}
export function humanize(s: string) { const t = String(s).replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }

export function EmptyState({ title = 'Nothing here yet', message, action, icon: Icon = Inbox }: { title?: string; message?: React.ReactNode; action?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="empty">
      <span className="ei"><Icon className="h-6 w-6" /></span>
      <b>{title}</b>
      {message && <p className="m-0 max-w-sm text-sm">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) { return <span className={cn('spinner', className)} style={{ width: 16, height: 16, borderWidth: 2 }} aria-label="Loading" />; }
export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3 p-2" aria-busy>{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-12" style={{ opacity: 1 - i * 0.18 }} />)}</div>;
}
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="alert warn mb-4"><AlertTriangle />{(error as Error).message || 'Could not load data'}</div>;
}

/** Centred glass dialog (a bottom sheet on phones). Esc and the backdrop close it. */
export function Modal({ open, onClose, title, subtitle, children, wide, xl, footer }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean; xl?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn('modal', wide && 'wide', xl && 'xl')} role="dialog" aria-modal>
        <div className="modal-head">
          <div className="min-w-0"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button onClick={onClose} className="btn ghost sm icon" aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, document.body);
}

/** Right-hand record panel. */
export function Drawer({ open, onClose, title, subtitle, children, footer, actions }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; actions?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(<>
    <div className="scrim" style={{ zIndex: 100 }} onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal>
      <div className="modal-head"><div className="min-w-0"><h2 className="truncate">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="flex items-center gap-2">{actions}<button onClick={onClose} className="btn ghost sm icon" aria-label="Close"><X /></button></div></div>
      <div className="modal-body flex-1">{children}</div>
      {footer && <div className="modal-foot" style={{ borderRadius: 0 }}>{footer}</div>}
    </aside>
  </>, document.body);
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: React.ReactNode; count?: number; icon?: React.ElementType }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="no-print block"><div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn('tab', value === t.id && 'on')}>
          {t.icon && <t.icon className="h-4 w-4" />}{t.label}{t.count != null && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div></div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return <div className="seg">{options.map((o) => <button key={o.id} type="button" className={cn(value === o.id && 'on')} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>;
}

export function Card({ title, subtitle, actions, children, className, bodyClass, flush }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string; flush?: boolean }) {
  return (
    <div className={cn('card', className)}>
      {title && <div className="card-head"><div className="min-w-0"><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</div>}
      <div className={cn(!flush && 'card-body', bodyClass)}>{children}</div>
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: React.ReactNode; error?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <label className={cn('field', className)}><span>{label}</span>{children}{error ? <small className="err">{error}</small> : hint ? <small>{hint}</small> : null}</label>;
}

export function KV({ items }: { items: [string, React.ReactNode][] }) {
  return <dl className="kv2">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v === undefined || v === null || v === '' ? <span className="muted">—</span> : v}</dd></div>)}</dl>;
}

export function Avatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  const ini = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  return <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), borderRadius: Math.round(size * 0.34) }}>{ini}</span>;
}

/** Thin progress bar 0-100. */
export function Progress({ value, tone }: { value: number; tone?: string }) {
  return <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} /></div>;
}
