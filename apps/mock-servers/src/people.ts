/** Deterministic fake people derived from an ID number (same input → same person). */
const FIRST_F = ['Wanjiku', 'Akinyi', 'Njeri', 'Chebet', 'Atieno', 'Mumbua', 'Wairimu', 'Nekesa', 'Halima', 'Zawadi'];
const FIRST_M = ['Kamau', 'Otieno', 'Kiprono', 'Mwangi', 'Omondi', 'Mutua', 'Wafula', 'Kibet', 'Hassan', 'Baraka'];
const LAST = ['Kariuki', 'Ochieng', 'Koech', 'Njoroge', 'Odhiambo', 'Musyoka', 'Barasa', 'Rotich', 'Abdi', 'Maina'];

export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function personFor(idType: string, idNumber: string) {
  const h = hash(`${idType}:${idNumber}`);
  const female = h % 2 === 0;
  const first = (female ? FIRST_F : FIRST_M)[h % 10];
  const middle = (female ? FIRST_F : FIRST_M)[(h >>> 4) % 10];
  const last = LAST[(h >>> 8) % 10];
  const year = 1950 + (h % 55), month = 1 + ((h >>> 3) % 12), day = 1 + ((h >>> 7) % 28);
  return {
    crId: `CR${String(h).padStart(10, '0').slice(0, 10)}`,
    shaNumber: `SHA${String(hash(idNumber)).slice(0, 9)}`,
    firstName: first, middleName: middle, lastName: last, gender: female ? 'female' : 'male',
    dateOfBirth: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    phone: `+2547${String(h).padStart(8, '0').slice(-8)}`,
    idType, idNumber,
  };
}
