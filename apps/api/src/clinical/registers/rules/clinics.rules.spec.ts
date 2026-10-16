import { ncdControlled } from './clinics.rules';
it('NCD control', () => {
  expect(ncdControlled('HTN', { systolic: 130, diastolic: 85 })).toBe(true);
  expect(ncdControlled('HTN', { systolic: 150, diastolic: 85 })).toBe(false);
  expect(ncdControlled('HTN_DM', { systolic: 130, diastolic: 80, fbs: 9 })).toBe(false);
  expect(ncdControlled('DM', {})).toBeNull();
});
