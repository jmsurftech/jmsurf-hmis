/**
 * ICD → MOH 705A/705B (OPD morbidity summary) category mapping for Kenya.
 * Matching is by code prefix (longest prefix wins). Both ICD-10 and ICD-11 prefixes are supported.
 * NOTE: verify against the current MOH 705 tool / KHIS dataset before production use.
 */
export interface MohCategory {
  key: string;
  label: string;
  icd10: string[];
  icd11: string[];
  /** Only reported in 705A (under 5) or 705B (5 and over); undefined = both. */
  only?: '705A' | '705B';
}

export const MOH705_CATEGORIES: MohCategory[] = [
  { key: 'DIARRHOEA_NO_DEHYDRATION', label: 'Diarrhoea with no dehydration', icd10: ['A09', 'K52.9'], icd11: ['1A40', 'ME05.1'] },
  { key: 'DIARRHOEA_DEHYDRATION', label: 'Diarrhoea with dehydration', icd10: ['E86'], icd11: ['5C70'] },
  { key: 'CHOLERA', label: 'Cholera', icd10: ['A00'], icd11: ['1A00'] },
  { key: 'DYSENTERY', label: 'Dysentery (bloody diarrhoea)', icd10: ['A03', 'A06.0'], icd11: ['1A02', '1A36'] },
  { key: 'TYPHOID', label: 'Typhoid fever', icd10: ['A01'], icd11: ['1A07', '1A08'] },
  { key: 'TUBERCULOSIS', label: 'Tuberculosis', icd10: ['A15', 'A16', 'A17', 'A18', 'A19'], icd11: ['1B10', '1B11', '1B12', '1B13', '1B14'] },
  { key: 'MENINGOCOCCAL', label: 'Meningococcal meningitis', icd10: ['A39'], icd11: ['1C1C'] },
  { key: 'TETANUS', label: 'Tetanus', icd10: ['A33', 'A34', 'A35'], icd11: ['1C13', '1C14', '1C15'] },
  { key: 'POLIO', label: 'Poliomyelitis (AFP)', icd10: ['A80'], icd11: ['1C81'] },
  { key: 'CHICKEN_POX', label: 'Chicken pox', icd10: ['B01'], icd11: ['1E90'] },
  { key: 'MEASLES', label: 'Measles', icd10: ['B05'], icd11: ['1F03'] },
  { key: 'HEPATITIS', label: 'Hepatitis', icd10: ['B15', 'B16', 'B17', 'B18', 'B19'], icd11: ['1E50', '1E51'] },
  { key: 'MUMPS', label: 'Mumps', icd10: ['B26'], icd11: ['1D80'] },
  { key: 'MALARIA_CONFIRMED', label: 'Confirmed malaria', icd10: ['B50', 'B51', 'B52', 'B53'], icd11: ['1F40', '1F41', '1F42', '1F43', '1F44'] },
  { key: 'MALARIA_SUSPECTED', label: 'Suspected malaria', icd10: ['B54'], icd11: ['1F4Z'] },
  { key: 'FEVER', label: 'Fevers (other)', icd10: ['R50'], icd11: ['MG26'] },
  { key: 'URTI', label: 'Upper respiratory tract infections', icd10: ['J00', 'J01', 'J02', 'J03', 'J04', 'J05', 'J06'], icd11: ['CA0'] },
  { key: 'PNEUMONIA', label: 'Pneumonia', icd10: ['J12', 'J13', 'J14', 'J15', 'J16', 'J17', 'J18'], icd11: ['CA40'] },
  { key: 'ASTHMA', label: 'Asthma', icd10: ['J45', 'J46'], icd11: ['CA23'] },
  { key: 'OTHER_RESPIRATORY', label: 'Other diseases of respiratory system', icd10: ['J'], icd11: ['CA', 'CB'] },
  { key: 'UTI', label: 'Urinary tract infection', icd10: ['N39.0', 'N30'], icd11: ['GC08', 'GC00'] },
  { key: 'BILHARZIA', label: 'Bilharzia (schistosomiasis)', icd10: ['B65'], icd11: ['1F86'] },
  { key: 'INTESTINAL_WORMS', label: 'Intestinal worms', icd10: ['B76', 'B77', 'B78', 'B79', 'B80', 'B81', 'B82', 'B68', 'B69', 'B70', 'B71'], icd11: ['1F6', '1F7', '1F9'] },
  { key: 'MALNUTRITION', label: 'Malnutrition', icd10: ['E40', 'E41', 'E42', 'E43', 'E44', 'E45', 'E46'], icd11: ['5B5', '5B7'] },
  { key: 'ANAEMIA', label: 'Anaemia', icd10: ['D50', 'D51', 'D52', 'D53', 'D64'], icd11: ['3A'] },
  { key: 'EYE_INFECTIONS', label: 'Eye infections', icd10: ['H10', 'H00', 'H01'], icd11: ['9A60', '9A0'] },
  { key: 'EAR_INFECTIONS', label: 'Ear infections', icd10: ['H65', 'H66', 'H60'], icd11: ['AB0', 'AA'] },
  { key: 'SKIN', label: 'Diseases of the skin', icd10: ['L', 'B35', 'B36', 'B86'], icd11: ['EA', 'EB', 'EC', 'ED', 'EE', 'EF', 'EG', 'EH', 'EJ', 'EK', 'EL', 'EM', '1F2'] },
  { key: 'JOINTS', label: 'Diseases of joints / musculoskeletal', icd10: ['M'], icd11: ['FA', 'FB', 'FC'] },
  { key: 'STI', label: 'Sexually transmitted infections', icd10: ['A50', 'A51', 'A52', 'A53', 'A54', 'A55', 'A56', 'A57', 'A58', 'A59', 'A60', 'A63', 'A64'], icd11: ['1A6', '1A7', '1A8', '1A9'] },
  { key: 'HIV', label: 'HIV related conditions', icd10: ['B20', 'B21', 'B22', 'B23', 'B24', 'Z21'], icd11: ['1C6'] },
  { key: 'BRUCELLOSIS', label: 'Brucellosis', icd10: ['A23'], icd11: ['1B95'] },
  { key: 'HYPERTENSION', label: 'Hypertension', icd10: ['I10', 'I11', 'I12', 'I13', 'I15'], icd11: ['BA0'], only: '705B' },
  { key: 'DIABETES', label: 'Diabetes', icd10: ['E10', 'E11', 'E12', 'E13', 'E14'], icd11: ['5A1'] },
  { key: 'CARDIOVASCULAR', label: 'Other cardiovascular conditions', icd10: ['I'], icd11: ['BA', 'BB', 'BC', 'BD', 'BE'] },
  { key: 'MENTAL', label: 'Mental disorders', icd10: ['F'], icd11: ['6'] },
  { key: 'EPILEPSY', label: 'Epilepsy / convulsions', icd10: ['G40', 'G41', 'R56'], icd11: ['8A6'] },
  { key: 'DENTAL', label: 'Dental disorders', icd10: ['K00', 'K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'K08'], icd11: ['DA0'] },
  { key: 'ABORTION', label: 'Abortion', icd10: ['O03', 'O04', 'O05', 'O06'], icd11: ['JA0'], only: '705B' },
  { key: 'PREGNANCY_COMPLICATIONS', label: 'Pregnancy related complications', icd10: ['O'], icd11: ['JA', 'JB'], only: '705B' },
  { key: 'POISONING', label: 'Poisoning', icd10: ['T36', 'T37', 'T38', 'T39', 'T40', 'T41', 'T42', 'T43', 'T44', 'T45', 'T46', 'T47', 'T48', 'T49', 'T50', 'T51', 'T52', 'T53', 'T54', 'T55', 'T56', 'T57', 'T58', 'T59', 'T60', 'T61', 'T62', 'T64', 'T65'], icd11: ['NE6'] },
  { key: 'SNAKE_BITE', label: 'Snake bites', icd10: ['T63.0', 'X20', 'W59'], icd11: ['NE84'] },
  { key: 'DOG_BITE', label: 'Dog bites', icd10: ['W54'], icd11: ['PA9'] },
  { key: 'BURNS', label: 'Burns', icd10: ['T20', 'T21', 'T22', 'T23', 'T24', 'T25', 'T29', 'T30', 'T31'], icd11: ['ND9'] },
  { key: 'ROAD_TRAFFIC', label: 'Road traffic injuries', icd10: ['V'], icd11: ['PA0', 'PA1'] },
  { key: 'SEXUAL_ASSAULT', label: 'Sexual violence', icd10: ['T74.2', 'Y05'], icd11: ['PJ0'] },
  { key: 'OTHER_INJURIES', label: 'Other injuries', icd10: ['S', 'T'], icd11: ['NA', 'NB', 'NC', 'ND', 'NE', 'NF'] },
  { key: 'ALL_OTHER', label: 'All other diseases', icd10: [], icd11: [] },
];

const index = (() => {
  const list: { prefix: string; system: 'ICD-10' | 'ICD-11'; cat: MohCategory }[] = [];
  for (const c of MOH705_CATEGORIES) {
    for (const p of c.icd10) list.push({ prefix: p.toUpperCase(), system: 'ICD-10', cat: c });
    for (const p of c.icd11) list.push({ prefix: p.toUpperCase(), system: 'ICD-11', cat: c });
  }
  return list.sort((a, b) => b.prefix.length - a.prefix.length);
})();

export const OTHER_CATEGORY = MOH705_CATEGORIES[MOH705_CATEGORIES.length - 1];

export function mohCategoryFor(code: string, codeSystem = 'ICD-11'): MohCategory {
  const c = (code || '').toUpperCase().trim();
  const sys = codeSystem.toUpperCase().includes('10') ? 'ICD-10' : 'ICD-11';
  const hit = index.find((e) => e.system === sys && c.startsWith(e.prefix));
  return hit?.cat ?? OTHER_CATEGORY;
}
