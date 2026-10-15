import 'reflect-metadata';
import { monthRange, pageArgs, toCsv } from './shared';

describe('backoffice shared', () => {
  it('builds CSV with quoting', () => {
    expect(toCsv([{ a: 1, b: 'x,y' }, { a: 2, b: 'q"t' }])).toBe('a,b\n1,"x,y"\n2,"q""t"');
  });
  it('paginates', () => {
    expect(pageArgs({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });
  it('month range', () => {
    const r = monthRange('2026-12');
    expect(r.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
