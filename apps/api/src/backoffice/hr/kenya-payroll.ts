/**
 * Kenya statutory payroll engine (pure functions, monthly, integer minor units / cents).
 *
 * IMPORTANT: These rates and limits MUST be verified against the current KRA (PAYE), SHA (SHIF),
 * Affordable Housing Levy and NSSF rules before each payroll run — statutory rates change through
 * Finance Acts and gazette notices. Values below reflect the 2025/2026 position as configured.
 */
export interface PayrollRates {
  payeBands: { upTo: number; rate: number }[];
  personalReliefKes: number;
  shifRate: number;
  shifMinimumKes: number;
  housingLevyRate: number;
  housingLevyEmployerRate: number;
  nssfRate: number;
  nssfLowerLimitKes: number;
  nssfUpperLimitKes: number;
}

export const KENYA_PAYROLL_RATES: PayrollRates = {
  /** Monthly PAYE bands in KES (upper bound inclusive); last band has no upper bound. */
  payeBands: [
    { upTo: 24_000, rate: 0.10 },
    { upTo: 32_333, rate: 0.25 },
    { upTo: 500_000, rate: 0.30 },
    { upTo: 800_000, rate: 0.325 },
    { upTo: Infinity, rate: 0.35 },
  ],
  personalReliefKes: 2_400,
  /** Social Health Insurance Fund: 2.75% of gross, minimum KES 300; deductible before PAYE. */
  shifRate: 0.0275,
  shifMinimumKes: 300,
  /** Affordable Housing Levy: 1.5% of gross (employee) + 1.5% employer match; deductible before PAYE. */
  housingLevyRate: 0.015,
  housingLevyEmployerRate: 0.015,
  /** NSSF (Act 2013) Tier I up to Lower Earnings Limit, Tier II LEL→UEL; 6% employee + 6% employer. */
  nssfRate: 0.06,
  nssfLowerLimitKes: 8_000,
  nssfUpperLimitKes: 72_000,
};

export interface PayrollInput {
  basicMinor: number;
  /** Taxable cash allowances (house, commuter, call, etc.). */
  allowances?: { name: string; amountMinor: number }[];
  /** Post-tax deductions (HELB, SACCO, loans, advances). */
  otherDeductions?: { name: string; amountMinor: number }[];
}

export interface Payslip {
  basicMinor: number;
  allowancesMinor: number;
  grossMinor: number;
  nssfTier1Minor: number;
  nssfTier2Minor: number;
  nssfMinor: number;
  shifMinor: number;
  housingLevyMinor: number;
  taxablePayMinor: number;
  taxBeforeReliefMinor: number;
  personalReliefMinor: number;
  payeMinor: number;
  otherDeductionsMinor: number;
  totalDeductionsMinor: number;
  netPayMinor: number;
  employerNssfMinor: number;
  employerHousingLevyMinor: number;
  lines: { name: string; type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER'; amountMinor: number }[];
}

const K = (kes: number) => Math.round(kes * 100);
const r = Math.round;

export function nssf(grossMinor: number, rates: PayrollRates = KENYA_PAYROLL_RATES) {
  const lel = K(rates.nssfLowerLimitKes);
  const uel = K(rates.nssfUpperLimitKes);
  const tier1 = r(Math.min(grossMinor, lel) * rates.nssfRate);
  const tier2 = grossMinor > lel ? r((Math.min(grossMinor, uel) - lel) * rates.nssfRate) : 0;
  return { tier1, tier2, total: tier1 + tier2 };
}

export function shif(grossMinor: number, rates: PayrollRates = KENYA_PAYROLL_RATES) {
  if (grossMinor <= 0) return 0;
  return Math.max(K(rates.shifMinimumKes), r(grossMinor * rates.shifRate));
}

export function housingLevy(grossMinor: number, rates: PayrollRates = KENYA_PAYROLL_RATES) {
  return r(Math.max(0, grossMinor) * rates.housingLevyRate);
}

/** Tax on taxable pay before personal relief, using the progressive monthly bands. */
export function payeBeforeRelief(taxableMinor: number, rates: PayrollRates = KENYA_PAYROLL_RATES) {
  let tax = 0;
  let lower = 0;
  for (const band of rates.payeBands) {
    const upper = band.upTo === Infinity ? Infinity : K(band.upTo);
    if (taxableMinor <= lower) break;
    tax += (Math.min(taxableMinor, upper) - lower) * band.rate;
    lower = upper;
  }
  return r(tax);
}

export function computePayslip(input: PayrollInput, rates: PayrollRates = KENYA_PAYROLL_RATES): Payslip {
  const allowancesMinor = (input.allowances ?? []).reduce((s, a) => s + a.amountMinor, 0);
  const grossMinor = input.basicMinor + allowancesMinor;
  const n = nssf(grossMinor, rates);
  const shifMinor = shif(grossMinor, rates);
  const housingLevyMinor = housingLevy(grossMinor, rates);
  const taxablePayMinor = Math.max(0, grossMinor - n.total - shifMinor - housingLevyMinor);
  const taxBeforeReliefMinor = payeBeforeRelief(taxablePayMinor, rates);
  const personalReliefMinor = Math.min(K(rates.personalReliefKes), taxBeforeReliefMinor);
  const payeMinor = taxBeforeReliefMinor - personalReliefMinor;
  const otherDeductionsMinor = (input.otherDeductions ?? []).reduce((s, a) => s + a.amountMinor, 0);
  const totalDeductionsMinor = n.total + shifMinor + housingLevyMinor + payeMinor + otherDeductionsMinor;
  const employerHousingLevyMinor = r(Math.max(0, grossMinor) * rates.housingLevyEmployerRate);
  return {
    basicMinor: input.basicMinor, allowancesMinor, grossMinor,
    nssfTier1Minor: n.tier1, nssfTier2Minor: n.tier2, nssfMinor: n.total,
    shifMinor, housingLevyMinor, taxablePayMinor, taxBeforeReliefMinor, personalReliefMinor, payeMinor,
    otherDeductionsMinor, totalDeductionsMinor, netPayMinor: grossMinor - totalDeductionsMinor,
    employerNssfMinor: n.total, employerHousingLevyMinor,
    lines: [
      { name: 'Basic salary', type: 'EARNING', amountMinor: input.basicMinor },
      ...(input.allowances ?? []).map((a) => ({ name: a.name, type: 'EARNING' as const, amountMinor: a.amountMinor })),
      { name: 'NSSF', type: 'DEDUCTION', amountMinor: n.total },
      { name: 'SHIF', type: 'DEDUCTION', amountMinor: shifMinor },
      { name: 'Affordable Housing Levy', type: 'DEDUCTION', amountMinor: housingLevyMinor },
      { name: 'PAYE', type: 'DEDUCTION', amountMinor: payeMinor },
      ...(input.otherDeductions ?? []).map((a) => ({ name: a.name, type: 'DEDUCTION' as const, amountMinor: a.amountMinor })),
      { name: 'Employer NSSF', type: 'EMPLOYER', amountMinor: n.total },
      { name: 'Employer Housing Levy', type: 'EMPLOYER', amountMinor: employerHousingLevyMinor },
    ],
  };
}
