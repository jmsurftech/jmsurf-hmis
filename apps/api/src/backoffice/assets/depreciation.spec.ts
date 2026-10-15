import { schedule, straightLine } from './depreciation';

describe('straight-line depreciation', () => {
  const a = { costMinor: 1_200_000, usefulLifeYears: 5, purchaseDate: new Date(Date.UTC(2024, 0, 15)) };
  it('monthly and annual charges', () => {
    const r = straightLine(a, new Date(Date.UTC(2024, 0, 31)));
    expect(r.monthlyMinor).toBe(20_000);
    expect(r.annualMinor).toBe(240_000);
    expect(r.accumulatedMinor).toBe(20_000);
  });
  it('accumulates and caps at cost - residual', () => {
    expect(straightLine(a, new Date(Date.UTC(2025, 11, 31))).accumulatedMinor).toBe(480_000);
    const end = straightLine({ ...a, residualMinor: 200_000 }, new Date(Date.UTC(2040, 0, 1)));
    expect(end.accumulatedMinor).toBe(1_000_000);
    expect(end.netBookValueMinor).toBe(200_000);
    expect(end.fullyDepreciated).toBe(true);
  });
  it('nothing before purchase', () => {
    expect(straightLine(a, new Date(Date.UTC(2023, 5, 1))).accumulatedMinor).toBe(0);
  });
  it('schedule sums to depreciable amount', () => {
    const s = schedule(a);
    expect(s[0]).toMatchObject({ year: 2024, depreciationMinor: 240_000 });
    expect(s.reduce((t, r) => t + r.depreciationMinor, 0)).toBe(1_200_000);
    expect(s[s.length - 1].netBookValueMinor).toBe(0);
  });
});
