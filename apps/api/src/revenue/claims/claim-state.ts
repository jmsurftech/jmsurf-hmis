import { BadRequestException } from '@nestjs/common';

export type ClaimState =
  | 'DRAFT' | 'VALIDATED' | 'PREAUTH_PENDING' | 'SUBMITTED' | 'IN_REVIEW' | 'QUERIED'
  | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'PAID' | 'RECONCILED';

/** Claims workflow (BUILD_PLAN §8.1). REJECTED/QUERIED can be corrected and resubmitted. */
export const CLAIM_TRANSITIONS: Record<ClaimState, ClaimState[]> = {
  DRAFT: ['VALIDATED', 'PREAUTH_PENDING'],
  PREAUTH_PENDING: ['VALIDATED', 'DRAFT'],
  VALIDATED: ['SUBMITTED', 'DRAFT', 'PREAUTH_PENDING'],
  SUBMITTED: ['IN_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'QUERIED'],
  IN_REVIEW: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'QUERIED'],
  QUERIED: ['SUBMITTED', 'DRAFT', 'REJECTED'],
  APPROVED: ['PAID'],
  PARTIALLY_APPROVED: ['PAID'],
  REJECTED: ['DRAFT', 'SUBMITTED'],
  PAID: ['RECONCILED'],
  RECONCILED: [],
};

export const canTransition = (from: ClaimState, to: ClaimState) => CLAIM_TRANSITIONS[from]?.includes(to) ?? false;

export function assertTransition(from: ClaimState, to: ClaimState) {
  if (!canTransition(from, to)) throw new BadRequestException(`Illegal claim transition ${from} → ${to}`);
}

/** Map an external payer status string onto our state (unknown → null = no change). */
export function mapExternalStatus(s: string | undefined): ClaimState | null {
  const v = String(s ?? '').toUpperCase().replace(/[\s-]/g, '_');
  const map: Record<string, ClaimState> = {
    SUBMITTED: 'SUBMITTED', QUEUED: 'SUBMITTED', RECEIVED: 'IN_REVIEW', IN_REVIEW: 'IN_REVIEW', PENDING: 'IN_REVIEW', PROCESSING: 'IN_REVIEW',
    QUERIED: 'QUERIED', QUERY: 'QUERIED', APPROVED: 'APPROVED', PARTIALLY_APPROVED: 'PARTIALLY_APPROVED', PARTIAL: 'PARTIALLY_APPROVED',
    REJECTED: 'REJECTED', DECLINED: 'REJECTED', PAID: 'PAID',
  };
  return map[v] ?? null;
}

/** Shortest legal path from → to (BFS) so e.g. SUBMITTED→PAID records APPROVED in between. */
export function transitionPath(from: ClaimState, to: ClaimState): ClaimState[] | null {
  if (from === to) return [];
  const prev = new Map<ClaimState, ClaimState>();
  const q: ClaimState[] = [from];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of CLAIM_TRANSITIONS[cur]) {
      if (prev.has(n) || n === from) continue;
      prev.set(n, cur);
      if (n === to) {
        const path: ClaimState[] = [to];
        let p = cur;
        while (p !== from) { path.unshift(p); p = prev.get(p)!; }
        return path;
      }
      q.push(n);
    }
  }
  return null;
}
