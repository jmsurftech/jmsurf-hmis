/**
 * Country packs: per-country defaults that drive adapter selection and localisation.
 * Tax rates are standard VAT at time of writing — verify with local counsel before go-live.
 */
export type FiscalAdapterKey = 'etims' | 'efris' | 'vfd' | 'ebm' | 'evat' | 'zra' | 'firs' | 'none';

export interface CountryPack {
  code: string; name: string; currency: string; timezone: string; phonePrefix: string;
  idTypes: string[];
  nationalInsurer: { name: string; code: string; adapter: string | null };
  fiscalAdapter: FiscalAdapterKey; fiscalRegime: string | null;
  mobileMoney: string[];
  tax: { vatStandard: number; vatReduced?: number; medicalServicesExempt: boolean };
  payrollHint: string;
  languages: string[];
}

export const COUNTRY_PACKS: Record<string, CountryPack> = {
  KE: {
    code: 'KE', name: 'Kenya', currency: 'KES', timezone: 'Africa/Nairobi', phonePrefix: '+254',
    idTypes: ['NATIONAL_ID', 'MAISHA_NAMBA', 'PASSPORT', 'BIRTH_CERT', 'ALIEN_ID', 'REFUGEE_ID'],
    nationalInsurer: { name: 'Social Health Authority (SHA)', code: 'SHA', adapter: 'sha-hie' },
    fiscalAdapter: 'etims', fiscalRegime: 'KRA eTIMS', mobileMoney: ['MPESA', 'AIRTEL'],
    tax: { vatStandard: 0.16, vatReduced: 0.08, medicalServicesExempt: true },
    payrollHint: 'PAYE bands, SHIF 2.75%, NSSF Tier I/II, Affordable Housing Levy 1.5%, HELB; P9/P10 & iTax CSV',
    languages: ['en', 'sw'],
  },
  UG: {
    code: 'UG', name: 'Uganda', currency: 'UGX', timezone: 'Africa/Kampala', phonePrefix: '+256',
    idTypes: ['NATIONAL_ID', 'PASSPORT', 'REFUGEE_ID'],
    nationalInsurer: { name: 'National Health Insurance Scheme (planned)', code: 'NHIS-UG', adapter: null },
    fiscalAdapter: 'efris', fiscalRegime: 'URA EFRIS', mobileMoney: ['MTN_MOMO', 'AIRTEL'],
    tax: { vatStandard: 0.18, medicalServicesExempt: true },
    payrollHint: 'PAYE, NSSF 5% employee + 10% employer, LST', languages: ['en'],
  },
  TZ: {
    code: 'TZ', name: 'Tanzania', currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', phonePrefix: '+255',
    idTypes: ['NIDA', 'PASSPORT', 'VOTER_ID'],
    nationalInsurer: { name: 'National Health Insurance Fund (NHIF)', code: 'NHIF-TZ', adapter: null },
    fiscalAdapter: 'vfd', fiscalRegime: 'TRA VFD/EFD', mobileMoney: ['MPESA_TZ', 'TIGO_PESA', 'AIRTEL'],
    tax: { vatStandard: 0.18, medicalServicesExempt: true },
    payrollHint: 'PAYE, NSSF 10%+10%, SDL 3.5%, WCF 0.5%', languages: ['en', 'sw'],
  },
  RW: {
    code: 'RW', name: 'Rwanda', currency: 'RWF', timezone: 'Africa/Kigali', phonePrefix: '+250',
    idTypes: ['NATIONAL_ID', 'PASSPORT'],
    nationalInsurer: { name: 'RSSB / Community Based Health Insurance (Mutuelle)', code: 'RSSB', adapter: null },
    fiscalAdapter: 'ebm', fiscalRegime: 'RRA EBM', mobileMoney: ['MTN_MOMO', 'AIRTEL'],
    tax: { vatStandard: 0.18, medicalServicesExempt: true },
    payrollHint: 'PAYE, RSSB pension 6%+6%, maternity 0.3%+0.3%, CBHI 0.5%', languages: ['en', 'fr', 'rw'],
  },
  GH: {
    code: 'GH', name: 'Ghana', currency: 'GHS', timezone: 'Africa/Accra', phonePrefix: '+233',
    idTypes: ['GHANA_CARD', 'PASSPORT', 'NHIS_CARD'],
    nationalInsurer: { name: 'National Health Insurance Authority (NHIA) Claim-IT', code: 'NHIA', adapter: null },
    fiscalAdapter: 'evat', fiscalRegime: 'GRA E-VAT', mobileMoney: ['MTN_MOMO', 'TELECEL_CASH', 'AIRTELTIGO'],
    tax: { vatStandard: 0.15, medicalServicesExempt: true },
    payrollHint: 'PAYE, SSNIT Tier 1 13.5% + 5.5%, Tier 2/3', languages: ['en'],
  },
  NG: {
    code: 'NG', name: 'Nigeria', currency: 'NGN', timezone: 'Africa/Lagos', phonePrefix: '+234',
    idTypes: ['NIN', 'BVN', 'PASSPORT', 'VOTERS_CARD'],
    nationalInsurer: { name: 'NHIA + HMOs', code: 'NHIA-NG', adapter: null },
    fiscalAdapter: 'firs', fiscalRegime: 'FIRS e-Invoicing', mobileMoney: ['OPAY', 'PALMPAY', 'MONIEPOINT'],
    tax: { vatStandard: 0.075, medicalServicesExempt: true },
    payrollHint: 'PAYE (PITA), pension 8%+10%, NHF 2.5%, NSITF 1%', languages: ['en', 'ha', 'yo', 'ig'],
  },
  ZA: {
    code: 'ZA', name: 'South Africa', currency: 'ZAR', timezone: 'Africa/Johannesburg', phonePrefix: '+27',
    idTypes: ['SA_ID', 'PASSPORT', 'ASYLUM_PERMIT'],
    nationalInsurer: { name: 'Medical schemes (NHI pending)', code: 'MEDSCHEME', adapter: null },
    fiscalAdapter: 'none', fiscalRegime: null, mobileMoney: [],
    tax: { vatStandard: 0.15, medicalServicesExempt: false },
    payrollHint: 'PAYE, UIF 1%+1%, SDL 1%; EMP201/EMP501', languages: ['en', 'zu', 'af', 'xh'],
  },
  ET: {
    code: 'ET', name: 'Ethiopia', currency: 'ETB', timezone: 'Africa/Addis_Ababa', phonePrefix: '+251',
    idTypes: ['FAYDA_ID', 'KEBELE_ID', 'PASSPORT'],
    nationalInsurer: { name: 'Ethiopian Health Insurance Service (CBHI/SHI)', code: 'EHIS', adapter: null },
    fiscalAdapter: 'none', fiscalRegime: 'ERCA cash register (planned e-invoice)', mobileMoney: ['TELEBIRR', 'MPESA_ET'],
    tax: { vatStandard: 0.15, medicalServicesExempt: true },
    payrollHint: 'Employment income tax bands, pension 7%+11%', languages: ['am', 'en'],
  },
  ZM: {
    code: 'ZM', name: 'Zambia', currency: 'ZMW', timezone: 'Africa/Lusaka', phonePrefix: '+260',
    idTypes: ['NRC', 'PASSPORT'],
    nationalInsurer: { name: 'National Health Insurance Management Authority (NHIMA)', code: 'NHIMA', adapter: null },
    fiscalAdapter: 'zra', fiscalRegime: 'ZRA Smart Invoice', mobileMoney: ['MTN_MOMO', 'AIRTEL'],
    tax: { vatStandard: 0.16, medicalServicesExempt: true },
    payrollHint: 'PAYE, NAPSA 5%+5%, NHIMA 1%+1%, SDL 0.5%', languages: ['en'],
  },
};

export const getCountryPack = (code?: string | null): CountryPack => COUNTRY_PACKS[(code ?? 'KE').toUpperCase()] ?? COUNTRY_PACKS.KE;
