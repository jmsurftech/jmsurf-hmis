import { flagResult, pickRange, RefRange } from './lab-flags';

const hb: RefRange[] = [
  { low: 11, high: 16, criticalLow: 6, criticalHigh: 20 },
  { sex: 'MALE', ageMinDays: 6570, low: 13, high: 17, criticalLow: 7, criticalHigh: 20 },
  { sex: 'FEMALE', ageMinDays: 6570, low: 12, high: 15.5, criticalLow: 7, criticalHigh: 20 },
  { ageMinDays: 0, ageMaxDays: 30, low: 14, high: 22, criticalLow: 9, criticalHigh: 25 },
];

describe('lab reference range flagging', () => {
  it('picks sex/age specific range for adults', () => {
    expect(pickRange(hb, 'MALE', 30 * 365)?.low).toBe(13);
    expect(pickRange(hb, 'FEMALE', 30 * 365)?.low).toBe(12);
  });
  it('picks neonatal range for a 10-day-old', () => {
    expect(pickRange(hb, 'MALE', 10)?.low).toBe(14);
  });
  it('falls back to generic range for children', () => {
    expect(pickRange(hb, 'FEMALE', 5 * 365)?.low).toBe(11);
  });
  it('flags low/high/normal and criticals', () => {
    const r = pickRange(hb, 'MALE', 40 * 365);
    expect(flagResult('14.2', r)).toEqual({ flag: 'N', isCritical: false });
    expect(flagResult('12.1', r)).toEqual({ flag: 'L', isCritical: false });
    expect(flagResult('18', r)).toEqual({ flag: 'H', isCritical: false });
    expect(flagResult('5.9', r)).toEqual({ flag: 'LL', isCritical: true });
    expect(flagResult('21', r)).toEqual({ flag: 'HH', isCritical: true });
  });
  it('a value female-normal but male-low is flagged correctly by sex', () => {
    expect(flagResult('12.5', pickRange(hb, 'FEMALE', 9000)).flag).toBe('N');
    expect(flagResult('12.5', pickRange(hb, 'MALE', 9000)).flag).toBe('L');
  });
  it('ignores non-numeric results', () => {
    expect(flagResult('POSITIVE', hb[0])).toEqual({ flag: undefined, isCritical: false });
    expect(flagResult('5', undefined).flag).toBeUndefined();
  });
});
