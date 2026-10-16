/** Blood bank business rules (pure). */
export type Abo = 'A' | 'B' | 'AB' | 'O';
export type Rh = 'POS' | 'NEG';
export const ABO: Abo[] = ['A', 'B', 'AB', 'O'];
export const COMPONENTS = ['WHOLE_BLOOD', 'PRBC', 'FFP', 'PLATELETS', 'CRYO'] as const;
export const SHELF_LIFE_DAYS: Record<string, number> = { WHOLE_BLOOD: 35, PRBC: 42, FFP: 365, PLATELETS: 5, CRYO: 365 };
const PLASMA_COMPONENTS = ['FFP', 'CRYO'];

/** Parse "O+", "AB-", "A POS" into { abo, rh }. */
export function parseGroup(g?: string | null): { abo: Abo; rh: Rh } | null {
  if (!g) return null;
  const m = g.toUpperCase().replace(/\s+/g, '').match(/^(AB|A|B|O)(\+|-|POS|NEG|POSITIVE|NEGATIVE)$/);
  if (!m) return null;
  return { abo: m[1] as Abo, rh: m[2].startsWith('+') || m[2].startsWith('POS') ? 'POS' : 'NEG' };
}
export const groupLabel = (abo: string, rh: string) => `${abo}${rh === 'POS' ? '+' : '-'}`;

/** ABO antigens on red cells. */
const antigens = (abo: Abo) => ({ A: ['A'], B: ['B'], AB: ['A', 'B'], O: [] as string[] }[abo]);

/**
 * Compatibility of a donor unit for a recipient.
 * - Red-cell containing components (WHOLE_BLOOD, PRBC, PLATELETS): donor red-cell antigens must be present in the recipient
 *   (O is universal donor, AB universal recipient). Rh-negative recipients must receive Rh-negative units.
 *   Whole blood is group-specific (identical ABO) because it carries both cells and plasma.
 * - Plasma components (FFP, CRYO): donor plasma antibodies must not attack recipient cells (AB plasma universal); Rh ignored.
 */
export function isCompatible(recipient: { abo: Abo; rh: Rh }, unit: { abo: Abo; rh: Rh; component: string }): { compatible: boolean; reason?: string } {
  if (!ABO.includes(recipient.abo) || !ABO.includes(unit.abo)) return { compatible: false, reason: 'Unknown ABO group' };
  if (PLASMA_COMPONENTS.includes(unit.component)) {
    const ok = antigens(recipient.abo).every((a) => antigens(unit.abo).includes(a));
    return ok ? { compatible: true } : { compatible: false, reason: `Group ${unit.abo} plasma is incompatible with a group ${recipient.abo} recipient` };
  }
  if (unit.component === 'WHOLE_BLOOD' && unit.abo !== recipient.abo) return { compatible: false, reason: 'Whole blood must be ABO-identical' };
  const aboOk = antigens(unit.abo).every((a) => antigens(recipient.abo).includes(a));
  if (!aboOk) return { compatible: false, reason: `Group ${unit.abo} cells are incompatible with a group ${recipient.abo} recipient` };
  if (recipient.rh === 'NEG' && unit.rh === 'POS') return { compatible: false, reason: 'Rh-positive unit for an Rh-negative recipient' };
  return { compatible: true };
}

export const TTI_MARKERS = ['hiv', 'hbv', 'hcv', 'syphilis'] as const;
/** TTI screen: FAILED if any marker reactive, PENDING if any missing, else PASSED. */
export function ttiStatus(r?: Record<string, string | undefined> | null): 'PASSED' | 'FAILED' | 'PENDING' {
  const v = TTI_MARKERS.map((k) => (r?.[k] ?? 'PENDING').toUpperCase());
  if (v.some((x) => x === 'POS' || x === 'REACTIVE')) return 'FAILED';
  if (v.some((x) => x !== 'NEG' && x !== 'NON_REACTIVE')) return 'PENDING';
  return 'PASSED';
}

/** Donor eligibility (KNBTS-style criteria): age 16–65, weight ≥ 50 kg, Hb ≥ 12.5 g/dL, 3-month (M) / 4-month (F) interval. */
export function donorEligibility(d: { dateOfBirth?: Date | null; sex?: string; weightKg?: number; hbGdl?: number; lastDonationAt?: Date | null; deferredUntil?: Date | null }, now = new Date()) {
  const reasons: string[] = []; let until: Date | undefined;
  if (d.deferredUntil && d.deferredUntil > now) { reasons.push('Currently deferred'); until = d.deferredUntil; }
  if (d.dateOfBirth) {
    const age = (now.getTime() - d.dateOfBirth.getTime()) / (365.25 * 86400000);
    if (age < 16 || age > 65) reasons.push('Age outside 16–65');
  }
  if (d.weightKg != null && d.weightKg < 50) reasons.push('Weight below 50 kg');
  if (d.hbGdl != null && d.hbGdl < 12.5) { reasons.push('Haemoglobin below 12.5 g/dL'); until ??= new Date(now.getTime() + 90 * 86400000); }
  if (d.lastDonationAt) {
    const gapDays = d.sex === 'FEMALE' ? 120 : 90;
    const next = new Date(d.lastDonationAt.getTime() + gapDays * 86400000);
    if (next > now) { reasons.push(`Minimum ${gapDays}-day interval since last donation`); if (!until || next > until) until = next; }
  }
  return { eligible: reasons.length === 0, reasons, deferredUntil: until };
}

export function expiryFor(component: string, collectedAt: Date) {
  return new Date(collectedAt.getTime() + (SHELF_LIFE_DAYS[component] ?? 35) * 86400000);
}
