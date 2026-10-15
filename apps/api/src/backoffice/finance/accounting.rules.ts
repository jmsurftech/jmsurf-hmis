/** Pure accounting rules: journal validation, chart-of-accounts template, posting maps, statement builders. */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface JournalLine {
  accountCode: string;
  debitMinor: number;
  creditMinor: number;
  costCentre?: string;
  memo?: string;
}

export class JournalValidationError extends Error {}

/** Throws unless the journal has ≥2 lines, non-negative integer amounts, one side per line, and debits = credits > 0. */
export function validateJournal(lines: JournalLine[]): { debitMinor: number; creditMinor: number } {
  if (!Array.isArray(lines) || lines.length < 2) throw new JournalValidationError('A journal needs at least two lines');
  let dr = 0;
  let cr = 0;
  for (const l of lines) {
    if (!l.accountCode) throw new JournalValidationError('Every line needs an accountCode');
    const d = l.debitMinor ?? 0;
    const c = l.creditMinor ?? 0;
    if (!Number.isInteger(d) || !Number.isInteger(c)) throw new JournalValidationError('Amounts must be integer minor units');
    if (d < 0 || c < 0) throw new JournalValidationError('Amounts cannot be negative');
    if (d > 0 && c > 0) throw new JournalValidationError('A line cannot have both a debit and a credit');
    if (d === 0 && c === 0) throw new JournalValidationError('A line must have a debit or a credit');
    dr += d;
    cr += c;
  }
  if (dr !== cr) throw new JournalValidationError(`Debits (${dr}) do not equal credits (${cr})`);
  return { debitMinor: dr, creditMinor: cr };
}

/** Drop zero lines and merge lines with the same account/side/cost centre. */
export function compactLines(lines: JournalLine[]): JournalLine[] {
  const map = new Map<string, JournalLine>();
  for (const l of lines) {
    const net = (l.debitMinor || 0) - (l.creditMinor || 0);
    if (net === 0) continue;
    const side = net > 0 ? 'D' : 'C';
    const key = `${l.accountCode}|${side}|${l.costCentre ?? ''}`;
    const cur = map.get(key) ?? { accountCode: l.accountCode, debitMinor: 0, creditMinor: 0, costCentre: l.costCentre };
    if (net > 0) cur.debitMinor += net; else cur.creditMinor += -net;
    map.set(key, cur);
  }
  return [...map.values()];
}

/** Kenyan healthcare chart of accounts (IFRS-aligned, simplified). */
export const KENYA_HEALTHCARE_COA: { code: string; name: string; type: AccountType; parent?: string }[] = [
  { code: '1000', name: 'Cash on Hand', type: 'ASSET' },
  { code: '1010', name: 'M-Pesa / Mobile Money', type: 'ASSET' },
  { code: '1020', name: 'Bank - Current Account', type: 'ASSET' },
  { code: '1030', name: 'Card Clearing', type: 'ASSET' },
  { code: '1100', name: 'Patient Receivables', type: 'ASSET' },
  { code: '1110', name: 'SHA Receivables', type: 'ASSET' },
  { code: '1120', name: 'Insurance & Corporate Receivables', type: 'ASSET' },
  { code: '1200', name: 'Inventory - Pharmaceuticals', type: 'ASSET' },
  { code: '1210', name: 'Inventory - Consumables & Reagents', type: 'ASSET' },
  { code: '1300', name: 'Prepayments', type: 'ASSET' },
  { code: '1500', name: 'Property, Plant & Equipment', type: 'ASSET' },
  { code: '1510', name: 'Medical Equipment', type: 'ASSET', parent: '1500' },
  { code: '1590', name: 'Accumulated Depreciation', type: 'ASSET', parent: '1500' },
  { code: '2000', name: 'Accounts Payable - Suppliers', type: 'LIABILITY' },
  { code: '2050', name: 'Patient Deposits', type: 'LIABILITY' },
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY' },
  { code: '2110', name: 'Withholding Tax Payable', type: 'LIABILITY' },
  { code: '2200', name: 'PAYE Payable', type: 'LIABILITY' },
  { code: '2210', name: 'NSSF Payable', type: 'LIABILITY' },
  { code: '2220', name: 'SHIF Payable', type: 'LIABILITY' },
  { code: '2230', name: 'Housing Levy Payable', type: 'LIABILITY' },
  { code: '2300', name: 'Net Salaries Payable', type: 'LIABILITY' },
  { code: '2400', name: 'Accrued Expenses', type: 'LIABILITY' },
  { code: '3000', name: 'Capital / Fund Balance', type: 'EQUITY' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY' },
  { code: '4000', name: 'Consultation Revenue', type: 'INCOME' },
  { code: '4010', name: 'Laboratory Revenue', type: 'INCOME' },
  { code: '4020', name: 'Imaging Revenue', type: 'INCOME' },
  { code: '4030', name: 'Procedure Revenue', type: 'INCOME' },
  { code: '4040', name: 'Inpatient / Bed Revenue', type: 'INCOME' },
  { code: '4050', name: 'Pharmacy Revenue', type: 'INCOME' },
  { code: '4060', name: 'Nursing Revenue', type: 'INCOME' },
  { code: '4070', name: 'Theatre Revenue', type: 'INCOME' },
  { code: '4090', name: 'Other Patient Revenue', type: 'INCOME' },
  { code: '4800', name: 'Grants & Donations', type: 'INCOME' },
  { code: '4900', name: 'Discounts & Waivers', type: 'INCOME' },
  { code: '5000', name: 'Cost of Drugs Dispensed', type: 'EXPENSE' },
  { code: '5010', name: 'Cost of Consumables & Reagents', type: 'EXPENSE' },
  { code: '6000', name: 'Salaries & Wages', type: 'EXPENSE' },
  { code: '6010', name: 'Employer Statutory Contributions', type: 'EXPENSE' },
  { code: '6100', name: 'Utilities', type: 'EXPENSE' },
  { code: '6200', name: 'Depreciation', type: 'EXPENSE' },
  { code: '6300', name: 'Repairs & Maintenance', type: 'EXPENSE' },
  { code: '6400', name: 'Rent & Rates', type: 'EXPENSE' },
  { code: '6500', name: 'Insurance', type: 'EXPENSE' },
  { code: '6600', name: 'Bank & M-Pesa Charges', type: 'EXPENSE' },
  { code: '6700', name: 'Bad Debts / Claim Write-offs', type: 'EXPENSE' },
  { code: '6900', name: 'General & Administrative', type: 'EXPENSE' },
];

export const ACC = {
  CASH: '1000', MPESA: '1010', BANK: '1020', CARD: '1030',
  AR_PATIENT: '1100', AR_SHA: '1110', AR_INSURANCE: '1120',
  VAT: '2100', DISCOUNTS: '4900', OTHER_REVENUE: '4090',
} as const;

export function cashAccountFor(method: string): string {
  switch ((method || '').toUpperCase()) {
    case 'CASH': return ACC.CASH;
    case 'MPESA': case 'AIRTEL': case 'MOMO': return ACC.MPESA;
    case 'CARD': return ACC.CARD;
    case 'WAIVER': return ACC.DISCOUNTS;
    default: return ACC.BANK; // BANK, CHEQUE, EFT
  }
}

export function revenueAccountFor(category?: string | null): string {
  switch ((category || '').toUpperCase()) {
    case 'CONSULTATION': return '4000';
    case 'LAB': return '4010';
    case 'IMAGING': return '4020';
    case 'PROCEDURE': return '4030';
    case 'BED': return '4040';
    case 'PHARMACY': return '4050';
    case 'NURSING': return '4060';
    case 'THEATRE': return '4070';
    default: return ACC.OTHER_REVENUE;
  }
}

export function schemeReceivableFor(payerType?: string | null): string {
  return (payerType || '').toUpperCase() === 'SHA' ? ACC.AR_SHA : ACC.AR_INSURANCE;
}

export interface BillForPosting {
  discountMinor: number;
  payerAmountMinor: number;
  payerType: string;
  lines: { totalMinor: number; vatMinor: number; category: string | null }[];
}

/** Bill → journal: Dr receivables (patient + scheme) & discounts, Cr revenue by category (net of VAT), Cr VAT. */
export function billJournalLines(b: BillForPosting): JournalLine[] {
  const gross = b.lines.reduce((s, l) => s + l.totalMinor, 0);
  const vat = b.lines.reduce((s, l) => s + l.vatMinor, 0);
  const discount = Math.min(Math.max(0, b.discountMinor), gross);
  const scheme = Math.min(Math.max(0, b.payerAmountMinor), gross - discount);
  const patient = gross - discount - scheme;
  const lines: JournalLine[] = [
    { accountCode: ACC.AR_PATIENT, debitMinor: patient, creditMinor: 0 },
    { accountCode: schemeReceivableFor(b.payerType), debitMinor: scheme, creditMinor: 0 },
    { accountCode: ACC.DISCOUNTS, debitMinor: discount, creditMinor: 0 },
    { accountCode: ACC.VAT, debitMinor: 0, creditMinor: vat },
    ...b.lines.map((l) => ({ accountCode: revenueAccountFor(l.category), debitMinor: 0, creditMinor: l.totalMinor - l.vatMinor })),
  ];
  return compactLines(lines);
}

export function paymentJournalLines(p: { method: string; amountMinor: number }): JournalLine[] {
  return compactLines([
    { accountCode: cashAccountFor(p.method), debitMinor: p.amountMinor, creditMinor: 0 },
    { accountCode: ACC.AR_PATIENT, debitMinor: 0, creditMinor: p.amountMinor },
  ]);
}

export interface AccountRow { code: string; name: string; type: string }
export interface BalanceRow extends AccountRow { debitMinor: number; creditMinor: number; balanceMinor: number }

/** Sum journal lines per account. balanceMinor is in the account's natural direction (Dr for assets/expenses). */
export function trialBalance(accounts: AccountRow[], journals: { lines: JournalLine[] }[]): { rows: BalanceRow[]; totalDebitMinor: number; totalCreditMinor: number } {
  const byCode = new Map<string, BalanceRow>();
  for (const a of accounts) byCode.set(a.code, { ...a, debitMinor: 0, creditMinor: 0, balanceMinor: 0 });
  for (const j of journals) for (const l of j.lines) {
    let row = byCode.get(l.accountCode);
    if (!row) { row = { code: l.accountCode, name: '(unknown account)', type: 'ASSET', debitMinor: 0, creditMinor: 0, balanceMinor: 0 }; byCode.set(l.accountCode, row); }
    row.debitMinor += l.debitMinor || 0;
    row.creditMinor += l.creditMinor || 0;
  }
  const rows = [...byCode.values()]
    .filter((r) => r.debitMinor || r.creditMinor)
    .map((r) => ({ ...r, balanceMinor: ['ASSET', 'EXPENSE'].includes(r.type) ? r.debitMinor - r.creditMinor : r.creditMinor - r.debitMinor }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    rows,
    totalDebitMinor: rows.reduce((s, r) => s + r.debitMinor, 0),
    totalCreditMinor: rows.reduce((s, r) => s + r.creditMinor, 0),
  };
}

export function incomeStatement(rows: BalanceRow[]) {
  const income = rows.filter((r) => r.type === 'INCOME');
  const expenses = rows.filter((r) => r.type === 'EXPENSE');
  const totalIncomeMinor = income.reduce((s, r) => s + r.balanceMinor, 0);
  const totalExpensesMinor = expenses.reduce((s, r) => s + r.balanceMinor, 0);
  return { income, expenses, totalIncomeMinor, totalExpensesMinor, netSurplusMinor: totalIncomeMinor - totalExpensesMinor };
}

export function balanceSheet(rows: BalanceRow[]) {
  const pick = (t: string) => rows.filter((r) => r.type === t);
  const sum = (rs: BalanceRow[]) => rs.reduce((s, r) => s + r.balanceMinor, 0);
  const { netSurplusMinor } = incomeStatement(rows);
  const assets = pick('ASSET');
  const liabilities = pick('LIABILITY');
  const equity = pick('EQUITY');
  const totalAssetsMinor = sum(assets);
  const totalLiabilitiesMinor = sum(liabilities);
  const totalEquityMinor = sum(equity) + netSurplusMinor;
  return {
    assets, liabilities, equity, currentYearSurplusMinor: netSurplusMinor,
    totalAssetsMinor, totalLiabilitiesMinor, totalEquityMinor,
    balanced: totalAssetsMinor === totalLiabilitiesMinor + totalEquityMinor,
  };
}

export const AGEING_BUCKETS = ['0-30', '31-60', '61-90', '91-120', '120+'] as const;
export function ageingBucket(asOf: Date, date: Date): (typeof AGEING_BUCKETS)[number] {
  const days = Math.floor((asOf.getTime() - date.getTime()) / 86400000);
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 120) return '91-120';
  return '120+';
}
