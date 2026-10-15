import { bsaMosteller, cycleDates, plannedDose } from './oncology.rules';

describe('BSA (Mosteller)', () => {
  it('computes known values', () => {
    expect(bsaMosteller(170, 70)).toBe(1.82); // sqrt(11900/3600)=1.818
    expect(bsaMosteller(180, 80)).toBe(2);
    expect(bsaMosteller(150, 45)).toBe(1.37);
  });
  it('rejects invalid input', () => {
    expect(() => bsaMosteller(0, 70)).toThrow(); expect(() => bsaMosteller(170, -1)).toThrow(); expect(() => bsaMosteller(400, 70)).toThrow();
  });
});

describe('dose calculation', () => {
  it('per m², per kg, flat, modification and cap', () => {
    expect(plannedDose({ drug: 'Doxorubicin', dose: 60, unit: 'mg/m2' }, 1.82, 70).dose).toBe(109.2);
    expect(plannedDose({ drug: 'Carbo', dose: 5, unit: 'mg/kg' }, 1.82, 70).dose).toBe(350);
    expect(plannedDose({ drug: 'Doxorubicin', dose: 60, unit: 'mg/m2' }, 2, 80, 75).dose).toBe(90);
    const v = plannedDose({ drug: 'Vincristine', dose: 1.4, unit: 'mg/m2', maxDose: 2 }, 2, 80);
    expect(v).toMatchObject({ dose: 2, capped: true });
  });
  it('cycle dates', () => {
    const d = cycleDates(new Date('2026-01-01T00:00:00Z'), 3, 21);
    expect(d.map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-01-01', '2026-01-22', '2026-02-12']);
  });
});
