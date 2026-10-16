import { parseCsv, validateImport } from './csv-import.rules';

describe('CSV parsing', () => {
  it('handles quotes, commas, CRLF and blank lines', () => {
    const r = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,2');
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.rows).toEqual([['x, y', 'he said "hi"'], ['1', '2']]);
  });
});

describe('CSV import validation', () => {
  const csv = parseCsv('First,Last,Gender,DOB,MRN\nJane,Doe,F,1990-05-01,A1\nJohn,,M,01/02/1985,A2\nAmy,Lee,X,bad,A1\nBob,Ray,M,,A9');
  const mapping = { firstName: 'First', lastName: 'Last', sex: 'Gender', dateOfBirth: 'DOB', mrn: 'MRN' };
  it('reports row-level errors and keeps valid rows', () => {
    const r = validateImport('patients', csv, mapping, { existingKeys: new Set(['A9']) });
    expect(r.totalRows).toBe(4);
    expect(r.validRows).toBe(1);
    expect(r.records[0]).toMatchObject({ firstName: 'Jane', sex: 'FEMALE', mrn: 'A1' });
    const msgs = r.errors.map((e) => `${e.row}:${e.field}`);
    expect(msgs).toEqual(expect.arrayContaining(['3:lastName', '4:sex', '4:dateOfBirth', '4:mrn', '5:mrn']));
  });
  it('rejects unmapped required columns', () => {
    const r = validateImport('patients', csv, { firstName: 'First' });
    expect(r.errors.some((e) => e.row === 0 && e.field === 'lastName')).toBe(true);
  });
  it('converts money to minor units and checks balanced opening balances', () => {
    const ob = parseCsv('acc,dr,cr\n1000,"1,500.50",\n3000,,1500.50');
    const ok = validateImport('openingBalances', ob, { accountCode: 'acc', debitMinor: 'dr', creditMinor: 'cr' }, { accountCodes: new Set(['1000', '3000']) });
    expect(ok.errors).toEqual([]);
    expect(ok.records[0].debitMinor).toBe(150050);
    const bad = validateImport('openingBalances', parseCsv('acc,dr,cr\n1000,10,\n3000,,5'), { accountCode: 'acc', debitMinor: 'dr', creditMinor: 'cr' });
    expect(bad.errors.some((e) => /do not equal/.test(e.message))).toBe(true);
  });
});
