import {
  ageingBucket, balanceSheet, billJournalLines, compactLines, JournalValidationError, KENYA_HEALTHCARE_COA, paymentJournalLines,
  trialBalance, incomeStatement, validateJournal,
} from './accounting.rules';

describe('validateJournal', () => {
  it('accepts a balanced journal', () => {
    expect(validateJournal([
      { accountCode: '1000', debitMinor: 5000, creditMinor: 0 },
      { accountCode: '4000', debitMinor: 0, creditMinor: 5000 },
    ])).toEqual({ debitMinor: 5000, creditMinor: 5000 });
  });
  it('rejects unbalanced journals', () => {
    expect(() => validateJournal([
      { accountCode: '1000', debitMinor: 5000, creditMinor: 0 },
      { accountCode: '4000', debitMinor: 0, creditMinor: 4999 },
    ])).toThrow(JournalValidationError);
  });
  it('rejects single line, negative, fractional, two-sided and zero lines', () => {
    expect(() => validateJournal([{ accountCode: '1000', debitMinor: 1, creditMinor: 0 }])).toThrow(/two lines/);
    expect(() => validateJournal([{ accountCode: '1000', debitMinor: -1, creditMinor: 0 }, { accountCode: '4000', debitMinor: 0, creditMinor: -1 }])).toThrow(/negative/);
    expect(() => validateJournal([{ accountCode: '1000', debitMinor: 1.5, creditMinor: 0 }, { accountCode: '4000', debitMinor: 0, creditMinor: 1.5 }])).toThrow(/integer/);
    expect(() => validateJournal([{ accountCode: '1000', debitMinor: 1, creditMinor: 1 }, { accountCode: '4000', debitMinor: 0, creditMinor: 0 }])).toThrow(/both/);
    expect(() => validateJournal([{ accountCode: '1000', debitMinor: 0, creditMinor: 0 }, { accountCode: '4000', debitMinor: 0, creditMinor: 0 }])).toThrow();
  });
});

describe('posting maps', () => {
  it('posts an M-Pesa payment Dr M-Pesa Cr receivables', () => {
    const l = paymentJournalLines({ method: 'MPESA', amountMinor: 150000 });
    expect(l).toEqual([
      { accountCode: '1010', debitMinor: 150000, creditMinor: 0, costCentre: undefined },
      { accountCode: '1100', debitMinor: 0, creditMinor: 150000, costCentre: undefined },
    ]);
    validateJournal(l);
  });
  it('posts a SHA bill with VAT, discount and patient copay, balanced', () => {
    const l = billJournalLines({
      discountMinor: 1000, payerAmountMinor: 20000, payerType: 'SHA',
      lines: [
        { totalMinor: 10000, vatMinor: 0, category: 'CONSULTATION' },
        { totalMinor: 11600, vatMinor: 1600, category: 'PHARMACY' },
        { totalMinor: 2000, vatMinor: 0, category: 'LAB' },
      ],
    });
    validateJournal(l);
    const get = (c: string) => l.find((x) => x.accountCode === c)!;
    expect(get('1110').debitMinor).toBe(20000);
    expect(get('1100').debitMinor).toBe(23600 - 1000 - 20000);
    expect(get('4900').debitMinor).toBe(1000);
    expect(get('2100').creditMinor).toBe(1600);
    expect(get('4050').creditMinor).toBe(10000);
  });
  it('compacts lines', () => {
    expect(compactLines([
      { accountCode: 'A', debitMinor: 5, creditMinor: 0 }, { accountCode: 'A', debitMinor: 5, creditMinor: 0 }, { accountCode: 'B', debitMinor: 0, creditMinor: 0 },
    ])).toHaveLength(1);
  });
});

describe('statements', () => {
  const accounts = KENYA_HEALTHCARE_COA.map(({ code, name, type }) => ({ code, name, type }));
  const journals = [
    { lines: [{ accountCode: '3000', debitMinor: 0, creditMinor: 100000 }, { accountCode: '1020', debitMinor: 100000, creditMinor: 0 }] },
    { lines: billJournalLines({ discountMinor: 0, payerAmountMinor: 0, payerType: 'CASH', lines: [{ totalMinor: 5000, vatMinor: 0, category: 'CONSULTATION' }] }) },
    { lines: paymentJournalLines({ method: 'CASH', amountMinor: 5000 }) },
    { lines: [{ accountCode: '6100', debitMinor: 2000, creditMinor: 0 }, { accountCode: '1020', debitMinor: 0, creditMinor: 2000 }] },
  ];
  it('trial balance balances; IS and BS agree', () => {
    const tb = trialBalance(accounts, journals);
    expect(tb.totalDebitMinor).toBe(tb.totalCreditMinor);
    const is = incomeStatement(tb.rows);
    expect(is.netSurplusMinor).toBe(3000);
    const bs = balanceSheet(tb.rows);
    expect(bs.balanced).toBe(true);
    expect(bs.totalAssetsMinor).toBe(103000);
  });
  it('ageing buckets', () => {
    const now = new Date('2026-10-15');
    expect(ageingBucket(now, new Date('2026-10-01'))).toBe('0-30');
    expect(ageingBucket(now, new Date('2026-08-20'))).toBe('31-60');
    expect(ageingBucket(now, new Date('2026-01-01'))).toBe('120+');
  });
});
