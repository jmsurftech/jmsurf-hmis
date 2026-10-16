import { isSuppressed, toCsv, tracingCategory, vlCategory } from './programmes.rules';

describe('viral suppression', () => {
  it('< 1000 copies is suppressed', () => {
    expect(isSuppressed(999)).toBe(true);
    expect(isSuppressed(1000)).toBe(false);
    expect(isSuppressed(250000)).toBe(false);
    expect(isSuppressed(0)).toBe(true);
  });
  it('LDL is suppressed without a count', () => { expect(isSuppressed(null, true)).toBe(true); });
  it('requires a count when not LDL', () => { expect(() => isSuppressed(null)).toThrow(); expect(() => isSuppressed(-5)).toThrow(); });
  it('categorises', () => {
    expect(vlCategory(20)).toBe('LDL'); expect(vlCategory(400)).toBe('LLV'); expect(vlCategory(5000)).toBe('UNSUPPRESSED');
  });
});

describe('defaulter tracing', () => {
  it('categories', () => {
    expect(tracingCategory(0)).toBe('ON_TIME'); expect(tracingCategory(3)).toBe('MISSED');
    expect(tracingCategory(14)).toBe('DEFAULTER'); expect(tracingCategory(45)).toBe('LTFU');
  });
});

it('csv escapes', () => {
  expect(toCsv(['a', 'b'], [{ a: 'x,y', b: 1 }])).toBe('a,b\n"x,y",1\n');
});
