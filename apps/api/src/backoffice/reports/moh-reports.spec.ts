import { mohCategoryFor } from './moh-mapping';
import { ageInYears, moh705 } from './moh-reports';
import { buildDataValueSet } from './dhis2-mapping';

describe('MOH mapping', () => {
  it('maps ICD-10 and ICD-11 codes (longest prefix wins)', () => {
    expect(mohCategoryFor('B54', 'ICD-10').key).toBe('MALARIA_SUSPECTED');
    expect(mohCategoryFor('B50.9', 'ICD-10').key).toBe('MALARIA_CONFIRMED');
    expect(mohCategoryFor('J18.9', 'ICD-10').key).toBe('PNEUMONIA');
    expect(mohCategoryFor('J30.1', 'ICD-10').key).toBe('OTHER_RESPIRATORY');
    expect(mohCategoryFor('I10', 'ICD-10').key).toBe('HYPERTENSION');
    expect(mohCategoryFor('I50', 'ICD-10').key).toBe('CARDIOVASCULAR');
    expect(mohCategoryFor('1F40', 'ICD-11').key).toBe('MALARIA_CONFIRMED');
    expect(mohCategoryFor('CA40.Z', 'ICD-11').key).toBe('PNEUMONIA');
    expect(mohCategoryFor('ZZZ', 'ICD-10').key).toBe('ALL_OTHER');
  });
});

describe('MOH 705', () => {
  const at = new Date('2026-10-10');
  const rows = [
    { code: 'B54', codeSystem: 'ICD-10', visitDate: at, dateOfBirth: new Date('2024-01-01'), sex: 'MALE' },
    { code: 'B54', codeSystem: 'ICD-10', visitDate: at, dateOfBirth: new Date('1990-01-01'), sex: 'FEMALE' },
    { code: 'I10', codeSystem: 'ICD-10', visitDate: at, dateOfBirth: new Date('2023-01-01'), sex: 'FEMALE' },
    { code: 'J06.9', codeSystem: 'ICD-10', visitDate: at, dateOfBirth: null, sex: 'MALE' },
  ];
  it('age calc', () => {
    expect(ageInYears(new Date('2021-10-11'), at)).toBe(4);
    expect(ageInYears(new Date('2021-10-10'), at)).toBe(5);
  });
  it('splits under-5 and over-5', () => {
    const a = moh705(rows, '705A');
    expect(a.rows.find((r) => r.key === 'MALARIA_SUSPECTED')!.total).toBe(1);
    expect(a.rows.find((r) => r.key === 'HYPERTENSION')).toBeUndefined();
    expect(a.rows.find((r) => r.key === 'ALL_OTHER')!.total).toBe(1); // hypertension not reported for <5
    expect(a.rows.find((r) => r.key === 'TOTAL')!.total).toBe(2);
    const b = moh705(rows, '705B');
    expect(b.rows.find((r) => r.key === 'URTI')!.male).toBe(1);
    expect(b.rows.find((r) => r.key === 'TOTAL')!.total).toBe(2);
  });
  it('builds a DHIS2 dataValueSet', () => {
    const { payload, unmapped } = buildDataValueSet('MOH705B', '2026-10', 'OU123', [{ key: 'URTI', value: 3 }, { key: 'NOPE', value: 1 }]);
    expect(payload.period).toBe('202610');
    expect(payload.dataValues).toHaveLength(1);
    expect(payload.dataValues[0]).toMatchObject({ orgUnit: 'OU123', value: '3' });
    expect(unmapped).toEqual(['NOPE']);
  });
});
