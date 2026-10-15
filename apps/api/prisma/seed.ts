/**
 * Idempotent demo seed: "JMSURF HMIS Demo Hospital" (slug: demo).
 * Run: pnpm seed  (from apps/api). Safe to re-run — rows are matched by natural keys and skipped/updated.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  KENYA_HEALTHCARE_COA, billJournalLines, paymentJournalLines, validateJournal,
} from '../src/backoffice/finance/accounting.rules';

const prisma = new PrismaClient();
const KES = (n: number) => Math.round(n * 100);
const DAY = 86400000;
const PASSWORD = 'Demo@1234';

// Deterministic PRNG so re-runs produce identical demo data.
let _s = 20261015;
const rnd = () => ((_s = (_s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

async function findOrCreate<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  return (await find()) ?? (await create());
}

// ───────────────────────── reference data ─────────────────────────

const DEPARTMENTS: [string, string][] = [
  ['Outpatient (OPD)', 'OPD'], ['Accident & Emergency', 'EMERGENCY'], ['Inpatient Wards', 'IPD'], ['Laboratory', 'LAB'],
  ['Radiology', 'RADIOLOGY'], ['Pharmacy', 'PHARMACY'], ['Theatre', 'THEATRE'], ['Maternity', 'MATERNITY'], ['Dialysis', 'DIALYSIS'],
  ['Dental', 'DENTAL'], ['Eye Clinic', 'EYE'], ['Administration', 'ADMIN'], ['Finance', 'FINANCE'], ['Human Resources', 'HR'],
];

const WARDS: { name: string; type: string; beds: number; rateCode: string }[] = [
  { name: 'Male Ward', type: 'GENERAL', beds: 12, rateCode: 'BED-GEN' },
  { name: 'Female Ward', type: 'GENERAL', beds: 12, rateCode: 'BED-GEN' },
  { name: 'Maternity Ward', type: 'MATERNITY', beds: 10, rateCode: 'BED-MAT' },
  { name: 'Paediatric Ward', type: 'PAEDIATRIC', beds: 10, rateCode: 'BED-PAED' },
  { name: 'Private Wing', type: 'PRIVATE', beds: 6, rateCode: 'BED-PVT' },
];

const STORES: [string, string][] = [['Main Store', 'MAIN'], ['Pharmacy', 'PHARMACY'], ['Laboratory Store', 'LAB'], ['Theatre Store', 'THEATRE'], ['Ward Store', 'WARD']];

const USERS: { email: string; roles: string[]; cadre?: string; regulator?: string; specialty?: string; salary: number; designation: string; dept: string }[] = [
  { email: 'admin', roles: ['ADMIN', 'MANAGER'], salary: 180000, designation: 'Hospital Administrator', dept: 'Administration' },
  { email: 'doctor', roles: ['DOCTOR'], cadre: 'DOCTOR', regulator: 'KMPDC', specialty: 'General Medicine', salary: 350000, designation: 'Medical Officer', dept: 'Outpatient (OPD)' },
  { email: 'nurse', roles: ['NURSE', 'TRIAGE_NURSE'], cadre: 'NURSE', regulator: 'NCK', salary: 95000, designation: 'Nursing Officer', dept: 'Inpatient Wards' },
  { email: 'lab', roles: ['LAB_TECH'], cadre: 'LAB_TECH', regulator: 'KMLTTB', salary: 85000, designation: 'Medical Laboratory Technologist', dept: 'Laboratory' },
  { email: 'pharmacy', roles: ['PHARMACIST'], cadre: 'PHARMACIST', regulator: 'PPB', salary: 140000, designation: 'Pharmacist', dept: 'Pharmacy' },
  { email: 'cashier', roles: ['CASHIER', 'RECEPTION'], salary: 45000, designation: 'Cashier', dept: 'Finance' },
  { email: 'claims', roles: ['CLAIMS_OFFICER'], salary: 70000, designation: 'Claims Officer', dept: 'Finance' },
  { email: 'store', roles: ['STOREKEEPER', 'PROCUREMENT'], salary: 55000, designation: 'Storekeeper', dept: 'Administration' },
  { email: 'accounts', roles: ['ACCOUNTANT'], salary: 120000, designation: 'Accountant', dept: 'Finance' },
  { email: 'hr', roles: ['HR'], salary: 110000, designation: 'HR Officer', dept: 'Human Resources' },
  { email: 'reception', roles: ['RECEPTION'], salary: 38000, designation: 'Receptionist', dept: 'Outpatient (OPD)' },
  { email: 'co', roles: ['CLINICAL_OFFICER'], cadre: 'CLINICAL_OFFICER', regulator: 'COC', salary: 110000, designation: 'Clinical Officer', dept: 'Accident & Emergency' },
  { email: 'radiology', roles: ['RADIOGRAPHER'], cadre: 'RADIOGRAPHER', regulator: 'SRRB', salary: 90000, designation: 'Radiographer', dept: 'Radiology' },
];

// [code, name, category, departmentType, priceKES, shaCode?]
const SERVICES: [string, string, string, string, number, string?][] = [
  ['CONSULT', 'General Consultation', 'CONSULTATION', 'OPD', 1000, 'SAMPLE-PHC-OPD-001'],
  ['CONSULT-REV', 'Review Consultation', 'CONSULTATION', 'OPD', 500],
  ['CONSULT-SPEC', 'Specialist Consultation', 'CONSULTATION', 'OPD', 2500],
  ['CONSULT-PAED', 'Paediatric Consultation', 'CONSULTATION', 'OPD', 1500],
  ['CONSULT-OBGYN', 'Obstetrics & Gynaecology Consultation', 'CONSULTATION', 'OPD', 2500],
  ['CONSULT-DENTAL', 'Dental Consultation', 'CONSULTATION', 'DENTAL', 1000],
  ['CONSULT-EYE', 'Eye Consultation', 'CONSULTATION', 'EYE', 1200],
  ['CONSULT-ER', 'Emergency Consultation', 'CONSULTATION', 'EMERGENCY', 2000],
  ['TRIAGE', 'Triage & Vitals', 'NURSING', 'OPD', 200],
  ['ANC-VISIT', 'Antenatal Clinic Visit', 'CONSULTATION', 'MATERNITY', 800],
  ['XR-CHEST', 'X-Ray Chest PA', 'IMAGING', 'RADIOLOGY', 1500],
  ['XR-LIMB', 'X-Ray Limb (per view)', 'IMAGING', 'RADIOLOGY', 1200],
  ['XR-SPINE', 'X-Ray Lumbar Spine', 'IMAGING', 'RADIOLOGY', 2000],
  ['US-ABD', 'Ultrasound Abdomen', 'IMAGING', 'RADIOLOGY', 2500],
  ['US-PELVIC', 'Ultrasound Pelvic', 'IMAGING', 'RADIOLOGY', 2500],
  ['US-OBS', 'Obstetric Ultrasound', 'IMAGING', 'RADIOLOGY', 2500],
  ['CT-HEAD', 'CT Scan Head', 'IMAGING', 'RADIOLOGY', 9000],
  ['CT-ABD', 'CT Scan Abdomen', 'IMAGING', 'RADIOLOGY', 14000],
  ['ECG', 'Electrocardiogram (ECG)', 'PROCEDURE', 'OPD', 1500],
  ['ECHO', 'Echocardiogram', 'IMAGING', 'RADIOLOGY', 6000],
  ['PROC-DRESS', 'Wound Dressing', 'PROCEDURE', 'OPD', 500],
  ['PROC-SUTURE', 'Suturing (minor)', 'PROCEDURE', 'EMERGENCY', 1500],
  ['PROC-IVCAN', 'IV Cannulation', 'NURSING', 'OPD', 300],
  ['PROC-INJ', 'Injection Administration', 'NURSING', 'OPD', 100],
  ['PROC-NEB', 'Nebulisation', 'PROCEDURE', 'EMERGENCY', 800],
  ['PROC-CATH', 'Urinary Catheterisation', 'PROCEDURE', 'IPD', 1000],
  ['PROC-POP', 'Plaster of Paris Application', 'PROCEDURE', 'EMERGENCY', 3500],
  ['PROC-ID', 'Incision & Drainage', 'PROCEDURE', 'EMERGENCY', 3000],
  ['PROC-EXTRACT', 'Dental Extraction', 'PROCEDURE', 'DENTAL', 1500],
  ['PROC-FILL', 'Dental Filling', 'PROCEDURE', 'DENTAL', 3000],
  ['THR-CS', 'Caesarean Section', 'THEATRE', 'THEATRE', 65000, 'SAMPLE-SHIF-MAT-002'],
  ['THR-APPX', 'Appendicectomy', 'THEATRE', 'THEATRE', 55000],
  ['THR-HERNIA', 'Herniorrhaphy', 'THEATRE', 'THEATRE', 45000],
  ['DEL-SVD', 'Normal Delivery (SVD)', 'PROCEDURE', 'MATERNITY', 10000, 'SAMPLE-SHIF-MAT-001'],
  ['DIALYSIS', 'Haemodialysis Session', 'PROCEDURE', 'DIALYSIS', 9500, 'SAMPLE-SHIF-REN-001'],
  ['PHYSIO', 'Physiotherapy Session', 'PROCEDURE', 'OPD', 1500],
  ['BED-GEN', 'Bed Day - General Ward', 'BED', 'IPD', 3000],
  ['BED-MAT', 'Bed Day - Maternity', 'BED', 'MATERNITY', 3500],
  ['BED-PAED', 'Bed Day - Paediatric', 'BED', 'IPD', 2500],
  ['BED-PVT', 'Bed Day - Private Room', 'BED', 'IPD', 8000],
  ['BED-ICU', 'Bed Day - ICU', 'BED', 'IPD', 25000],
  ['NURS-DAY', 'Nursing Care (per day)', 'NURSING', 'IPD', 1000],
  ['DOC-ROUND', 'Doctor Ward Round (per day)', 'CONSULTATION', 'IPD', 1500],
  ['AMB', 'Ambulance Transfer (local)', 'OTHER', 'EMERGENCY', 5000],
  ['MED-REPORT', 'Medical Report', 'OTHER', 'ADMIN', 2000],
  ['REG-FEE', 'Registration / File Fee', 'OTHER', 'OPD', 200],
];

// Lab tests: [code, name, specimen, unit, low, high, priceKES, tatMins, loinc?]
const LAB: [string, string, string, string | null, number | null, number | null, number, number, string?][] = [
  ['HB', 'Haemoglobin', 'Blood', 'g/dL', 12, 17.5, 300, 30, '718-7'],
  ['CBC', 'Full Haemogram (CBC)', 'Blood', null, null, null, 800, 60, '58410-2'],
  ['WBC', 'White Blood Cell Count', 'Blood', '10^9/L', 4, 11, 300, 45, '6690-2'],
  ['PLT', 'Platelet Count', 'Blood', '10^9/L', 150, 400, 300, 45, '777-3'],
  ['ESR', 'Erythrocyte Sedimentation Rate', 'Blood', 'mm/hr', 0, 20, 300, 60, '4537-7'],
  ['PCV', 'Packed Cell Volume', 'Blood', '%', 36, 52, 200, 30],
  ['RETIC', 'Reticulocyte Count', 'Blood', '%', 0.5, 2.5, 500, 60],
  ['PBF', 'Peripheral Blood Film', 'Blood', null, null, null, 600, 90],
  ['BS-MPS', 'Malaria Parasites (Blood Slide)', 'Blood', null, null, null, 300, 30, '32700-7'],
  ['MRDT', 'Malaria Rapid Diagnostic Test', 'Blood', null, null, null, 300, 20],
  ['BGRH', 'Blood Group & Rhesus', 'Blood', null, null, null, 400, 30, '882-1'],
  ['XMATCH', 'Cross Match', 'Blood', null, null, null, 1000, 60],
  ['SICKLE', 'Sickling Test', 'Blood', null, null, null, 500, 60],
  ['HBELEC', 'Hb Electrophoresis', 'Blood', null, null, null, 2500, 1440],
  ['PT-INR', 'Prothrombin Time / INR', 'Blood', 'INR', 0.8, 1.2, 1200, 60, '6301-6'],
  ['APTT', 'Activated Partial Thromboplastin Time', 'Blood', 's', 25, 35, 1200, 60],
  ['DDIMER', 'D-Dimer', 'Blood', 'mg/L', 0, 0.5, 3000, 120],
  ['RBS', 'Random Blood Sugar', 'Blood', 'mmol/L', 3.9, 7.8, 200, 15, '2345-7'],
  ['FBS', 'Fasting Blood Sugar', 'Blood', 'mmol/L', 3.9, 5.6, 200, 15, '1558-6'],
  ['HBA1C', 'HbA1c', 'Blood', '%', 4, 5.6, 2000, 120, '4548-4'],
  ['OGTT', 'Oral Glucose Tolerance Test', 'Blood', 'mmol/L', 3.9, 7.8, 1000, 150],
  ['UREA', 'Urea', 'Serum', 'mmol/L', 2.5, 7.1, 500, 60, '3091-6'],
  ['CREAT', 'Creatinine', 'Serum', 'umol/L', 53, 115, 500, 60, '2160-0'],
  ['NA', 'Sodium', 'Serum', 'mmol/L', 135, 145, 500, 60, '2951-2'],
  ['K', 'Potassium', 'Serum', 'mmol/L', 3.5, 5.1, 500, 60, '2823-3'],
  ['CL', 'Chloride', 'Serum', 'mmol/L', 98, 107, 500, 60],
  ['UEC', 'Urea, Electrolytes & Creatinine', 'Serum', null, null, null, 1500, 90],
  ['ALT', 'ALT (SGPT)', 'Serum', 'U/L', 7, 56, 500, 60, '1742-6'],
  ['AST', 'AST (SGOT)', 'Serum', 'U/L', 10, 40, 500, 60, '1920-8'],
  ['ALP', 'Alkaline Phosphatase', 'Serum', 'U/L', 44, 147, 500, 60],
  ['GGT', 'Gamma GT', 'Serum', 'U/L', 9, 48, 600, 60],
  ['TBIL', 'Total Bilirubin', 'Serum', 'umol/L', 5, 21, 500, 60],
  ['DBIL', 'Direct Bilirubin', 'Serum', 'umol/L', 0, 5, 500, 60],
  ['ALB', 'Albumin', 'Serum', 'g/L', 35, 50, 500, 60],
  ['TP', 'Total Protein', 'Serum', 'g/L', 60, 83, 500, 60],
  ['LFT', 'Liver Function Tests', 'Serum', null, null, null, 2500, 120],
  ['CHOL', 'Total Cholesterol', 'Serum', 'mmol/L', 0, 5.2, 600, 60],
  ['TG', 'Triglycerides', 'Serum', 'mmol/L', 0, 1.7, 600, 60],
  ['HDL', 'HDL Cholesterol', 'Serum', 'mmol/L', 1.0, 3.0, 600, 60],
  ['LDL', 'LDL Cholesterol', 'Serum', 'mmol/L', 0, 3.4, 600, 60],
  ['LIPID', 'Lipid Profile', 'Serum', null, null, null, 2000, 120],
  ['URIC', 'Uric Acid', 'Serum', 'umol/L', 200, 430, 600, 60],
  ['CA', 'Calcium', 'Serum', 'mmol/L', 2.1, 2.6, 600, 60],
  ['MG', 'Magnesium', 'Serum', 'mmol/L', 0.7, 1.0, 700, 60],
  ['PHOS', 'Phosphate', 'Serum', 'mmol/L', 0.8, 1.5, 600, 60],
  ['AMYL', 'Amylase', 'Serum', 'U/L', 30, 110, 1000, 90],
  ['CRP', 'C-Reactive Protein', 'Serum', 'mg/L', 0, 5, 1000, 60, '1988-5'],
  ['TROP', 'Troponin I', 'Serum', 'ng/mL', 0, 0.04, 2500, 60],
  ['CKMB', 'CK-MB', 'Serum', 'U/L', 0, 25, 2000, 60],
  ['TSH', 'Thyroid Stimulating Hormone', 'Serum', 'mIU/L', 0.4, 4.0, 1800, 240],
  ['FT4', 'Free T4', 'Serum', 'pmol/L', 12, 22, 1800, 240],
  ['FT3', 'Free T3', 'Serum', 'pmol/L', 3.1, 6.8, 1800, 240],
  ['PSA', 'Prostate Specific Antigen', 'Serum', 'ng/mL', 0, 4, 2000, 240],
  ['BHCG', 'Beta hCG (quantitative)', 'Serum', 'mIU/mL', null, null, 1500, 120],
  ['PDT', 'Pregnancy Test (urine)', 'Urine', null, null, null, 300, 15],
  ['UA', 'Urinalysis', 'Urine', null, null, null, 300, 30, '24356-8'],
  ['UMIC', 'Urine Microscopy', 'Urine', null, null, null, 300, 45],
  ['UCS', 'Urine Culture & Sensitivity', 'Urine', null, null, null, 2000, 4320],
  ['STOOL', 'Stool Microscopy (O/C)', 'Stool', null, null, null, 300, 45],
  ['SOB', 'Stool Occult Blood', 'Stool', null, null, null, 500, 45],
  ['HPYLORI-AG', 'H. pylori Stool Antigen', 'Stool', null, null, null, 1200, 60],
  ['HPYLORI-AB', 'H. pylori Serum Antibody', 'Serum', null, null, null, 1000, 60],
  ['WIDAL', 'Widal Test', 'Serum', null, null, null, 500, 60],
  ['SAL-AG', 'Salmonella Stool Antigen', 'Stool', null, null, null, 1200, 60],
  ['BCS', 'Blood Culture & Sensitivity', 'Blood', null, null, null, 3000, 7200],
  ['VDRL', 'VDRL / RPR', 'Serum', null, null, null, 400, 60],
  ['HIV', 'HIV Rapid Test', 'Blood', null, null, null, 0, 30],
  ['CD4', 'CD4 Count', 'Blood', 'cells/uL', 500, 1500, 1500, 240],
  ['VL', 'HIV Viral Load', 'Blood', 'copies/mL', null, null, 0, 10080],
  ['HBSAG', 'Hepatitis B Surface Antigen', 'Serum', null, null, null, 800, 60],
  ['HCV', 'Hepatitis C Antibody', 'Serum', null, null, null, 800, 60],
  ['BRUC', 'Brucella Antigen', 'Serum', null, null, null, 600, 60],
  ['RF', 'Rheumatoid Factor', 'Serum', 'IU/mL', 0, 14, 800, 60],
  ['ASOT', 'Anti-Streptolysin O Titre', 'Serum', 'IU/mL', 0, 200, 800, 60],
  ['GXP', 'GeneXpert MTB/RIF', 'Sputum', null, null, null, 0, 1440],
  ['AFB', 'Sputum for AFB (ZN)', 'Sputum', null, null, null, 300, 1440],
  ['CSF', 'CSF Analysis', 'CSF', null, null, null, 2000, 120],
  ['SEMEN', 'Semen Analysis', 'Semen', null, null, null, 1500, 120],
  ['HVS', 'High Vaginal Swab', 'Swab', null, null, null, 800, 120],
  ['PUS', 'Pus Swab Culture & Sensitivity', 'Swab', null, null, null, 2000, 4320],
  ['FERR', 'Ferritin', 'Serum', 'ng/mL', 20, 250, 2000, 240],
  ['VITD', 'Vitamin D (25-OH)', 'Serum', 'ng/mL', 30, 100, 3500, 1440],
];

// Stock (Kenya Essential Medicines List subset): [code, name, generic, form, strength, priceKES, costKES, reorder, category?, controlled?]
const STOCK: [string, string, string, string, string, number, number, number, string?, boolean?][] = [
  ['AMOX500', 'Amoxicillin 500mg Capsules', 'Amoxicillin', 'Capsule', '500mg', 10, 3, 500],
  ['AMOX250S', 'Amoxicillin 250mg/5ml Suspension 100ml', 'Amoxicillin', 'Suspension', '250mg/5ml', 150, 60, 50],
  ['AMOXCLAV625', 'Amoxicillin/Clavulanate 625mg Tablets', 'Co-amoxiclav', 'Tablet', '625mg', 45, 18, 300],
  ['AUGS', 'Co-amoxiclav 228mg/5ml Suspension', 'Co-amoxiclav', 'Suspension', '228mg/5ml', 450, 200, 30],
  ['CIPRO500', 'Ciprofloxacin 500mg Tablets', 'Ciprofloxacin', 'Tablet', '500mg', 15, 4, 300],
  ['AZITH500', 'Azithromycin 500mg Tablets', 'Azithromycin', 'Tablet', '500mg', 60, 20, 200],
  ['AZITHS', 'Azithromycin 200mg/5ml Suspension', 'Azithromycin', 'Suspension', '200mg/5ml', 350, 150, 30],
  ['ERY500', 'Erythromycin 500mg Tablets', 'Erythromycin', 'Tablet', '500mg', 20, 7, 200],
  ['DOXY100', 'Doxycycline 100mg Capsules', 'Doxycycline', 'Capsule', '100mg', 8, 2, 300],
  ['METRO400', 'Metronidazole 400mg Tablets', 'Metronidazole', 'Tablet', '400mg', 5, 1.5, 500],
  ['METROS', 'Metronidazole 200mg/5ml Suspension', 'Metronidazole', 'Suspension', '200mg/5ml', 120, 45, 40],
  ['METROIV', 'Metronidazole 500mg/100ml Infusion', 'Metronidazole', 'Infusion', '500mg/100ml', 150, 60, 50],
  ['CTX960', 'Cotrimoxazole 960mg Tablets', 'Sulfamethoxazole/Trimethoprim', 'Tablet', '960mg', 5, 1.5, 500],
  ['CTXS', 'Cotrimoxazole 240mg/5ml Suspension', 'Sulfamethoxazole/Trimethoprim', 'Suspension', '240mg/5ml', 100, 35, 40],
  ['FLUCL500', 'Flucloxacillin 500mg Capsules', 'Flucloxacillin', 'Capsule', '500mg', 20, 7, 200],
  ['CEFTRI1G', 'Ceftriaxone 1g Injection', 'Ceftriaxone', 'Injection', '1g', 250, 70, 200],
  ['CEFUR500', 'Cefuroxime 500mg Tablets', 'Cefuroxime', 'Tablet', '500mg', 60, 22, 200],
  ['GENT80', 'Gentamicin 80mg/2ml Injection', 'Gentamicin', 'Injection', '80mg/2ml', 50, 15, 200],
  ['BENZPEN', 'Benzylpenicillin 5MU Injection', 'Benzylpenicillin', 'Injection', '5MU', 80, 30, 100],
  ['NITRO100', 'Nitrofurantoin 100mg Tablets', 'Nitrofurantoin', 'Tablet', '100mg', 10, 3, 200],
  ['AL20', 'Artemether/Lumefantrine 20/120mg Tablets (24s)', 'Artemether/Lumefantrine', 'Tablet', '20/120mg', 300, 120, 100],
  ['ARTESIV', 'Artesunate 60mg Injection', 'Artesunate', 'Injection', '60mg', 400, 180, 100],
  ['SP', 'Sulfadoxine/Pyrimethamine Tablets', 'Sulfadoxine/Pyrimethamine', 'Tablet', '500/25mg', 10, 3, 200],
  ['QUIN300', 'Quinine 300mg Tablets', 'Quinine', 'Tablet', '300mg', 10, 4, 200],
  ['PCM500', 'Paracetamol 500mg Tablets', 'Paracetamol', 'Tablet', '500mg', 2, 0.5, 2000],
  ['PCMS', 'Paracetamol 120mg/5ml Syrup 100ml', 'Paracetamol', 'Syrup', '120mg/5ml', 80, 25, 100],
  ['PCMIV', 'Paracetamol 1g/100ml Infusion', 'Paracetamol', 'Infusion', '1g/100ml', 350, 150, 50],
  ['IBU400', 'Ibuprofen 400mg Tablets', 'Ibuprofen', 'Tablet', '400mg', 3, 1, 1000],
  ['IBUS', 'Ibuprofen 100mg/5ml Suspension', 'Ibuprofen', 'Suspension', '100mg/5ml', 120, 40, 50],
  ['DICLO50', 'Diclofenac 50mg Tablets', 'Diclofenac', 'Tablet', '50mg', 3, 1, 1000],
  ['DICLOINJ', 'Diclofenac 75mg/3ml Injection', 'Diclofenac', 'Injection', '75mg/3ml', 50, 15, 200],
  ['TRAM50', 'Tramadol 50mg Capsules', 'Tramadol', 'Capsule', '50mg', 15, 5, 200],
  ['MORPH10', 'Morphine 10mg/ml Injection', 'Morphine', 'Injection', '10mg/ml', 150, 60, 50, 'DRUG', true],
  ['PETH100', 'Pethidine 100mg/2ml Injection', 'Pethidine', 'Injection', '100mg/2ml', 200, 80, 30, 'DRUG', true],
  ['DIAZ10', 'Diazepam 10mg/2ml Injection', 'Diazepam', 'Injection', '10mg/2ml', 60, 20, 50, 'DRUG', true],
  ['DIAZ5', 'Diazepam 5mg Tablets', 'Diazepam', 'Tablet', '5mg', 5, 1, 100, 'DRUG', true],
  ['KETA', 'Ketamine 50mg/ml Injection 10ml', 'Ketamine', 'Injection', '50mg/ml', 600, 250, 20, 'DRUG', true],
  ['LIGN2', 'Lidocaine 2% Injection 30ml', 'Lidocaine', 'Injection', '2%', 150, 60, 50],
  ['BUPI', 'Bupivacaine 0.5% Heavy Injection', 'Bupivacaine', 'Injection', '0.5%', 300, 130, 30],
  ['MTF500', 'Metformin 500mg Tablets', 'Metformin', 'Tablet', '500mg', 3, 1, 1000],
  ['GLIB5', 'Glibenclamide 5mg Tablets', 'Glibenclamide', 'Tablet', '5mg', 2, 0.5, 500],
  ['INSSOL', 'Insulin Soluble 100IU/ml 10ml', 'Insulin (soluble)', 'Injection', '100IU/ml', 800, 450, 30],
  ['INSMIX', 'Insulin Biphasic 30/70 100IU/ml 10ml', 'Insulin (biphasic)', 'Injection', '100IU/ml', 900, 500, 30],
  ['AMLO5', 'Amlodipine 5mg Tablets', 'Amlodipine', 'Tablet', '5mg', 3, 0.8, 1000],
  ['AMLO10', 'Amlodipine 10mg Tablets', 'Amlodipine', 'Tablet', '10mg', 5, 1.2, 500],
  ['ENAL10', 'Enalapril 10mg Tablets', 'Enalapril', 'Tablet', '10mg', 4, 1, 500],
  ['LOSAR50', 'Losartan 50mg Tablets', 'Losartan', 'Tablet', '50mg', 8, 2, 500],
  ['HCTZ25', 'Hydrochlorothiazide 25mg Tablets', 'Hydrochlorothiazide', 'Tablet', '25mg', 2, 0.5, 500],
  ['NIFE20', 'Nifedipine 20mg Retard Tablets', 'Nifedipine', 'Tablet', '20mg', 4, 1, 500],
  ['ATEN50', 'Atenolol 50mg Tablets', 'Atenolol', 'Tablet', '50mg', 3, 0.8, 300],
  ['METHYLD', 'Methyldopa 250mg Tablets', 'Methyldopa', 'Tablet', '250mg', 6, 2, 300],
  ['HYDRAL', 'Hydralazine 20mg Injection', 'Hydralazine', 'Injection', '20mg', 450, 200, 20],
  ['FUROS40', 'Furosemide 40mg Tablets', 'Furosemide', 'Tablet', '40mg', 2, 0.5, 300],
  ['FUROSINJ', 'Furosemide 20mg/2ml Injection', 'Furosemide', 'Injection', '20mg/2ml', 40, 12, 100],
  ['SPIRO25', 'Spironolactone 25mg Tablets', 'Spironolactone', 'Tablet', '25mg', 6, 2, 200],
  ['ATOR20', 'Atorvastatin 20mg Tablets', 'Atorvastatin', 'Tablet', '20mg', 10, 3, 500],
  ['ASP75', 'Aspirin 75mg Tablets', 'Acetylsalicylic acid', 'Tablet', '75mg', 2, 0.4, 500],
  ['WARF5', 'Warfarin 5mg Tablets', 'Warfarin', 'Tablet', '5mg', 5, 1.5, 200],
  ['ENOX40', 'Enoxaparin 40mg Injection', 'Enoxaparin', 'Injection', '40mg', 600, 300, 50],
  ['HEP5000', 'Heparin 5000IU/ml Injection', 'Heparin', 'Injection', '5000IU/ml', 400, 180, 30],
  ['SALB', 'Salbutamol Inhaler 100mcg', 'Salbutamol', 'Inhaler', '100mcg', 350, 150, 50],
  ['SALBNEB', 'Salbutamol 5mg/ml Nebuliser Solution', 'Salbutamol', 'Nebule', '5mg/ml', 150, 60, 50],
  ['BECLO', 'Beclomethasone Inhaler 100mcg', 'Beclomethasone', 'Inhaler', '100mcg', 600, 300, 30],
  ['PRED5', 'Prednisolone 5mg Tablets', 'Prednisolone', 'Tablet', '5mg', 2, 0.5, 500],
  ['HYDROC', 'Hydrocortisone 100mg Injection', 'Hydrocortisone', 'Injection', '100mg', 150, 60, 100],
  ['DEXA', 'Dexamethasone 4mg/ml Injection', 'Dexamethasone', 'Injection', '4mg/ml', 40, 12, 200],
  ['CHLORP', 'Chlorphenamine 4mg Tablets', 'Chlorphenamine', 'Tablet', '4mg', 1, 0.3, 500],
  ['CETIR10', 'Cetirizine 10mg Tablets', 'Cetirizine', 'Tablet', '10mg', 3, 0.8, 500],
  ['PROMETH', 'Promethazine 25mg/ml Injection', 'Promethazine', 'Injection', '25mg/ml', 50, 15, 100],
  ['ADREN', 'Adrenaline 1mg/ml Injection', 'Epinephrine', 'Injection', '1mg/ml', 80, 25, 50],
  ['OMEP20', 'Omeprazole 20mg Capsules', 'Omeprazole', 'Capsule', '20mg', 5, 1.2, 1000],
  ['OMEPIV', 'Omeprazole 40mg Injection', 'Omeprazole', 'Injection', '40mg', 300, 110, 50],
  ['ESOM40', 'Esomeprazole 40mg Tablets', 'Esomeprazole', 'Tablet', '40mg', 20, 6, 300],
  ['RANIT', 'Ranitidine 150mg Tablets', 'Ranitidine', 'Tablet', '150mg', 3, 0.8, 200],
  ['ANTAC', 'Magnesium Trisilicate Mixture 200ml', 'Magnesium trisilicate', 'Suspension', '200ml', 150, 50, 50],
  ['METOC', 'Metoclopramide 10mg Injection', 'Metoclopramide', 'Injection', '10mg/2ml', 40, 12, 100],
  ['ONDAN', 'Ondansetron 4mg Injection', 'Ondansetron', 'Injection', '4mg/2ml', 120, 40, 100],
  ['HYOS', 'Hyoscine Butylbromide 10mg Tablets', 'Hyoscine butylbromide', 'Tablet', '10mg', 5, 1.5, 300],
  ['BISA', 'Bisacodyl 5mg Tablets', 'Bisacodyl', 'Tablet', '5mg', 3, 0.8, 200],
  ['LACT', 'Lactulose Syrup 100ml', 'Lactulose', 'Syrup', '3.35g/5ml', 350, 150, 30],
  ['ORS', 'Oral Rehydration Salts Sachet', 'ORS', 'Sachet', '20.5g', 20, 6, 500],
  ['ZINC20', 'Zinc Sulphate 20mg Dispersible Tablets', 'Zinc sulphate', 'Tablet', '20mg', 5, 1.5, 500],
  ['ALB400', 'Albendazole 400mg Tablets', 'Albendazole', 'Tablet', '400mg', 20, 5, 500],
  ['MEBEN', 'Mebendazole 100mg Tablets', 'Mebendazole', 'Tablet', '100mg', 5, 1.5, 300],
  ['PRAZI', 'Praziquantel 600mg Tablets', 'Praziquantel', 'Tablet', '600mg', 30, 10, 200],
  ['FLUCO150', 'Fluconazole 150mg Capsules', 'Fluconazole', 'Capsule', '150mg', 30, 8, 300],
  ['CLOTRI', 'Clotrimazole 1% Cream 20g', 'Clotrimazole', 'Cream', '1%', 100, 35, 100],
  ['NYST', 'Nystatin Oral Suspension 30ml', 'Nystatin', 'Suspension', '100,000IU/ml', 200, 80, 50],
  ['ACICL', 'Aciclovir 400mg Tablets', 'Aciclovir', 'Tablet', '400mg', 15, 5, 200],
  ['TDF3TC', 'TDF/3TC/DTG (TLD) Tablets 30s', 'Tenofovir/Lamivudine/Dolutegravir', 'Tablet', '300/300/50mg', 0, 0, 100],
  ['RHZE', 'RHZE (Anti-TB FDC) Tablets', 'Rifampicin/Isoniazid/Pyrazinamide/Ethambutol', 'Tablet', '150/75/400/275mg', 0, 0, 200],
  ['FEFOL', 'Ferrous Sulphate + Folic Acid Tablets', 'Ferrous sulphate/Folic acid', 'Tablet', '200mg/0.4mg', 2, 0.5, 1000],
  ['FOLIC5', 'Folic Acid 5mg Tablets', 'Folic acid', 'Tablet', '5mg', 1, 0.3, 500],
  ['VITBCO', 'Vitamin B Complex Tablets', 'Vitamin B complex', 'Tablet', '', 1, 0.3, 500],
  ['VITA', 'Vitamin A 200,000IU Capsules', 'Retinol', 'Capsule', '200,000IU', 10, 3, 200],
  ['CALCD', 'Calcium + Vitamin D Tablets', 'Calcium carbonate/Colecalciferol', 'Tablet', '500mg/400IU', 10, 3, 300],
  ['OXYT', 'Oxytocin 10IU/ml Injection', 'Oxytocin', 'Injection', '10IU/ml', 80, 25, 200],
  ['MISO', 'Misoprostol 200mcg Tablets', 'Misoprostol', 'Tablet', '200mcg', 40, 15, 100],
  ['MGSO4', 'Magnesium Sulphate 50% Injection', 'Magnesium sulphate', 'Injection', '50%', 100, 35, 100],
  ['TXA', 'Tranexamic Acid 500mg Injection', 'Tranexamic acid', 'Injection', '500mg/5ml', 200, 80, 50],
  ['DEPO', 'Medroxyprogesterone 150mg Injection (Depo)', 'Medroxyprogesterone', 'Injection', '150mg/ml', 100, 40, 100],
  ['COC', 'Combined Oral Contraceptive (cycle)', 'Levonorgestrel/Ethinylestradiol', 'Tablet', '0.15/0.03mg', 50, 15, 100],
  ['TTVAC', 'Tetanus Toxoid Vaccine', 'Tetanus toxoid', 'Injection', '0.5ml', 150, 50, 50],
  ['ARV-RAB', 'Anti-Rabies Vaccine', 'Rabies vaccine', 'Injection', '1 dose', 1800, 1000, 20],
  ['ASV', 'Anti-Snake Venom', 'Snake antivenom', 'Injection', '10ml', 15000, 9000, 5],
  ['NS500', 'Normal Saline 0.9% 500ml', 'Sodium chloride', 'Infusion', '0.9%', 100, 40, 500],
  ['RL500', "Ringer's Lactate 500ml", "Compound sodium lactate", 'Infusion', '500ml', 110, 45, 500],
  ['D5', 'Dextrose 5% 500ml', 'Glucose', 'Infusion', '5%', 100, 40, 300],
  ['D50', 'Dextrose 50% 50ml', 'Glucose', 'Injection', '50%', 150, 60, 50],
  ['KCL', 'Potassium Chloride 15% Injection', 'Potassium chloride', 'Injection', '15%', 60, 20, 50],
  ['WFI', 'Water for Injection 10ml', 'Water for injection', 'Injection', '10ml', 10, 3, 1000],
  ['HALO5', 'Haloperidol 5mg Tablets', 'Haloperidol', 'Tablet', '5mg', 5, 1.5, 200],
  ['CARBA200', 'Carbamazepine 200mg Tablets', 'Carbamazepine', 'Tablet', '200mg', 6, 2, 300],
  ['PHENO30', 'Phenobarbitone 30mg Tablets', 'Phenobarbital', 'Tablet', '30mg', 3, 1, 200, 'DRUG', true],
  ['AMIT25', 'Amitriptyline 25mg Tablets', 'Amitriptyline', 'Tablet', '25mg', 3, 0.8, 200],
  ['FLUOX20', 'Fluoxetine 20mg Capsules', 'Fluoxetine', 'Capsule', '20mg', 8, 2, 200],
  ['TETEYE', 'Tetracycline 1% Eye Ointment', 'Tetracycline', 'Eye ointment', '1%', 80, 25, 100],
  ['CHLOREYE', 'Chloramphenicol 0.5% Eye Drops', 'Chloramphenicol', 'Eye drops', '0.5%', 100, 35, 100],
  ['GLOVES', 'Examination Gloves (box of 100)', '', 'Box', '', 800, 450, 50, 'CONSUMABLE'],
  ['SYR5', 'Syringe 5ml with Needle', '', 'Piece', '5ml', 15, 5, 2000, 'CONSUMABLE'],
  ['CANN20', 'IV Cannula 20G', '', 'Piece', '20G', 80, 30, 500, 'CONSUMABLE'],
  ['GIVSET', 'IV Giving Set', '', 'Piece', '', 80, 30, 500, 'CONSUMABLE'],
  ['GAUZE', 'Gauze Swabs (pack)', '', 'Pack', '', 150, 60, 100, 'CONSUMABLE'],
  ['SUT-VIC', 'Vicryl 2-0 Suture', '', 'Piece', '2-0', 600, 300, 50, 'CONSUMABLE'],
  ['CATH16', 'Foley Catheter 16Fr', '', 'Piece', '16Fr', 150, 60, 100, 'CONSUMABLE'],
  ['MRDT-KIT', 'Malaria RDT Kit (25 tests)', '', 'Kit', '25 tests', 2500, 1500, 10, 'REAGENT'],
  ['GLUC-STR', 'Glucometer Strips (50)', '', 'Box', '50', 2000, 1100, 10, 'REAGENT'],
];

// Diagnoses (ICD-11) with relative frequency and suggested lab/drug.
const DIAGNOSES: { code: string; display: string; w: number; lab?: string; drug?: string; kids?: boolean }[] = [
  { code: '1F40', display: 'Malaria due to Plasmodium falciparum', w: 10, lab: 'BS-MPS', drug: 'AL20' },
  { code: '1F4Z', display: 'Malaria, unspecified (suspected)', w: 4, lab: 'MRDT', drug: 'AL20' },
  { code: 'CA07', display: 'Acute upper respiratory infection, unspecified', w: 12, drug: 'AMOX500', kids: true },
  { code: 'CA40', display: 'Pneumonia', w: 5, lab: 'CBC', drug: 'AMOXCLAV625', kids: true },
  { code: '1A40.Z', display: 'Infectious gastroenteritis or colitis', w: 7, lab: 'STOOL', drug: 'ORS', kids: true },
  { code: 'GC08', display: 'Urinary tract infection', w: 6, lab: 'UA', drug: 'NITRO100' },
  { code: '1A07', display: 'Typhoid fever', w: 3, lab: 'SAL-AG', drug: 'CIPRO500' },
  { code: 'BA00', display: 'Essential hypertension', w: 6, lab: 'UEC', drug: 'AMLO5' },
  { code: '5A11', display: 'Type 2 diabetes mellitus', w: 4, lab: 'RBS', drug: 'MTF500' },
  { code: 'EA80', display: 'Atopic dermatitis', w: 3, drug: 'CETIR10', kids: true },
  { code: '1F62', display: 'Ascariasis (intestinal worms)', w: 3, drug: 'ALB400', kids: true },
  { code: '3A00', display: 'Iron deficiency anaemia', w: 3, lab: 'HB', drug: 'FEFOL' },
  { code: 'CA23', display: 'Asthma', w: 2, drug: 'SALB' },
  { code: 'DA08', display: 'Dental caries', w: 2 },
  { code: 'DA61', display: 'Peptic ulcer disease', w: 3, lab: 'HPYLORI-AG', drug: 'OMEP20' },
  { code: 'FA20', display: 'Rheumatoid arthritis', w: 1, lab: 'RF', drug: 'DICLO50' },
  { code: 'NA00', display: 'Superficial injury of head', w: 2, drug: 'PCM500' },
  { code: '9A60', display: 'Conjunctivitis', w: 2, drug: 'CHLOREYE', kids: true },
];

const COUNTIES = ['Nairobi', 'Kiambu', 'Machakos', 'Nakuru', 'Kisumu', 'Kajiado', 'Murang\'a'];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ── Tenant & facility
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: { name: 'JMSURF HMIS Demo Hospital', settings: { receiptFooter: 'Asante kwa kuchagua JMSURF HMIS Demo Hospital', dhis2OrgUnit: '14012', billingManual: true }, subscriptionStatus: 'ACTIVE' },
    create: {
      name: 'JMSURF HMIS Demo Hospital', slug: 'demo', countryCode: 'KE', currency: 'KES', plan: 'HOSPITAL', subscriptionStatus: 'ACTIVE',
      primaryColor: '#0f766e', kraPin: 'P051234567X',
      enabledModules: ['patients', 'opd', 'triage', 'lab', 'radiology', 'pharmacy', 'ipd', 'maternity', 'theatre', 'dialysis', 'billing', 'claims', 'inventory', 'procurement', 'finance', 'hr', 'assets', 'reports', 'telemedicine', 'homecare', 'quality'],
      settings: { receiptFooter: 'Asante kwa kuchagua JMSURF HMIS Demo Hospital', dhis2OrgUnit: '14012', billingManual: true },
    },
  });
  const T = tenant.id;
  const facility = await prisma.facility.upsert({
    where: { tenantId_code: { tenantId: T, code: 'MAIN' } },
    update: { name: 'JMSURF HMIS Demo Hospital - Main', phone: null },
    create: {
      tenantId: T, name: 'JMSURF HMIS Demo Hospital - Main', code: 'MAIN', kmhflCode: '14012', shaFacilityId: 'FID-14012', level: 4,
      county: 'Kiambu', address: 'Thika Road, Kiambu', phone: null, email: 'info@demo.jmsurf.health',
    },
  });
  const F = facility.id;

  // ── Departments, wards, beds, stores
  const depts: Record<string, string> = {};
  for (const [name, type] of DEPARTMENTS) {
    const d = await findOrCreate(
      () => prisma.department.findFirst({ where: { tenantId: T, facilityId: F, name } }),
      () => prisma.department.create({ data: { tenantId: T, facilityId: F, name, type, costCentre: type } }),
    );
    depts[name] = d.id;
  }

  // ── Service items
  const svc: Record<string, { id: string; price: number; category: string }> = {};
  for (const [code, name, category, departmentType, price, sha] of SERVICES) {
    const s = await prisma.serviceItem.upsert({
      where: { tenantId_code: { tenantId: T, code } },
      update: { name, basePriceMinor: KES(price) },
      create: { tenantId: T, code, name, category, departmentType, basePriceMinor: KES(price), shaInterventionCode: sha },
    });
    svc[code] = { id: s.id, price: s.basePriceMinor, category };
  }
  // Lab tests (each with its billable service item)
  for (const [code, name, specimen, unit, low, high, price, tat, loinc] of LAB) {
    const s = await prisma.serviceItem.upsert({
      where: { tenantId_code: { tenantId: T, code: `LAB-${code}` } },
      update: { name, basePriceMinor: KES(price) },
      create: { tenantId: T, code: `LAB-${code}`, name, category: 'LAB', departmentType: 'LAB', basePriceMinor: KES(price) },
    });
    svc[`LAB-${code}`] = { id: s.id, price: s.basePriceMinor, category: 'LAB' };
    const refRanges = low !== null && high !== null
      ? [{ sex: 'ANY', ageMinDays: 0, ageMaxDays: 54750, low, high, criticalLow: +(low * 0.5).toFixed(2), criticalHigh: +(high * 2).toFixed(2) }]
      : null;
    await prisma.labTest.upsert({
      where: { tenantId_code: { tenantId: T, code } },
      update: { name, unit, refRanges: refRanges ?? Prisma.JsonNull, serviceItemId: s.id, turnaroundMins: tat },
      create: {
        tenantId: T, code, name, loinc, specimenType: specimen, unit, refRanges: refRanges ?? Prisma.JsonNull, serviceItemId: s.id, turnaroundMins: tat,
        panelOf: code === 'UEC' ? ['UREA', 'NA', 'K', 'CL', 'CREAT'] : code === 'LFT' ? ['ALT', 'AST', 'ALP', 'GGT', 'TBIL', 'DBIL', 'ALB', 'TP'] : code === 'LIPID' ? ['CHOL', 'TG', 'HDL', 'LDL'] : code === 'CBC' ? ['HB', 'WBC', 'PLT', 'PCV'] : [],
      },
    });
  }

  for (const w of WARDS) {
    const ward = await findOrCreate(
      () => prisma.ward.findFirst({ where: { tenantId: T, facilityId: F, name: w.name } }),
      () => prisma.ward.create({ data: { tenantId: T, facilityId: F, name: w.name, type: w.type, dailyRateServiceId: svc[w.rateCode].id } }),
    );
    const existing = await prisma.bed.count({ where: { tenantId: T, wardId: ward.id } });
    const prefix = w.name.split(' ')[0].slice(0, 3).toUpperCase();
    for (let i = existing + 1; i <= w.beds; i++) {
      await prisma.bed.create({ data: { tenantId: T, wardId: ward.id, label: `${prefix}-${String(i).padStart(2, '0')}` } });
    }
  }
  const stores: Record<string, string> = {};
  for (const [name, type] of STORES) {
    const s = await findOrCreate(
      () => prisma.store.findFirst({ where: { tenantId: T, facilityId: F, name } }),
      () => prisma.store.create({ data: { tenantId: T, facilityId: F, name, type } }),
    );
    stores[type] = s.id;
  }

  // ── Users, practitioners, employees
  const users: Record<string, string> = {};
  let staffNo = 1;
  for (const u of USERS) {
    const email = `${u.email}@demo.jmsurf.health`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, roles: u.roles, active: true, firstName: 'Demo', lastName: u.designation, phone: null },
      create: { tenantId: T, email, passwordHash, firstName: 'Demo', lastName: u.designation, roles: u.roles, facilityIds: [F] },
    });
    users[u.email] = user.id;
    if (u.cadre) {
      await prisma.practitioner.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          tenantId: T, userId: user.id, cadre: u.cadre, regulator: u.regulator, licenseNumber: `${u.regulator}-${10000 + staffNo}`,
          // one licence expiring soon to demonstrate alerts
          licenseExpiry: new Date(Date.now() + (u.email === 'nurse' ? 20 : 300) * DAY), specialty: u.specialty,
          consultationFeeMinor: u.cadre === 'DOCTOR' ? KES(1000) : undefined, hwrId: `HWR-${200000 + staffNo}`,
        },
      });
    }
    const no = `EMP${String(staffNo).padStart(4, '0')}`;
    await prisma.employee.upsert({
      where: { tenantId_staffNo: { tenantId: T, staffNo: no } },
      update: {},
      create: {
        tenantId: T, userId: user.id, staffNo: no, firstName: 'Demo', lastName: u.designation, idNumber: String(20000000 + staffNo * 7919),
        kraPin: `A00${String(1000000 + staffNo * 3571).slice(0, 7)}${String.fromCharCode(65 + (staffNo % 26))}`, nssfNo: String(900000 + staffNo), shifNo: `SHA${700000 + staffNo}`,
        department: u.dept, designation: u.designation, basicSalaryMinor: KES(u.salary),
        allowances: [{ name: 'House allowance', amountMinor: KES(Math.round(u.salary * 0.15)) }, { name: 'Commuter allowance', amountMinor: KES(5000) }, ...(staffNo % 4 === 0 ? [{ name: 'HELB', amountMinor: KES(2500), deduction: true }] : [])],
        bankDetails: { bank: 'KCB', branch: 'Kiambu', account: String(1100000000 + staffNo) }, hireDate: new Date(Date.UTC(2020 + (staffNo % 5), staffNo % 12, 1)),
      },
    });
    staffNo++;
  }
  // non-system-user staff
  for (const [first, last, designation, dept, salary] of [
    ['Employee', '0101', 'Cleaner', 'Administration', 22000], ['Employee', '0102', 'Enrolled Nurse', 'Maternity', 60000],
    ['Employee', '0103', 'Driver', 'Administration', 30000], ['Employee', '0104', 'Cook', 'Administration', 25000],
    ['Employee', '0105', 'Security Officer', 'Administration', 24000],
  ] as [string, string, string, string, number][]) {
    const no = `EMP${String(staffNo).padStart(4, '0')}`;
    await prisma.employee.upsert({
      where: { tenantId_staffNo: { tenantId: T, staffNo: no } },
      update: {},
      create: {
        tenantId: T, staffNo: no, firstName: first, lastName: last, idNumber: String(20000000 + staffNo * 7919), kraPin: `A00${String(2000000 + staffNo * 3571).slice(0, 7)}K`,
        nssfNo: String(900000 + staffNo), department: dept, designation, basicSalaryMinor: KES(salary), allowances: [{ name: 'House allowance', amountMinor: KES(Math.round(salary * 0.15)) }],
        hireDate: new Date(Date.UTC(2022, staffNo % 12, 1)),
      },
    });
    staffNo++;
  }

  // ── Payers, schemes, price lists
  const cashList = await findOrCreate(
    () => prisma.priceList.findFirst({ where: { tenantId: T, payerType: 'CASH', schemeId: null } }),
    () => prisma.priceList.create({ data: { tenantId: T, name: 'Cash', payerType: 'CASH', isDefault: true } }),
  );
  const payerDefs: { name: string; type: string; code: string; integration: string; scheme: string; copay: number; payerType: string; factor: number; limit?: number }[] = [
    { name: 'Social Health Authority', type: 'SHA', code: 'SHA', integration: 'sha-hie', scheme: 'SHA - SHIF', copay: 0, payerType: 'SHA', factor: 0.85 },
    { name: 'Jubilee', type: 'INSURER', code: 'JUB', integration: 'smart', scheme: 'Jubilee Corporate Medical', copay: 10, payerType: 'INSURANCE', factor: 1.15, limit: 500000 },
    { name: 'AAR', type: 'INSURER', code: 'AAR', integration: 'slade360', scheme: 'AAR Outpatient & Inpatient', copay: 0, payerType: 'INSURANCE', factor: 1.2, limit: 300000 },
    { name: 'Britam', type: 'INSURER', code: 'BRT', integration: 'smart', scheme: 'Britam Afya Imara', copay: 5, payerType: 'INSURANCE', factor: 1.1, limit: 400000 },
  ];
  const schemes: Record<string, { id: string; copay: number; payerType: string; factor: number; priceListId: string; payerId: string }> = {};
  for (const p of payerDefs) {
    const payer = await findOrCreate(
      () => prisma.payer.findFirst({ where: { tenantId: T, name: p.name } }),
      () => prisma.payer.create({ data: { tenantId: T, name: p.name, type: p.type, code: p.code, integration: p.integration } }),
    );
    const scheme = await findOrCreate(
      () => prisma.scheme.findFirst({ where: { tenantId: T, payerId: payer.id, name: p.scheme } }),
      () => prisma.scheme.create({
        data: { tenantId: T, payerId: payer.id, name: p.scheme, copayPercent: p.copay, annualLimitMinor: p.limit ? KES(p.limit) : undefined, requiresPreauthAboveMinor: KES(p.type === 'SHA' ? 20000 : 50000) },
      }),
    );
    const pl = await findOrCreate(
      () => prisma.priceList.findFirst({ where: { tenantId: T, schemeId: scheme.id } }),
      () => prisma.priceList.create({ data: { tenantId: T, name: `${p.name} Tariff`, payerType: p.payerType, schemeId: scheme.id } }),
    );
    schemes[p.code] = { id: scheme.id, copay: p.copay, payerType: p.payerType, factor: p.factor, priceListId: pl.id, payerId: payer.id };
  }
  const priceFor = (code: string, factor: number) => Math.round((svc[code].price * factor) / 100) * 100;
  for (const [listId, factor] of [[cashList.id, 1], ...Object.values(schemes).map((s) => [s.priceListId, s.factor] as [string, number])] as [string, number][]) {
    if ((await prisma.priceListItem.count({ where: { priceListId: listId } })) > 0) continue;
    await prisma.priceListItem.createMany({
      data: Object.keys(svc).map((code) => ({ priceListId: listId, serviceItemId: svc[code].id, priceMinor: priceFor(code, factor) })),
      skipDuplicates: true,
    });
  }

  // ── Stock items & batches
  const stock: Record<string, { id: string; price: number }> = {};
  let bn = 1;
  for (const [code, name, generic, form, strength, price, cost, reorder, category, controlled] of STOCK) {
    const item = await prisma.stockItem.upsert({
      where: { tenantId_code: { tenantId: T, code } },
      update: { sellPriceMinor: KES(price) },
      create: {
        tenantId: T, code, name, genericName: generic || null, form, strength: strength || null, category: category ?? 'DRUG',
        unit: form, isControlled: !!controlled, reorderLevel: reorder, sellPriceMinor: KES(price), vatRate: category === 'CONSUMABLE' ? 0.16 : 0,
      },
    });
    stock[code] = { id: item.id, price: item.sellPriceMinor };
    if ((await prisma.stockBatch.count({ where: { tenantId: T, itemId: item.id } })) === 0) {
      // ~8% of items deliberately low on stock, some batches near expiry
      const low = bn % 12 === 0;
      const batches = [
        { store: 'MAIN', qty: low ? Math.floor(reorder * 0.3) : reorder * int(2, 6), months: int(10, 30) },
        { store: category === 'REAGENT' ? 'LAB' : 'PHARMACY', qty: low ? Math.floor(reorder * 0.2) : Math.ceil(reorder * (0.5 + rnd())), months: bn % 9 === 0 ? 2 : int(6, 18) },
      ];
      for (const b of batches) {
        const batchNo = `B${String(bn).padStart(4, '0')}-${b.store.slice(0, 2)}`;
        await prisma.stockBatch.create({
          data: { tenantId: T, itemId: item.id, storeId: stores[b.store], batchNo, expiryDate: new Date(Date.now() + b.months * 30 * DAY), quantity: b.qty, unitCostMinor: KES(cost) },
        });
        await prisma.stockMovement.create({ data: { tenantId: T, itemId: item.id, toStoreId: stores[b.store], type: 'RECEIPT', quantity: b.qty, reference: `GRN-DEMO-${batchNo}`, userId: users.store, createdAt: new Date(Date.now() - 70 * DAY) } });
      }
    }
    bn++;
  }

  // ── Chart of accounts
  {
    const existing = new Set((await prisma.account.findMany({ where: { tenantId: T }, select: { code: true } })).map((a) => a.code));
    for (const a of KENYA_HEALTHCARE_COA.filter((x) => !x.parent && !existing.has(x.code))) await prisma.account.create({ data: { tenantId: T, code: a.code, name: a.name, type: a.type } });
    const ids = new Map((await prisma.account.findMany({ where: { tenantId: T } })).map((a) => [a.code, a.id]));
    for (const a of KENYA_HEALTHCARE_COA.filter((x) => x.parent && !existing.has(x.code))) await prisma.account.create({ data: { tenantId: T, code: a.code, name: a.name, type: a.type, parentId: ids.get(a.parent!) } });
  }

  // ── Patients, visits, clinical data, bills, payments, claims
  const now = Date.now();
  const beds = await prisma.bed.findMany({ where: { tenantId: T }, include: { ward: true }, orderBy: { label: 'asc' } });
  const totalW = DIAGNOSES.reduce((s, d) => s + d.w, 0);
  const pickDx = (child: boolean) => {
    const pool = child ? DIAGNOSES.filter((d) => d.kids || d.code.startsWith('1F4')) : DIAGNOSES;
    const tw = child ? pool.reduce((s, d) => s + d.w, 0) : totalW;
    let r = rnd() * tw;
    for (const d of pool) { if ((r -= d.w) <= 0) return d; }
    return pool[0];
  };
  const doctorIds = [users.doctor, users.co];
  let visitSeq = 0;
  let billSeq = 0;
  let rcptSeq = 0;
  let claimSeq = 0;
  let admittedNow = 0;

  for (let p = 1; p <= 40; p++) {
    _s = 1000003 * p; // reseed per patient so re-runs are stable
    const sex = rnd() < 0.52 ? 'FEMALE' : 'MALE';
    const child = p % 4 === 0; // ~25% under five
    const age = child ? int(0, 4) : int(5, 80);
    const dob = new Date(Date.UTC(new Date().getUTCFullYear() - age, int(0, 11), int(1, 28)));
    // Role labels only: demo data must never look like real people.
    const first = 'Patient'; const last = String(p).padStart(4, '0');
    const payerCode = p % 10 < 5 ? 'CASH' : p % 10 < 8 ? 'SHA' : pick(['JUB', 'AAR', 'BRT']);
    const mrn = `DMH-${String(p).padStart(5, '0')}`;
    const patient = await prisma.patient.upsert({
      where: { tenantId_mrn: { tenantId: T, mrn } },
      update: { firstName: first, lastName: last, middleName: null, phone: null, email: p === 1 ? 'patient@demo.jmsurf.health' : null, nextOfKin: [{ name: 'Next of kin', relationship: child ? 'MOTHER' : 'SPOUSE' }] },
      create: {
        tenantId: T, mrn, firstName: first, lastName: last, middleName: null, email: p === 1 ? 'patient@demo.jmsurf.health' : null, sex: sex as any, dateOfBirth: dob,
        idType: child ? 'BIRTH_CERT' : 'NATIONAL_ID', idNumber: child ? `BC${3000000 + p}` : String(25000000 + p * 104729),
        phone: null, county: pick(COUNTIES), shaNumber: payerCode === 'SHA' ? `SHA${8000000 + p}` : null,
        crId: payerCode === 'SHA' ? `CR${5000000 + p}` : null, maritalStatus: child ? null : pick(['SINGLE', 'MARRIED', 'MARRIED', 'WIDOWED']),
        nextOfKin: [{ name: 'Next of kin', relationship: child ? 'MOTHER' : 'SPOUSE' }],
      },
    });
    if (p % 7 === 0 && (await prisma.allergy.count({ where: { patientId: patient.id } })) === 0) {
      await prisma.allergy.create({ data: { tenantId: T, patientId: patient.id, substance: pick(['Penicillin', 'Sulfonamides', 'Aspirin']), reaction: 'Rash', severity: 'MODERATE' } });
    }
    let coverId: string | undefined;
    if (payerCode !== 'CASH') {
      const sch = schemes[payerCode];
      const cover = await findOrCreate(
        () => prisma.memberCover.findFirst({ where: { tenantId: T, patientId: patient.id, schemeId: sch.id } }),
        () => prisma.memberCover.create({ data: { tenantId: T, patientId: patient.id, schemeId: sch.id, memberNumber: `${payerCode}-${600000 + p}`, validFrom: new Date(now - 365 * DAY), validTo: new Date(now + 365 * DAY) } }),
      );
      coverId = cover.id;
    }

    const nVisits = int(1, 3);
    for (let v = 0; v < nVisits; v++) {
      visitSeq++;
      _s = 7919 * visitSeq + 17; // reseed per visit
      const visitNumber = `VIS-DEMO-${String(visitSeq).padStart(5, '0')}`;
      // consume randomness deterministically even when skipping
      const daysAgo = visitSeq <= 8 ? 0 : int(1, 60);
      const ipd = visitSeq % 13 === 0;
      const emergency = !ipd && visitSeq % 11 === 0;
      const dx = pickDx(child);
      const dx2 = rnd() < 0.25 ? pickDx(child) : null;
      const paymentRoll = rnd();
      const minutes = int(0, 9 * 60);
      if (await prisma.visit.findUnique({ where: { tenantId_visitNumber: { tenantId: T, visitNumber } } })) continue;

      const startedAt = new Date(eatDayStart(now - daysAgo * DAY).getTime() + (8 * 60 + minutes) * 60000);
      if (startedAt.getTime() > now) startedAt.setTime(now - int(5, 120) * 60000);
      const sch = payerCode === 'CASH' ? null : schemes[payerCode];
      const discharged = ipd && (daysAgo > 5 || admittedNow >= 4);
      const los = ipd ? (discharged ? int(2, 5) : Math.max(1, daysAgo)) : 0;
      const visit = await prisma.visit.create({
        data: {
          tenantId: T, facilityId: F, patientId: patient.id, visitNumber, type: ipd ? 'IPD' : emergency ? 'EMERGENCY' : 'OPD',
          status: ipd ? (discharged ? 'DISCHARGED' : 'ADMITTED') : daysAgo === 0 ? 'IN_PROGRESS' : 'CLOSED',
          payerType: payerCode === 'CASH' ? 'CASH' : sch!.payerType, schemeId: sch?.id, coverId, shaFund: payerCode === 'SHA' ? 'SHIF' : null,
          departmentId: depts[emergency ? 'Accident & Emergency' : ipd ? 'Inpatient Wards' : 'Outpatient (OPD)'], practitionerId: pick(doctorIds),
          startedAt, endedAt: daysAgo === 0 && !ipd ? null : new Date(startedAt.getTime() + (ipd ? los * DAY : 3 * 3600000)),
        },
      });
      await prisma.triage.create({ data: { tenantId: T, visitId: visit.id, category: emergency ? 'ORANGE' : pick(['GREEN', 'GREEN', 'YELLOW']), complaint: dx.display, byUserId: users.nurse, createdAt: new Date(startedAt.getTime() + 10 * 60000) } });
      await prisma.vitals.create({
        data: {
          tenantId: T, visitId: visit.id, temperatureC: +(36 + rnd() * 3).toFixed(1), pulse: int(60, 120), respRate: int(14, 28), systolic: child ? null : int(100, 170), diastolic: child ? null : int(60, 105),
          spo2: int(92, 100), weightKg: child ? +(4 + age * 2.5 + rnd() * 2).toFixed(1) : +(50 + rnd() * 40).toFixed(1), byUserId: users.nurse, takenAt: new Date(startedAt.getTime() + 12 * 60000),
        },
      });
      await prisma.clinicalNote.create({
        data: {
          tenantId: T, visitId: visit.id, subjective: `Presents with symptoms consistent with ${dx.display.toLowerCase()}.`, objective: 'Vitals recorded. General exam as noted.',
          assessment: dx.display, plan: 'Investigations and treatment as ordered. Review if symptoms persist.', authorId: visit.practitionerId, signedAt: new Date(startedAt.getTime() + 40 * 60000),
          createdAt: new Date(startedAt.getTime() + 35 * 60000),
        },
      });
      for (const [d, type] of [[dx, 'PRIMARY'], ...(dx2 && dx2.code !== dx.code ? [[dx2, 'SECONDARY']] : [])] as [typeof dx, string][]) {
        await prisma.diagnosis.create({ data: { tenantId: T, visitId: visit.id, codeSystem: 'ICD-11', code: d.code, display: d.display, type, createdAt: new Date(startedAt.getTime() + 40 * 60000) } });
      }

      // Bill lines
      const factor = sch?.factor ?? 1;
      const lines: { sourceType: string; sourceId?: string; serviceItemId?: string; stockItemId?: string; description: string; quantity: number; unit: number; vatRate: number; sha?: string }[] = [];
      const addSvc = (code: string, qty = 1, sourceType = 'MANUAL', sourceId?: string) =>
        lines.push({ sourceType, sourceId, serviceItemId: svc[code].id, description: SERVICES.find((s) => s[0] === code)?.[1] ?? LAB.find((l) => `LAB-${l[0]}` === code)?.[1] ?? code, quantity: qty, unit: priceFor(code, factor), vatRate: 0, sha: SERVICES.find((s) => s[0] === code)?.[5] });
      addSvc(emergency ? 'CONSULT-ER' : child ? 'CONSULT-PAED' : 'CONSULT', 1, 'CONSULTATION');
      if (visitSeq % 6 === 0) addSvc('REG-FEE');

      if (dx.lab) {
        const order = await prisma.order.create({
          data: {
            tenantId: T, visitId: visit.id, type: 'LAB', serviceId: svc[`LAB-${dx.lab}`].id, description: LAB.find((l) => l[0] === dx.lab)![1],
            status: 'VERIFIED', orderedById: visit.practitionerId, createdAt: new Date(startedAt.getTime() + 45 * 60000),
          },
        });
        const tat = int(25, 150);
        const lt = LAB.find((l) => l[0] === dx.lab)!;
        const value = lt[4] !== null && lt[5] !== null ? (lt[4] + rnd() * (lt[5] - lt[4]) * 1.4).toFixed(1) : dx.lab === 'BS-MPS' || dx.lab === 'MRDT' ? (dx.code === '1F40' ? 'Positive (++)' : 'Negative') : 'See report';
        await prisma.labSpecimen.create({ data: { tenantId: T, orderId: order.id, accession: `ACC-${visitNumber}`, specimenType: lt[2], collectedAt: new Date(order.createdAt.getTime() + 10 * 60000), collectedBy: users.lab, receivedAt: new Date(order.createdAt.getTime() + 15 * 60000) } });
        await prisma.labResult.create({
          data: {
            tenantId: T, orderId: order.id, testCode: dx.lab, value, unit: lt[3], flag: lt[5] !== null && +value > lt[5] ? 'H' : 'N', enteredBy: users.lab, verifiedBy: users.lab,
            createdAt: new Date(order.createdAt.getTime() + tat * 60000), verifiedAt: new Date(order.createdAt.getTime() + (tat + 5) * 60000),
          },
        });
        addSvc(`LAB-${dx.lab}`, 1, 'ORDER', order.id);
      }
      if (dx.code === 'CA40' || (emergency && rnd() < 0.5)) {
        const order = await prisma.order.create({ data: { tenantId: T, visitId: visit.id, type: 'IMAGING', serviceId: svc['XR-CHEST'].id, description: 'X-Ray Chest PA', status: 'VERIFIED', orderedById: visit.practitionerId, createdAt: new Date(startedAt.getTime() + 50 * 60000) } });
        await prisma.imagingReport.create({ data: { tenantId: T, orderId: order.id, modality: 'XR', findings: 'Patchy opacities noted.', impression: dx.code === 'CA40' ? 'Features of pneumonia' : 'No acute abnormality', reportedBy: users.radiology, verifiedBy: users.radiology, verifiedAt: new Date(order.createdAt.getTime() + 3 * 3600000) } });
        addSvc('XR-CHEST', 1, 'ORDER', order.id);
      }
      if (emergency) addSvc(pick(['PROC-DRESS', 'PROC-SUTURE', 'PROC-NEB', 'PROC-IVCAN']), 1, 'PROCEDURE');
      if (dx.drug) {
        const qty = stock[dx.drug].price >= KES(100) ? 1 : int(10, 30);
        const rx = await prisma.prescription.create({
          data: {
            tenantId: T, visitId: visit.id, itemId: stock[dx.drug].id, drugName: STOCK.find((s) => s[0] === dx.drug)![1], dose: '1 tab', route: 'PO', frequency: pick(['BD', 'TDS', 'OD']),
            durationDays: int(3, 7), quantity: qty, status: 'DISPENSED', prescriberId: visit.practitionerId, createdAt: new Date(startedAt.getTime() + 60 * 60000),
          },
        });
        await prisma.dispense.create({ data: { tenantId: T, prescriptionId: rx.id, itemId: stock[dx.drug].id, quantity: qty, storeId: stores.PHARMACY, dispensedBy: users.pharmacy, createdAt: new Date(startedAt.getTime() + 90 * 60000) } });
        lines.push({ sourceType: 'PRESCRIPTION', sourceId: rx.id, stockItemId: stock[dx.drug].id, description: rx.drugName, quantity: qty, unit: Math.round(stock[dx.drug].price * factor), vatRate: 0 });
      }
      if (ipd) {
        const wardType = child ? 'PAEDIATRIC' : sex === 'FEMALE' ? 'GENERAL' : 'GENERAL';
        const wardName = child ? 'Paediatric Ward' : payerCode !== 'CASH' && payerCode !== 'SHA' ? 'Private Wing' : sex === 'FEMALE' ? 'Female Ward' : 'Male Ward';
        const bed = beds.find((b) => b.ward.name === wardName && b.status === 'AVAILABLE');
        const ward = beds.find((b) => b.ward.name === wardName)!.ward;
        await prisma.admission.create({
          data: {
            tenantId: T, visitId: visit.id, wardId: ward.id, bedId: discharged ? null : bed?.id, admittedById: visit.practitionerId, reason: dx.display, admittedAt: startedAt,
            dischargedAt: discharged ? new Date(startedAt.getTime() + los * DAY) : null, dischargeType: discharged ? 'NORMAL' : null,
            dischargeSummary: discharged ? `Admitted with ${dx.display}. Improved on treatment. Discharged home on oral medication.` : null,
            lastChargedAt: discharged ? null : new Date(eatDayStart(now).getTime()),
          },
        });
        if (!discharged && bed) {
          await prisma.bed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } });
          bed.status = 'OCCUPIED';
          admittedNow++;
        }
        const rate = WARDS.find((w) => w.name === wardName)!.rateCode;
        addSvc(rate, los, 'BED');
        addSvc('NURS-DAY', los, 'BED');
        addSvc('DOC-ROUND', los, 'BED');
        lines.push({ sourceType: 'PRESCRIPTION', stockItemId: stock.NS500.id, description: 'Normal Saline 0.9% 500ml', quantity: 2 * los, unit: Math.round(stock.NS500.price * factor), vatRate: 0 });
        lines.push({ sourceType: 'MANUAL', stockItemId: stock.CANN20.id, description: 'IV Cannula 20G', quantity: 1, unit: Math.round(stock.CANN20.price * factor), vatRate: 0.16 });
        void wardType;
      }

      billSeq++;
      const billNumber = `INV-DEMO-${String(billSeq).padStart(5, '0')}`;
      const total = lines.reduce((s, l) => s + Math.round(l.unit * l.quantity), 0);
      const payerAmount = sch ? Math.round(total * (1 - sch.copay / 100)) : 0;
      const patientAmount = total - payerAmount;
      const open = (daysAgo === 0 && !ipd) || (ipd && !discharged);
      let paid = 0;
      if (!open || daysAgo === 0) {
        if (patientAmount > 0) paid = paymentRoll < 0.85 ? patientAmount : Math.round(patientAmount * 0.5 / 100) * 100;
      }
      if (ipd && !discharged) paid = Math.min(patientAmount, Math.round(total * 0.3 / 100) * 100); // deposit
      const status = open ? (paid > 0 ? 'INTERIM' : 'OPEN') : paid >= patientAmount ? (payerAmount > 0 ? 'FINAL' : 'PAID') : 'PARTIALLY_PAID';
      const billDate = new Date(startedAt.getTime() + (ipd ? los * DAY : 2 * 3600000));
      const bill = await prisma.bill.create({
        data: {
          tenantId: T, facilityId: F, visitId: visit.id, billNumber, status: status as any, totalMinor: total, payerAmountMinor: payerAmount, patientAmountMinor: patientAmount,
          paidMinor: paid, createdAt: startedAt, updatedAt: billDate > new Date(now) ? new Date(now) : billDate,
          lines: {
            create: lines.map((l) => {
              const lt = Math.round(l.unit * l.quantity);
              return {
                tenantId: T, sourceType: l.sourceType, sourceId: l.sourceId, serviceItemId: l.serviceItemId, stockItemId: l.stockItemId, description: l.description,
                quantity: l.quantity, unitPriceMinor: l.unit, totalMinor: lt, vatMinor: l.vatRate > 0 ? Math.round((lt * l.vatRate) / (1 + l.vatRate)) : 0,
                payer: sch ? 'SCHEME' : 'PATIENT', shaInterventionCode: l.sha, createdAt: startedAt,
              };
            }),
          },
        },
      });
      if (paid > 0) {
        rcptSeq++;
        const method = sch && payerCode === 'SHA' ? 'MPESA' : pick(['MPESA', 'MPESA', 'MPESA', 'CASH', 'CASH', 'CARD']);
        await prisma.payment.create({
          data: {
            tenantId: T, billId: bill.id, receiptNumber: `RCT-DEMO-${String(rcptSeq).padStart(5, '0')}`, method, amountMinor: paid,
            reference: method === 'MPESA' ? `SJ${(4000000 + rcptSeq * 7919).toString(36).toUpperCase()}X` : method === 'CARD' ? `AUTH${100000 + rcptSeq}` : null,
            phone: method === 'MPESA' ? patient.phone : null, cashierId: users.cashier, createdAt: new Date(Math.min(now, billDate.getTime() + 15 * 60000)),
          },
        });
      }
      if (sch && !open && payerAmount > 0) {
        claimSeq++;
        const age_ = daysAgo;
        const cstatus = age_ > 45 ? (claimSeq % 3 === 0 ? 'PARTIALLY_APPROVED' : 'PAID') : age_ > 20 ? pick(['APPROVED', 'IN_REVIEW', 'SUBMITTED']) : age_ > 3 ? 'SUBMITTED' : 'DRAFT';
        const approved = ['APPROVED', 'PAID', 'PARTIALLY_APPROVED'].includes(cstatus) ? (cstatus === 'PARTIALLY_APPROVED' ? Math.round(payerAmount * 0.8) : payerAmount) : null;
        await prisma.claim.create({
          data: {
            tenantId: T, facilityId: F, visitId: visit.id, billId: bill.id, payerId: sch.payerId, claimNumber: `CLM-DEMO-${String(claimSeq).padStart(5, '0')}`,
            status: cstatus as any, totalMinor: payerAmount, approvedMinor: approved, paidMinor: cstatus === 'PAID' ? approved : null,
            externalRef: cstatus !== 'DRAFT' ? `EXT-${payerCode}-${900000 + claimSeq}` : null, submittedAt: cstatus !== 'DRAFT' ? new Date(billDate.getTime() + DAY) : null,
            decidedAt: approved ? new Date(billDate.getTime() + 14 * DAY) : null, createdAt: billDate,
            lines: { create: lines.map((l) => ({ code: l.sha ?? 'GEN', description: l.description, quantity: l.quantity, amountMinor: Math.round(l.unit * l.quantity * (1 - sch.copay / 100)) })) },
            events: { create: [{ toStatus: 'DRAFT', createdAt: billDate }, ...(cstatus !== 'DRAFT' ? [{ fromStatus: 'DRAFT', toStatus: cstatus }] : [])] },
          },
        });
      }
    }
  }

  // ── GL journals for finalized bills & payments (idempotent by sourceType/sourceId)
  const svcCat = new Map((await prisma.serviceItem.findMany({ where: { tenantId: T }, select: { id: true, category: true } })).map((s) => [s.id, s.category]));
  const finalBills = await prisma.bill.findMany({ where: { tenantId: T, status: { in: ['FINAL', 'PAID', 'PARTIALLY_PAID'] } }, include: { lines: { where: { voided: false } }, visit: { select: { payerType: true } } } });
  const journaled = new Set((await prisma.journalEntry.findMany({ where: { tenantId: T, sourceType: { in: ['BILL', 'PAYMENT'] } }, select: { sourceId: true } })).map((j) => j.sourceId));
  let journals = 0;
  for (const b of finalBills) {
    if (journaled.has(b.id)) continue;
    const jl = billJournalLines({
      discountMinor: b.discountMinor, payerAmountMinor: b.payerAmountMinor, payerType: b.visit.payerType,
      lines: b.lines.map((l) => ({ totalMinor: l.totalMinor, vatMinor: l.vatMinor, category: l.serviceItemId ? svcCat.get(l.serviceItemId) ?? null : 'PHARMACY' })),
    });
    validateJournal(jl);
    await prisma.journalEntry.create({ data: { tenantId: T, date: b.updatedAt, reference: b.billNumber, sourceType: 'BILL', sourceId: b.id, memo: `Invoice ${b.billNumber}`, lines: jl as any } });
    journals++;
  }
  const payments = await prisma.payment.findMany({ where: { tenantId: T, status: 'COMPLETED', bill: { status: { in: ['FINAL', 'PAID', 'PARTIALLY_PAID'] } } } });
  for (const pmt of payments) {
    if (journaled.has(pmt.id)) continue;
    const jl = paymentJournalLines(pmt);
    await prisma.journalEntry.create({ data: { tenantId: T, date: pmt.createdAt, reference: pmt.receiptNumber, sourceType: 'PAYMENT', sourceId: pmt.id, memo: `Receipt ${pmt.receiptNumber} (${pmt.method})`, lines: jl as any } });
    journals++;
  }
  // Opening balances & a few operating expenses
  const manual: { ref: string; daysAgo: number; memo: string; lines: [string, number, number][] }[] = [
    { ref: 'OB-DEMO-001', daysAgo: 75, memo: 'Opening balances', lines: [['1020', KES(4_500_000), 0], ['1510', KES(12_000_000), 0], ['1200', KES(1_800_000), 0], ['3000', 0, KES(18_300_000)]] },
    { ref: 'EXP-DEMO-001', daysAgo: 40, memo: 'KPLC electricity', lines: [['6100', KES(85_000), 0], ['1020', 0, KES(85_000)]] },
    { ref: 'EXP-DEMO-002', daysAgo: 10, memo: 'KPLC electricity & Nairobi Water', lines: [['6100', KES(97_500), 0], ['1020', 0, KES(97_500)]] },
    { ref: 'EXP-DEMO-003', daysAgo: 25, memo: 'Autoclave repair', lines: [['6300', KES(42_000), 0], ['1020', 0, KES(42_000)]] },
  ];
  for (const m of manual) {
    if (await prisma.journalEntry.findFirst({ where: { tenantId: T, reference: m.ref } })) continue;
    const jl = m.lines.map(([accountCode, debitMinor, creditMinor]) => ({ accountCode, debitMinor, creditMinor, costCentre: m.ref.startsWith('EXP') ? 'ADMIN' : undefined }));
    validateJournal(jl);
    await prisma.journalEntry.create({ data: { tenantId: T, date: new Date(now - m.daysAgo * DAY), reference: m.ref, sourceType: 'MANUAL', memo: m.memo, lines: jl as any, postedBy: users.accounts } });
    journals++;
  }

  // ── Assets, budget, leave, quality samples
  const assets: [string, string, string, number, number, number, number][] = [
    ['AST-0001', 'Digital X-Ray Machine', 'MEDICAL_EQUIPMENT', 6_500_000, 10, 900, 15],
    ['AST-0002', 'Ultrasound Machine (GE Logiq)', 'MEDICAL_EQUIPMENT', 2_800_000, 7, 600, -5],
    ['AST-0003', 'Haematology Analyser', 'LAB_EQUIPMENT', 1_200_000, 5, 400, 40],
    ['AST-0004', 'Chemistry Analyser', 'LAB_EQUIPMENT', 1_900_000, 5, 300, 10],
    ['AST-0005', 'Autoclave 100L', 'MEDICAL_EQUIPMENT', 450_000, 8, 1200, 3],
    ['AST-0006', 'Ambulance (Toyota Hiace)', 'VEHICLE', 5_200_000, 5, 700, 60],
    ['AST-0007', 'Haemodialysis Machine', 'MEDICAL_EQUIPMENT', 3_400_000, 7, 200, 20],
    ['AST-0008', 'Standby Generator 100kVA', 'PLANT', 2_100_000, 10, 1500, -12],
    ['AST-0009', 'Patient Monitors (x6)', 'MEDICAL_EQUIPMENT', 900_000, 5, 500, 90],
    ['AST-0010', 'Server & Networking', 'ICT', 750_000, 3, 450, 120],
  ];
  for (const [tag, name, category, cost, life, ageDays, svcDays] of assets) {
    await prisma.asset.upsert({
      where: { tenantId_tag: { tenantId: T, tag } },
      update: {},
      create: { tenantId: T, facilityId: F, tag, name, category, costMinor: KES(cost), usefulLifeYears: life, purchaseDate: new Date(now - ageDays * DAY), location: 'Main Hospital', nextServiceAt: new Date(now + svcDays * DAY) },
    });
  }
  const year = new Date().getUTCFullYear();
  if (!(await prisma.budget.findFirst({ where: { tenantId: T, year, department: 'ADMIN' } }))) {
    await prisma.budget.create({ data: { tenantId: T, year, department: 'ADMIN', status: 'APPROVED', lines: [{ accountCode: '6100', amountMinor: KES(1_200_000) }, { accountCode: '6300', amountMinor: KES(600_000) }, { accountCode: '6900', amountMinor: KES(400_000) }] } });
  }
  if (!(await prisma.budget.findFirst({ where: { tenantId: T, year, department: 'FACILITY' } }))) {
    await prisma.budget.create({ data: { tenantId: T, year, department: 'FACILITY', status: 'APPROVED', lines: [{ accountCode: '4000', amountMinor: KES(6_000_000) }, { accountCode: '4010', amountMinor: KES(3_000_000) }, { accountCode: '4050', amountMinor: KES(4_000_000) }, { accountCode: '6000', amountMinor: KES(30_000_000) }] } });
  }
  const emps = await prisma.employee.findMany({ where: { tenantId: T }, orderBy: { staffNo: 'asc' }, take: 3 });
  if ((await prisma.leaveRequest.count({ where: { tenantId: T } })) === 0 && emps.length === 3) {
    await prisma.leaveRequest.createMany({
      data: [
        { tenantId: T, employeeId: emps[0].id, type: 'ANNUAL', startDate: new Date(now + 14 * DAY), endDate: new Date(now + 24 * DAY) },
        { tenantId: T, employeeId: emps[1].id, type: 'SICK', startDate: new Date(now - 20 * DAY), endDate: new Date(now - 18 * DAY), status: 'APPROVED' },
        { tenantId: T, employeeId: emps[2].id, type: 'STUDY', startDate: new Date(now + 30 * DAY), endDate: new Date(now + 35 * DAY) },
      ],
    });
  }
  if ((await prisma.incident.count({ where: { tenantId: T } })) === 0) {
    await prisma.incident.createMany({
      data: [
        { tenantId: T, facilityId: F, number: 'INC-DEMO-0001', occurredAt: new Date(now - 12 * DAY), location: 'Male Ward', category: 'FALL', severity: 'LOW', description: 'Patient slipped near washroom; no injury.', reportedById: users.nurse, status: 'CLOSED', findings: 'Wet floor without signage.', actions: 'Wet-floor signage procured; cleaning schedule revised.', closedAt: new Date(now - 5 * DAY) },
        { tenantId: T, facilityId: F, number: 'INC-DEMO-0002', occurredAt: new Date(now - 3 * DAY), location: 'Pharmacy', category: 'MEDICATION_ERROR', severity: 'NEAR_MISS', description: 'Wrong strength of amlodipine picked; caught at counselling.', reportedById: users.pharmacy, status: 'INVESTIGATING', investigatorId: users.admin },
        { tenantId: T, facilityId: F, number: 'INC-DEMO-0003', occurredAt: new Date(now - 1 * DAY), location: 'Laboratory', category: 'NEEDLESTICK', severity: 'MODERATE', description: 'Needlestick injury during phlebotomy. PEP initiated.', reportedById: users.lab },
      ],
    });
  }
  // Patient portal demo login for Patient 0001 (email above, same demo password).
  const portalPt = await prisma.patient.findUnique({ where: { tenantId_mrn: { tenantId: T, mrn: 'DMH-00001' } } });
  if (portalPt) await prisma.portalAccount.upsert({ where: { patientId: portalPt.id }, update: { passwordHash }, create: { tenantId: T, patientId: portalPt.id, passwordHash } });

  if ((await prisma.complaint.count({ where: { tenantId: T } })) === 0) {
    await prisma.complaint.createMany({
      data: [
        { tenantId: T, number: 'CMP-DEMO-0001', complainant: 'Patient 0003', phone: null, channel: 'SUGGESTION_BOX', category: 'SERVICE', description: 'Long waiting time at the pharmacy on Saturday.', status: 'RESOLVED', resolution: 'Added a second dispenser on weekends.', resolvedAt: new Date(now - 4 * DAY) },
        { tenantId: T, number: 'CMP-DEMO-0002', complainant: 'Patient 0008', phone: null, channel: 'PHONE', category: 'BILLING', description: 'Charged twice for consultation.', status: 'IN_PROGRESS', assignedToId: users.accounts },
      ],
    });
  }

  const counts = {
    services: await prisma.serviceItem.count({ where: { tenantId: T } }), labTests: await prisma.labTest.count({ where: { tenantId: T } }),
    stockItems: await prisma.stockItem.count({ where: { tenantId: T } }), patients: await prisma.patient.count({ where: { tenantId: T } }),
    visits: await prisma.visit.count({ where: { tenantId: T } }), bills: await prisma.bill.count({ where: { tenantId: T } }),
    payments: await prisma.payment.count({ where: { tenantId: T } }), claims: await prisma.claim.count({ where: { tenantId: T } }),
    employees: await prisma.employee.count({ where: { tenantId: T } }), accounts: await prisma.account.count({ where: { tenantId: T } }),
    journalsCreatedThisRun: journals,
  };
  console.log('Seed complete:', counts);
  console.log(`Login: admin@demo.jmsurf.health / ${PASSWORD} (also doctor@, nurse@, lab@, pharmacy@, cashier@, claims@, store@, accounts@, hr@, reception@, co@, radiology@)`);
}

/** Start of the EAT (UTC+3) calendar day containing `ms`, as a UTC Date. */
function eatDayStart(ms: number) {
  const off = 3 * 3600000;
  const l = new Date(ms + off);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - off);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
