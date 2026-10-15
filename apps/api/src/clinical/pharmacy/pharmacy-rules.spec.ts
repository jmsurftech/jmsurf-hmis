import { allergyWarnings, dosesPerDay, duplicateWarnings } from './rx-checks';
import { fefoPick } from './fefo';

describe('prescription checks', () => {
  it('flags direct allergy', () => {
    expect(allergyWarnings({ name: 'Amoxicillin 500mg' }, [{ substance: 'Amoxicillin' }])[0].type).toBe('ALLERGY');
  });
  it('flags class cross-sensitivity', () => {
    const w = allergyWarnings({ name: 'Augmentin', genericName: 'co-amoxiclav' }, [{ substance: 'Penicillin' }]);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].severity).toBe('HIGH');
  });
  it('warns penicillin-cephalosporin', () => {
    const w = allergyWarnings({ name: 'Ceftriaxone 1g' }, [{ substance: 'penicillin' }]);
    expect(w.some((x) => x.severity === 'MEDIUM')).toBe(true);
  });
  it('no warning when unrelated', () => {
    expect(allergyWarnings({ name: 'Paracetamol' }, [{ substance: 'Penicillin' }])).toEqual([]);
  });
  it('detects duplicates and duplicate therapy', () => {
    expect(duplicateWarnings({ itemId: 'a', name: 'Ibuprofen' }, [{ itemId: 'a', drugName: 'Ibuprofen' }])[0].severity).toBe('HIGH');
    expect(duplicateWarnings({ itemId: 'b', name: 'Diclofenac' }, [{ itemId: 'a', drugName: 'Ibuprofen' }])[0].severity).toBe('MEDIUM');
    expect(duplicateWarnings({ itemId: 'c', name: 'Paracetamol' }, [{ itemId: 'a', drugName: 'Ibuprofen' }])).toEqual([]);
  });
  it('frequency', () => {
    expect(dosesPerDay('TDS')).toBe(3);
    expect(dosesPerDay('bd')).toBe(2);
  });
});

describe('FEFO', () => {
  const now = new Date('2026-10-01');
  const batches = [
    { id: 'late', quantity: 50, expiryDate: new Date('2027-06-01') },
    { id: 'expired', quantity: 100, expiryDate: new Date('2026-09-01') },
    { id: 'soon', quantity: 10, expiryDate: new Date('2026-12-01') },
    { id: 'noexp', quantity: 100, expiryDate: null },
  ];
  it('picks earliest expiry first, skipping expired', () => {
    const p = fefoPick(batches, 25, now);
    expect(p.map((x) => [x.batch.id, x.take])).toEqual([['soon', 10], ['late', 15]]);
  });
  it('uses no-expiry batches last', () => {
    expect(fefoPick(batches, 70, now).map((x) => x.batch.id)).toEqual(['soon', 'late', 'noexp']);
  });
  it('throws when insufficient', () => {
    expect(() => fefoPick(batches, 1000, now)).toThrow(/Insufficient/);
  });
});
