/**
 * Pre-submission claim scrubber (pure). Each rule mirrors a common SHA / insurer rejection reason.
 * ERROR blocks submission; WARNING is shown and raises rejection risk.
 */
export type Severity = 'ERROR' | 'WARNING' | 'INFO';
export interface ScrubIssue { code: string; severity: Severity; message: string; lineRef?: string }

export interface PackageRule { code: string; tariffMinor: number; minFacilityLevel: number; requiresPreauth: boolean; frequencyLimit?: string | null }

export interface ScrubLine { ref: string; code: string; description: string; quantity: number; amountMinor: number }

export interface ScrubContext {
  payerType: 'SHA' | 'INSURER' | string;
  serviceDate: Date;
  diagnoses: { code: string; codeSystem?: string }[];
  patient: { crId?: string | null; shaNumber?: string | null };
  facilityLevel: number;
  lines: ScrubLine[];
  packages: Record<string, PackageRule>; // by intervention code
  approvedPreauthCodes: string[]; // intervention codes with APPROVED pre-auth for this visit
  /** Prior service dates per intervention code for this patient (other claims, not this one). */
  priorUsage: Record<string, Date[]>;
  duplicateClaimNumbers: string[]; // other active claims for the same visit/bill
  practitioner?: { licenseNumber?: string | null; licenseExpiry?: Date | null } | null;
  /** Tolerance before amount-above-tariff becomes an error (default 0). */
  tariffTolerancePercent?: number;
}

const PERIOD_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365, visit: 0 };

/** Parse "3/week" → { max: 3, days: 7 }. */
export function parseFrequency(s?: string | null): { max: number; days: number } | null {
  const m = /^\s*(\d+)\s*\/\s*(day|week|month|year|visit)\s*$/i.exec(s ?? '');
  return m ? { max: Number(m[1]), days: PERIOD_DAYS[m[2].toLowerCase()] } : null;
}

export function scrubClaim(ctx: ScrubContext): ScrubIssue[] {
  const issues: ScrubIssue[] = [];
  const isSha = ctx.payerType === 'SHA';

  if (!ctx.diagnoses.length) issues.push({ code: 'MISSING_DIAGNOSIS', severity: 'ERROR', message: 'Claim has no diagnosis. Add at least one ICD-11 diagnosis.' });
  else if (isSha && ctx.diagnoses.some((d) => (d.codeSystem ?? 'ICD-11') !== 'ICD-11'))
    issues.push({ code: 'NON_ICD11_DIAGNOSIS', severity: 'WARNING', message: 'SHA expects ICD-11 coded diagnoses.' });

  if (isSha && !ctx.patient.crId) issues.push({ code: 'MISSING_CR_ID', severity: 'ERROR', message: 'Patient has no Client Registry (CR) ID. Verify the patient against the Client Registry.' });

  if (!ctx.lines.length) issues.push({ code: 'NO_LINES', severity: 'ERROR', message: 'Claim has no billable lines.' });

  if (!ctx.practitioner) issues.push({ code: 'MISSING_PRACTITIONER', severity: 'ERROR', message: 'No attending practitioner on the visit.' });
  else if (!ctx.practitioner.licenseNumber) issues.push({ code: 'PRACTITIONER_NO_LICENCE', severity: 'ERROR', message: 'Attending practitioner has no licence number on file.' });
  else if (ctx.practitioner.licenseExpiry && new Date(ctx.practitioner.licenseExpiry) < ctx.serviceDate)
    issues.push({ code: 'PRACTITIONER_LICENCE_EXPIRED', severity: 'ERROR', message: 'Attending practitioner licence had expired on the service date.' });

  for (const n of ctx.duplicateClaimNumbers)
    issues.push({ code: 'DUPLICATE_CLAIM', severity: 'ERROR', message: `Another active claim (${n}) exists for this visit.` });

  for (const l of ctx.lines) {
    const pkg = ctx.packages[l.code];
    if (!pkg) {
      if (isSha) issues.push({ code: 'UNMAPPED_INTERVENTION', severity: 'WARNING', lineRef: l.ref, message: `"${l.description}" (${l.code}) is not mapped to an SHA intervention code.` });
      continue;
    }
    if (ctx.facilityLevel < pkg.minFacilityLevel)
      issues.push({ code: 'PACKAGE_NOT_ALLOWED_FOR_LEVEL', severity: 'ERROR', lineRef: l.ref, message: `${l.code} requires facility level ${pkg.minFacilityLevel}+, facility is level ${ctx.facilityLevel}.` });
    if (pkg.requiresPreauth && !ctx.approvedPreauthCodes.includes(l.code))
      issues.push({ code: 'PREAUTH_REQUIRED', severity: 'ERROR', lineRef: l.ref, message: `${l.code} requires an approved pre-authorisation.` });
    const unitAmount = l.quantity ? l.amountMinor / l.quantity : l.amountMinor;
    const tol = 1 + (ctx.tariffTolerancePercent ?? 0) / 100;
    if (pkg.tariffMinor > 0 && unitAmount > pkg.tariffMinor * tol)
      issues.push({ code: 'AMOUNT_ABOVE_TARIFF', severity: 'ERROR', lineRef: l.ref, message: `${l.code} billed at ${(unitAmount / 100).toFixed(2)} above tariff ${(pkg.tariffMinor / 100).toFixed(2)}.` });
    const freq = parseFrequency(pkg.frequencyLimit);
    if (freq) {
      const from = new Date(ctx.serviceDate.getTime() - freq.days * 86400_000);
      const prior = (ctx.priorUsage[l.code] ?? []).filter((d) => freq.days === 0 || (d > from && d <= ctx.serviceDate)).length;
      const thisClaim = ctx.lines.filter((x) => x.code === l.code).reduce((a, x) => a + x.quantity, 0);
      if (freq.days > 0 && prior + thisClaim > freq.max)
        issues.push({ code: 'FREQUENCY_LIMIT_EXCEEDED', severity: 'ERROR', lineRef: l.ref, message: `${l.code} limit ${pkg.frequencyLimit} exceeded (${prior} prior + ${thisClaim} on this claim).` });
      if (freq.days === 0 && thisClaim > freq.max)
        issues.push({ code: 'FREQUENCY_LIMIT_EXCEEDED', severity: 'ERROR', lineRef: l.ref, message: `${l.code} limit ${pkg.frequencyLimit} exceeded on this visit.` });
    }
  }
  // de-duplicate identical frequency issues emitted for repeated lines
  const seen = new Set<string>();
  return issues.filter((i) => { const k = `${i.code}|${i.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const WEIGHTS: Record<string, number> = {
  MISSING_DIAGNOSIS: 0.6, MISSING_CR_ID: 0.7, PREAUTH_REQUIRED: 0.8, PACKAGE_NOT_ALLOWED_FOR_LEVEL: 0.8, DUPLICATE_CLAIM: 0.9,
  FREQUENCY_LIMIT_EXCEEDED: 0.6, AMOUNT_ABOVE_TARIFF: 0.4, PRACTITIONER_NO_LICENCE: 0.5, PRACTITIONER_LICENCE_EXPIRED: 0.6,
  UNMAPPED_INTERVENTION: 0.25, NON_ICD11_DIAGNOSIS: 0.15, MISSING_PRACTITIONER: 0.5, NO_LINES: 0.9,
};

/**
 * Heuristic rejection risk in [0,1]: 1 - Π(1 - w_i) over issues, plus small priors for claim size and
 * the payer's historical rejection rate. Placeholder for a trained model (BUILD_PLAN §6.23).
 */
export function rejectionRisk(issues: ScrubIssue[], opts: { totalMinor?: number; historicalRejectionRate?: number } = {}): number {
  let keep = 1;
  for (const i of issues) keep *= 1 - (WEIGHTS[i.code] ?? (i.severity === 'ERROR' ? 0.5 : i.severity === 'WARNING' ? 0.15 : 0));
  if ((opts.totalMinor ?? 0) > 10_000_000) keep *= 0.95; // very large claims are reviewed more strictly
  if (opts.historicalRejectionRate) keep *= 1 - Math.min(Math.max(opts.historicalRejectionRate, 0), 1) * 0.5;
  return Math.round((1 - keep) * 1000) / 1000;
}

export const hasBlockingIssues = (issues: ScrubIssue[]) => issues.some((i) => i.severity === 'ERROR');
