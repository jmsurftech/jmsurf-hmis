import { deidentify, identifiersOf } from './deidentify';

describe('deidentify', () => {
  const known = identifiersOf({ firstName: 'Wanjiru', middleName: 'Achieng', lastName: 'Kamau', mrn: 'MRN-000123', idNumber: '28456123', crId: 'CR7788990011', phone: '+254712345678', email: 'w.kamau@example.com', nextOfKin: [{ name: 'Otieno Kamau', phone: '0722000111' }] });

  it('replaces known names, ids, phones and emails', () => {
    const r = deidentify('Wanjiru Kamau (MRN-000123, ID 28456123) called from 0712 345 678, email w.kamau@example.com. NOK Otieno on 0722000111.', known);
    expect(r.text).not.toMatch(/Wanjiru|Kamau|Otieno|000123|28456123|345 678|example\.com|0722000111/);
    expect(r.text).toContain('[NAME]');
    expect(r.text).toContain('[ID]');
    expect(r.text).toContain('[PHONE]');
    expect(r.text).toContain('[EMAIL]');
    expect(r.replacements).toBeGreaterThanOrEqual(6);
  });

  it('masks generic identifiers it was not told about', () => {
    const r = deidentify('Mgonjwa simu 0798 111 222, DOB 12/03/1990, CR ID CR99887766, other@x.org');
    expect(r.text).toBe('Mgonjwa simu [PHONE], DOB [DATE], CR [ID], [EMAIL]');
  });

  it('keeps clinical content intact', () => {
    const t = 'Fever 39.2C for 3 days, BP 120/80, Hb 9.8 g/dL. Plan: AL 4 tabs BD x3/7.';
    expect(deidentify(t, known).text).toBe(t);
  });

  it('is case-insensitive and word-bounded for names', () => {
    expect(deidentify('KAMAU and kamaumu', { names: ['Kamau'] }).text).toBe('[NAME] and kamaumu');
  });

  it('handles empty input', () => {
    expect(deidentify('', known)).toEqual({ text: '', replacements: 0 });
  });
});
