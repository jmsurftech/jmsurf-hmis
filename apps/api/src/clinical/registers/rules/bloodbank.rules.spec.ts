import { donorEligibility, isCompatible, parseGroup, ttiStatus } from './bloodbank.rules';

const rbc = (abo: any, rh: any) => ({ abo, rh, component: 'PRBC' });
describe('crossmatch compatibility (ABO/Rh)', () => {
  it('O- red cells are universal', () => {
    for (const abo of ['A', 'B', 'AB', 'O'] as const) for (const rh of ['POS', 'NEG'] as const) expect(isCompatible({ abo, rh }, rbc('O', 'NEG')).compatible).toBe(true);
  });
  it('AB+ recipient takes any red cells', () => {
    for (const abo of ['A', 'B', 'AB', 'O']) for (const rh of ['POS', 'NEG']) expect(isCompatible({ abo: 'AB', rh: 'POS' }, rbc(abo, rh)).compatible).toBe(true);
  });
  it('rejects ABO-incompatible red cells', () => {
    expect(isCompatible({ abo: 'O', rh: 'POS' }, rbc('A', 'POS')).compatible).toBe(false);
    expect(isCompatible({ abo: 'A', rh: 'POS' }, rbc('B', 'POS')).compatible).toBe(false);
    expect(isCompatible({ abo: 'B', rh: 'NEG' }, rbc('AB', 'NEG')).compatible).toBe(false);
    expect(isCompatible({ abo: 'A', rh: 'POS' }, rbc('O', 'POS')).compatible).toBe(true);
  });
  it('Rh-negative recipient cannot receive Rh-positive cells', () => {
    const r = isCompatible({ abo: 'A', rh: 'NEG' }, rbc('A', 'POS'));
    expect(r.compatible).toBe(false); expect(r.reason).toMatch(/Rh/);
    expect(isCompatible({ abo: 'A', rh: 'POS' }, rbc('A', 'NEG')).compatible).toBe(true);
  });
  it('plasma follows reverse ABO rules and ignores Rh', () => {
    const ffp = (abo: any) => ({ abo, rh: 'POS' as const, component: 'FFP' });
    expect(isCompatible({ abo: 'O', rh: 'NEG' }, ffp('AB')).compatible).toBe(true);
    expect(isCompatible({ abo: 'AB', rh: 'POS' }, ffp('O')).compatible).toBe(false);
    expect(isCompatible({ abo: 'A', rh: 'NEG' }, ffp('A')).compatible).toBe(true);
    expect(isCompatible({ abo: 'A', rh: 'POS' }, ffp('B')).compatible).toBe(false);
  });
  it('whole blood must be ABO-identical', () => {
    expect(isCompatible({ abo: 'A', rh: 'POS' }, { abo: 'O', rh: 'POS', component: 'WHOLE_BLOOD' }).compatible).toBe(false);
    expect(isCompatible({ abo: 'A', rh: 'POS' }, { abo: 'A', rh: 'POS', component: 'WHOLE_BLOOD' }).compatible).toBe(true);
  });
  it('parses group labels', () => {
    expect(parseGroup('AB-')).toEqual({ abo: 'AB', rh: 'NEG' });
    expect(parseGroup('o pos')).toEqual({ abo: 'O', rh: 'POS' });
    expect(parseGroup('x')).toBeNull();
  });
});

describe('donor screening', () => {
  it('TTI status', () => {
    expect(ttiStatus({ hiv: 'NEG', hbv: 'NEG', hcv: 'NEG', syphilis: 'NEG' })).toBe('PASSED');
    expect(ttiStatus({ hiv: 'POS', hbv: 'NEG' })).toBe('FAILED');
    expect(ttiStatus({ hiv: 'NEG' })).toBe('PENDING');
  });
  it('defers on low Hb and short interval', () => {
    const now = new Date('2026-10-15');
    const r = donorEligibility({ sex: 'FEMALE', hbGdl: 11, lastDonationAt: new Date('2026-08-01') }, now);
    expect(r.eligible).toBe(false); expect(r.reasons.length).toBe(2);
    expect(donorEligibility({ sex: 'MALE', hbGdl: 14, weightKg: 70, lastDonationAt: new Date('2026-06-01') }, now).eligible).toBe(true);
  });
});
