/**
 * DHIS2 / KHIS dataset mapping for MOH reports.
 * The UIDs below are PLACEHOLDERS for the sandbox (apps/mock-servers). Replace them with the real KHIS
 * dataSet / dataElement / categoryOptionCombo UIDs for your instance, or override per tenant via
 * tenant.settings.dhis2Mapping (same shape), which takes precedence.
 */
export interface Dhis2Mapping {
  dataSets: Record<string, string>;
  defaultCategoryOptionCombo: string;
  /** report → (row key → dataElement UID) */
  dataElements: Record<string, Record<string, string>>;
}

export const DEFAULT_DHIS2_MAPPING: Dhis2Mapping = {
  dataSets: { MOH705A: 'MOH705AdsUi', MOH705B: 'MOH705BdsUi', MOH717: 'MOH717dsUid' },
  defaultCategoryOptionCombo: 'HllvX50cXC0',
  dataElements: {
    MOH705A: {
      DIARRHOEA_NO_DEHYDRATION: 'A705Diarr01', DIARRHOEA_DEHYDRATION: 'A705Diarr02', CHOLERA: 'A705Chole01', DYSENTERY: 'A705Dysen01',
      TYPHOID: 'A705Typho01', TUBERCULOSIS: 'A705Tuber01', MENINGOCOCCAL: 'A705Menin01', TETANUS: 'A705Tetan01', POLIO: 'A705Polio01',
      CHICKEN_POX: 'A705Chick01', MEASLES: 'A705Measl01', HEPATITIS: 'A705Hepat01', MUMPS: 'A705Mumps01', MALARIA_CONFIRMED: 'A705MalCo01',
      MALARIA_SUSPECTED: 'A705MalSu01', FEVER: 'A705Fever01', URTI: 'A705URTIx01', PNEUMONIA: 'A705Pneum01', ASTHMA: 'A705Asthm01',
      OTHER_RESPIRATORY: 'A705OResp01', UTI: 'A705UTIxx01', BILHARZIA: 'A705Bilha01', INTESTINAL_WORMS: 'A705Worms01',
      MALNUTRITION: 'A705Malnu01', ANAEMIA: 'A705Anaem01', EYE_INFECTIONS: 'A705EyeIn01', EAR_INFECTIONS: 'A705EarIn01', SKIN: 'A705Skinx01',
      JOINTS: 'A705Joint01', STI: 'A705STIxx01', HIV: 'A705HIVxx01', BRUCELLOSIS: 'A705Bruce01', DIABETES: 'A705Diabe01',
      CARDIOVASCULAR: 'A705Cardi01', MENTAL: 'A705Menta01', EPILEPSY: 'A705Epile01', DENTAL: 'A705Denta01', POISONING: 'A705Poiso01',
      SNAKE_BITE: 'A705Snake01', DOG_BITE: 'A705DogBi01', BURNS: 'A705Burns01', ROAD_TRAFFIC: 'A705RTAxx01', SEXUAL_ASSAULT: 'A705SexAs01',
      OTHER_INJURIES: 'A705OInju01', ALL_OTHER: 'A705Other01', TOTAL: 'A705Total01',
    },
    MOH705B: {
      DIARRHOEA_NO_DEHYDRATION: 'B705Diarr01', DIARRHOEA_DEHYDRATION: 'B705Diarr02', CHOLERA: 'B705Chole01', DYSENTERY: 'B705Dysen01',
      TYPHOID: 'B705Typho01', TUBERCULOSIS: 'B705Tuber01', MENINGOCOCCAL: 'B705Menin01', TETANUS: 'B705Tetan01', POLIO: 'B705Polio01',
      CHICKEN_POX: 'B705Chick01', MEASLES: 'B705Measl01', HEPATITIS: 'B705Hepat01', MUMPS: 'B705Mumps01', MALARIA_CONFIRMED: 'B705MalCo01',
      MALARIA_SUSPECTED: 'B705MalSu01', FEVER: 'B705Fever01', URTI: 'B705URTIx01', PNEUMONIA: 'B705Pneum01', ASTHMA: 'B705Asthm01',
      OTHER_RESPIRATORY: 'B705OResp01', UTI: 'B705UTIxx01', BILHARZIA: 'B705Bilha01', INTESTINAL_WORMS: 'B705Worms01',
      MALNUTRITION: 'B705Malnu01', ANAEMIA: 'B705Anaem01', EYE_INFECTIONS: 'B705EyeIn01', EAR_INFECTIONS: 'B705EarIn01', SKIN: 'B705Skinx01',
      JOINTS: 'B705Joint01', STI: 'B705STIxx01', HIV: 'B705HIVxx01', BRUCELLOSIS: 'B705Bruce01', HYPERTENSION: 'B705Hyper01',
      DIABETES: 'B705Diabe01', CARDIOVASCULAR: 'B705Cardi01', MENTAL: 'B705Menta01', EPILEPSY: 'B705Epile01', DENTAL: 'B705Denta01',
      ABORTION: 'B705Abort01', PREGNANCY_COMPLICATIONS: 'B705Pregn01', POISONING: 'B705Poiso01', SNAKE_BITE: 'B705Snake01',
      DOG_BITE: 'B705DogBi01', BURNS: 'B705Burns01', ROAD_TRAFFIC: 'B705RTAxx01', SEXUAL_ASSAULT: 'B705SexAs01', OTHER_INJURIES: 'B705OInju01',
      ALL_OTHER: 'B705Other01', TOTAL: 'B705Total01',
    },
    MOH717: {
      OPD_NEW: 'W717OpdNew1', OPD_REVISIT: 'W717OpdRev1', EMERGENCY: 'W717Emerg01', ADMISSIONS: 'W717Admit01', DISCHARGES: 'W717Disch01',
      DEATHS: 'W717Death01', BED_DAYS: 'W717BedDy01', LAB_TESTS: 'W717LabTs01', IMAGING: 'W717Imagi01', PRESCRIPTIONS: 'W717Presc01',
      PROCEDURES: 'W717Proce01', SURGERIES: 'W717Surge01', DELIVERIES: 'W717Deliv01', DIALYSIS: 'W717Dialy01',
    },
  },
};

export interface DataValue { dataElement: string; period: string; orgUnit: string; categoryOptionCombo: string; value: string }

/** Build a DHIS2 dataValueSet payload from report rows ({key, value}). Unmapped rows are listed in `unmapped`. */
export function buildDataValueSet(
  report: string, period: string, orgUnit: string, rows: { key: string; value: number }[], mapping: Dhis2Mapping = DEFAULT_DHIS2_MAPPING,
) {
  const des = mapping.dataElements[report] ?? {};
  const dataValues: DataValue[] = [];
  const unmapped: string[] = [];
  for (const r of rows) {
    const de = des[r.key];
    if (!de) { unmapped.push(r.key); continue; }
    dataValues.push({ dataElement: de, period: period.replace('-', ''), orgUnit, categoryOptionCombo: mapping.defaultCategoryOptionCombo, value: String(r.value) });
  }
  return {
    payload: { dataSet: mapping.dataSets[report], completeDate: new Date().toISOString().slice(0, 10), period: period.replace('-', ''), orgUnit, dataValues },
    unmapped,
  };
}
