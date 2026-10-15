import { computePayslip, housingLevy, KENYA_PAYROLL_RATES, nssf, payeBeforeRelief, shif } from './kenya-payroll';

const K = (kes: number) => Math.round(kes * 100);

describe('Kenya payroll — components', () => {
  it('NSSF Tier I/II with LEL 8,000 and UEL 72,000', () => {
    expect(nssf(K(5_000))).toEqual({ tier1: K(300), tier2: 0, total: K(300) });
    expect(nssf(K(8_000))).toEqual({ tier1: K(480), tier2: 0, total: K(480) });
    expect(nssf(K(20_000))).toEqual({ tier1: K(480), tier2: K(720), total: K(1_200) });
    expect(nssf(K(72_000)).total).toBe(K(4_320));
    expect(nssf(K(500_000)).total).toBe(K(4_320)); // capped
  });
  it('SHIF 2.75% with KES 300 minimum', () => {
    expect(shif(K(5_000))).toBe(K(300));
    expect(shif(K(10_909))).toBe(K(300)); // 2.75% = 299.99 → minimum
    expect(shif(K(100_000))).toBe(K(2_750));
    expect(shif(0)).toBe(0);
  });
  it('Housing levy 1.5%', () => {
    expect(housingLevy(K(100_000))).toBe(K(1_500));
  });
  it('PAYE band boundaries', () => {
    expect(payeBeforeRelief(K(24_000))).toBe(K(2_400));
    expect(payeBeforeRelief(K(32_333))).toBe(K(2_400 + 2_083.25));
    expect(payeBeforeRelief(K(500_000))).toBe(K(2_400 + 2_083.25 + 140_300.1));
    expect(payeBeforeRelief(K(800_000))).toBe(K(2_400 + 2_083.25 + 140_300.1 + 97_500));
    expect(payeBeforeRelief(0)).toBe(0);
  });
});

describe('Kenya payroll — full payslips', () => {
  it('KES 100,000 gross', () => {
    const p = computePayslip({ basicMinor: K(80_000), allowances: [{ name: 'House', amountMinor: K(20_000) }] });
    expect(p.grossMinor).toBe(K(100_000));
    expect(p.nssfMinor).toBe(K(4_320));
    expect(p.shifMinor).toBe(K(2_750));
    expect(p.housingLevyMinor).toBe(K(1_500));
    expect(p.taxablePayMinor).toBe(K(91_430));
    expect(p.taxBeforeReliefMinor).toBe(K(22_212.35));
    expect(p.payeMinor).toBe(K(19_812.35));
    expect(p.netPayMinor).toBe(K(71_617.65));
    expect(p.employerNssfMinor).toBe(K(4_320));
    expect(p.employerHousingLevyMinor).toBe(K(1_500));
  });
  it('low earner pays no PAYE (relief exceeds tax)', () => {
    const p = computePayslip({ basicMinor: K(20_000) });
    expect(p.taxablePayMinor).toBe(K(17_950));
    expect(p.payeMinor).toBe(0);
    expect(p.personalReliefMinor).toBe(K(1_795));
    expect(p.netPayMinor).toBe(K(17_950));
  });
  it('very low earner gets SHIF minimum', () => {
    const p = computePayslip({ basicMinor: K(5_000) });
    expect(p.shifMinor).toBe(K(300));
    expect(p.netPayMinor).toBe(K(5_000 - 300 - 300 - 75));
  });
  it('top band (KES 1,000,000) taxed at 35%', () => {
    const p = computePayslip({ basicMinor: K(1_000_000) });
    expect(p.taxablePayMinor).toBe(K(953_180));
    expect(p.payeMinor).toBe(K(293_496.35));
  });
  it('post-tax deductions reduce net only', () => {
    const a = computePayslip({ basicMinor: K(60_000) });
    const b = computePayslip({ basicMinor: K(60_000), otherDeductions: [{ name: 'HELB', amountMinor: K(1_500) }] });
    expect(b.payeMinor).toBe(a.payeMinor);
    expect(a.netPayMinor - b.netPayMinor).toBe(K(1_500));
  });
  it('net = gross − deductions and lines add up', () => {
    const p = computePayslip({ basicMinor: K(45_678.9) });
    const ded = p.lines.filter((l) => l.type === 'DEDUCTION').reduce((s, l) => s + l.amountMinor, 0);
    expect(p.grossMinor - ded).toBe(p.netPayMinor);
  });
  it('rates are configurable', () => {
    const custom = { ...KENYA_PAYROLL_RATES, personalReliefKes: 0 };
    expect(computePayslip({ basicMinor: K(20_000) }, custom).payeMinor).toBe(K(1_795));
  });
});
