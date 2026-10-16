import { bucketOf, canTransition, eligibleForAdvance, receivablesSummary } from './receivables';

const now = new Date('2026-10-15T00:00:00Z');
const d = (days: number) => new Date(now.getTime() - days * 86400000);
const claims = [
  { id: 'a', payerId: 'sha', status: 'APPROVED', approvedMinor: 100_000, paidMinor: null, decidedAt: d(10), submittedAt: d(20), createdAt: d(25) },
  { id: 'b', payerId: 'sha', status: 'PARTIALLY_APPROVED', approvedMinor: 50_000, paidMinor: 20_000, decidedAt: d(45), submittedAt: null, createdAt: d(50) },
  { id: 'c', payerId: 'ins', status: 'APPROVED', approvedMinor: 70_000, paidMinor: 0, decidedAt: d(120), submittedAt: null, createdAt: d(130) },
  { id: 'd', payerId: 'sha', status: 'PAID', approvedMinor: 40_000, paidMinor: 40_000, decidedAt: d(5), submittedAt: null, createdAt: d(5) },
  { id: 'e', payerId: 'sha', status: 'SUBMITTED', approvedMinor: null, paidMinor: null, decidedAt: null, submittedAt: d(3), createdAt: d(3) },
];
const payers = { sha: { name: 'SHA', type: 'SHA' }, ins: { name: 'Jubilee', type: 'INSURER' } };

describe('receivables', () => {
  it('buckets by age', () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(bucketOf)).toEqual(['0-30', '0-30', '31-60', '31-60', '61-90', '61-90', '90+']);
  });
  it('summarises approved-unpaid by payer and age', () => {
    const s = receivablesSummary(claims, payers, now);
    expect(s.totalOutstandingMinor).toBe(200_000);
    expect(s.claimCount).toBe(3);
    expect(s.byBucket).toEqual({ '0-30': 100_000, '31-60': 30_000, '61-90': 0, '90+': 70_000 });
    expect(s.byPayer[0]).toMatchObject({ payerId: 'sha', claims: 2, totalMinor: 130_000 });
    expect(s.weightedAvgAgeDays).toBe(Math.round((100_000 * 10 + 30_000 * 45 + 70_000 * 120) / 200_000));
  });
  it('computes eligible SHA advance at 80%', () => {
    const e = eligibleForAdvance(claims, payers, { payerType: 'SHA' }, now);
    expect(e.claimIds).toEqual(['a', 'b']);
    expect(e.receivablesMinor).toBe(130_000);
    expect(e.maxAdvanceMinor).toBe(104_000);
  });
  it('enforces the request status flow', () => {
    expect(canTransition('REQUESTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('REQUESTED', 'DISBURSED')).toBe(false);
    expect(canTransition('DISBURSED', 'REPAID')).toBe(true);
  });
});
