import { toMinor, toMajor, vatOf } from './money';

describe('money', () => {
  it('converts major/minor', () => {
    expect(toMinor(12.345)).toBe(1235);
    expect(toMajor(1050)).toBe(10.5);
  });
  it('extracts inclusive VAT', () => {
    expect(vatOf(11600, 0.16)).toBe(1600);
    expect(vatOf(1000, 0)).toBe(0);
  });
});
