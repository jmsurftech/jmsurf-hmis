import { assertTransition, canTransition, mapExternalStatus, transitionPath } from './claim-state';

describe('claim state machine', () => {
  it('allows the happy path', () => {
    const path = ['DRAFT', 'VALIDATED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'PAID', 'RECONCILED'] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1], path[i])).toBe(true);
  });
  it('blocks illegal jumps', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(false);
    expect(canTransition('RECONCILED', 'DRAFT')).toBe(false);
    expect(() => assertTransition('PAID', 'REJECTED')).toThrow(/Illegal/);
  });
  it('supports resubmission after rejection or query', () => {
    expect(canTransition('REJECTED', 'SUBMITTED')).toBe(true);
    expect(canTransition('QUERIED', 'SUBMITTED')).toBe(true);
  });
  it('maps external statuses', () => {
    expect(mapExternalStatus('partially approved')).toBe('PARTIALLY_APPROVED');
    expect(mapExternalStatus('declined')).toBe('REJECTED');
    expect(mapExternalStatus('weird')).toBeNull();
  });
  it('finds intermediate path', () => {
    expect(transitionPath('SUBMITTED', 'PAID')).toEqual(['APPROVED', 'PAID']);
    expect(transitionPath('IN_REVIEW', 'RECONCILED')).toEqual(['APPROVED', 'PAID', 'RECONCILED']);
    expect(transitionPath('RECONCILED', 'DRAFT')).toBeNull();
  });
});
