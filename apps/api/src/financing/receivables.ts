/** Receivables ageing (pure): approved-but-unpaid claims grouped by payer and age bucket. */
export const AGE_BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export interface ReceivableClaim { id: string; payerId: string; status: string; approvedMinor: number | null; paidMinor: number | null; decidedAt: Date | null; submittedAt: Date | null; createdAt: Date }

export const bucketOf = (days: number): AgeBucket => (days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+');
export const outstandingOf = (c: ReceivableClaim) => Math.max(0, (c.approvedMinor ?? 0) - (c.paidMinor ?? 0));
export const RECEIVABLE_STATUSES = ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'];

export function receivablesSummary(claims: ReceivableClaim[], payers: Record<string, { name: string; type: string }>, now = new Date()) {
  const rows = new Map<string, { payerId: string; payerName: string; payerType: string; claims: number; totalMinor: number; buckets: Record<AgeBucket, number> }>();
  let total = 0, count = 0, weightedDays = 0;
  for (const c of claims) {
    if (!RECEIVABLE_STATUSES.includes(c.status)) continue;
    const out = outstandingOf(c);
    if (out <= 0) continue;
    const days = Math.floor((now.getTime() - new Date(c.decidedAt ?? c.submittedAt ?? c.createdAt).getTime()) / 86400000);
    const p = payers[c.payerId] ?? { name: 'Unknown payer', type: 'UNKNOWN' };
    const row = rows.get(c.payerId) ?? { payerId: c.payerId, payerName: p.name, payerType: p.type, claims: 0, totalMinor: 0, buckets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } };
    row.claims++; row.totalMinor += out; row.buckets[bucketOf(days)] += out;
    rows.set(c.payerId, row);
    total += out; count++; weightedDays += out * days;
  }
  const byBucket = Object.fromEntries(AGE_BUCKETS.map((b) => [b, [...rows.values()].reduce((t, r) => t + r.buckets[b], 0)])) as Record<AgeBucket, number>;
  return { asOf: now.toISOString(), totalOutstandingMinor: total, claimCount: count, weightedAvgAgeDays: total ? Math.round(weightedDays / total) : 0, byBucket, byPayer: [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor) };
}

/** Max advance: advanceRate × eligible receivables (≤ maxAgeDays old, optionally one payer type). */
export function eligibleForAdvance(claims: ReceivableClaim[], payers: Record<string, { type: string }>, opts: { payerType?: string; maxAgeDays?: number; advanceRate?: number } = {}, now = new Date()) {
  const maxAge = opts.maxAgeDays ?? 90, rate = opts.advanceRate ?? 0.8;
  const eligible = claims.filter((c) => RECEIVABLE_STATUSES.includes(c.status) && outstandingOf(c) > 0
    && (!opts.payerType || payers[c.payerId]?.type === opts.payerType)
    && (now.getTime() - new Date(c.decidedAt ?? c.submittedAt ?? c.createdAt).getTime()) / 86400000 <= maxAge);
  const receivablesMinor = eligible.reduce((t, c) => t + outstandingOf(c), 0);
  return { claimIds: eligible.map((c) => c.id), receivablesMinor, maxAdvanceMinor: Math.floor(receivablesMinor * rate) };
}

const FLOW: Record<string, string[]> = {
  REQUESTED: ['UNDER_REVIEW', 'DECLINED', 'CANCELLED'], UNDER_REVIEW: ['OFFERED', 'DECLINED', 'CANCELLED'], OFFERED: ['ACCEPTED', 'DECLINED', 'CANCELLED'],
  ACCEPTED: ['DISBURSED', 'CANCELLED'], DISBURSED: ['REPAID'], DECLINED: [], CANCELLED: [], REPAID: [],
};
export const canTransition = (from: string, to: string) => (FLOW[from] ?? []).includes(to);
