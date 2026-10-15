/** SaaS plan pricing (KES minor units) and dunning transitions. Pure functions — unit tested. */
export const PLAN_BASE_MINOR: Record<string, number | null> = { CLINIC: 4_999_00, HOSPITAL: 14_999_00, ENTERPRISE: null };
export const PER_VISIT_MINOR = 49_00;
export const INVOICE_DUE_DAYS = 7;
export const GRACE_AFTER_DUE_DAYS = 0; // overdue → GRACE immediately
export const READ_ONLY_AFTER_DUE_DAYS = 14; // still unpaid 14 days after due → READ_ONLY
export const TRIAL_GRACE_DAYS = 7;

export interface InvoiceCalc { baseMinor: number; visits: number; perVisitMinor: number; amountMinor: number }

/**
 * Monthly invoice = plan base fee + KES 49 × OPD/IPD visits in the period.
 * ENTERPRISE has a custom base (tenant.settings.customMonthlyMinor) and may override per-visit (settings.perVisitMinor).
 */
export function calcInvoice(plan: string, visits: number, settings: { customMonthlyMinor?: number; perVisitMinor?: number } = {}): InvoiceCalc {
  const base = PLAN_BASE_MINOR[plan] ?? null;
  const baseMinor = base ?? Math.max(0, Math.round(settings.customMonthlyMinor ?? 0));
  const perVisitMinor = Number.isInteger(settings.perVisitMinor) ? settings.perVisitMinor! : PER_VISIT_MINOR;
  const v = Math.max(0, Math.floor(visits));
  return { baseMinor, visits: v, perVisitMinor, amountMinor: baseMinor + v * perVisitMinor };
}

/** Billing period helpers: `YYYY-MM` of the month before `now` (UTC). */
export function previousPeriod(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { period: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, start: d, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) };
}

/**
 * Dunning state machine: TRIAL→GRACE (trial ended, nothing paid) ; ACTIVE→GRACE (invoice overdue) ;
 * GRACE→READ_ONLY (trial + TRIAL_GRACE_DAYS, or due + READ_ONLY_AFTER_DUE_DAYS) ; any→ACTIVE once nothing is overdue and not in unpaid trial.
 */
export function nextStatus(input: {
  status: string; trialEndsAt?: Date | null; oldestUnpaidDue?: Date | null; hasPaid?: boolean; now?: Date;
}): string {
  const { status, trialEndsAt, oldestUnpaidDue, hasPaid } = input;
  const now = (input.now ?? new Date()).getTime();
  const DAY = 86400000;
  if (status === 'CANCELLED') return status;
  if (status === 'TRIAL') {
    if (!trialEndsAt || trialEndsAt.getTime() > now) return 'TRIAL';
    if (hasPaid) return 'ACTIVE';
    return now > trialEndsAt.getTime() + TRIAL_GRACE_DAYS * DAY ? 'READ_ONLY' : 'GRACE';
  }
  if (!oldestUnpaidDue || oldestUnpaidDue.getTime() > now) {
    // nothing overdue: trial-expired tenants that never paid stay restricted
    if ((status === 'GRACE' || status === 'READ_ONLY') && !hasPaid && trialEndsAt && !oldestUnpaidDue) return status;
    return 'ACTIVE';
  }
  const overdueDays = (now - oldestUnpaidDue.getTime()) / DAY;
  if (overdueDays > READ_ONLY_AFTER_DUE_DAYS) return 'READ_ONLY';
  if (overdueDays > GRACE_AFTER_DUE_DAYS) return status === 'READ_ONLY' ? 'READ_ONLY' : 'GRACE';
  return status;
}

/** Route prefix (first segment after /api) → module key in tenant.enabledModules. Unlisted prefixes are core (always on). */
export const ROUTE_MODULES: Record<string, string> = {
  lab: 'lab', radiology: 'radiology', pharmacy: 'pharmacy', inpatient: 'ipd', maternity: 'maternity', theatre: 'theatre',
  dialysis: 'dialysis', homecare: 'homecare', claims: 'claims', preauths: 'claims', inventory: 'inventory', procurement: 'procurement',
  finance: 'finance', budgets: 'finance', hr: 'hr', assets: 'assets', reports: 'reports', quality: 'quality', telemedicine: 'telemedicine',
};
export function moduleForPath(path: string): string | null {
  const seg = path.split('?')[0].replace(/^\/?(api\/)?/, '').split('/')[0];
  return ROUTE_MODULES[seg] ?? null;
}

/** Writes still allowed for READ_ONLY tenants (auth + paying the subscription). */
export function readOnlyAllows(method: string, path: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true;
  const p = path.split('?')[0].replace(/^\/?api/, '');
  return p.startsWith('/auth/') || p.startsWith('/subscription/') || p.startsWith('/superadmin/');
}
