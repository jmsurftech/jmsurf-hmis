import {
  Ambulance, Apple, Baby, BadgeCheck, Biohazard, Brain, Droplet, Eye, FileHeart, FileSignature, FileWarning, GraduationCap, HandHeart, HeartHandshake,
  HeartPulse, Microscope, PersonStanding, Ribbon, Send, ShieldPlus, Skull, Smile, Soup, Sparkles, Syringe, Wrench,
} from 'lucide-react';

/** Field in a register form. Values are kept in record.data[name] (title/status/patient/visit are top-level). */
export interface RegField {
  name: string; label: string;
  type?: 'text' | 'number' | 'date' | 'datetime-local' | 'select' | 'textarea' | 'checkbox' | 'tel' | 'time' | 'staff';
  options?: string[]; required?: boolean; hint?: string; full?: boolean; unit?: string;
  /** Calculated by the API register rules (apps/api/src/clinical/registers/register-rules.ts); shown, not edited. */
  readOnly?: boolean;
}
export interface RegisterConfig {
  key: string; label: string; single: string; group: string; icon: React.ElementType; roles: string[];
  subtitle: string; patient?: boolean; visit?: boolean; titleLabel?: string;
  statuses: string[]; /** statuses that count as "open work" on the KPI tile */ active: string[];
  fields: RegField[]; columns: string[]; chargeCategory?: string; empty: string;
}

const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'TRIAGE_NURSE'];
const NURSE = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER'];
const YESNO = ['Yes', 'No'];

export const REGISTERS: RegisterConfig[] = [
  // ---------------------------------------------------------------- Specialty clinics
  { key: 'dental', label: 'Dental clinic', single: 'dental visit', group: 'Specialty clinics', icon: Smile, roles: CLIN, patient: true, visit: true,
    subtitle: 'Dental charting, procedures and follow-up.', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], active: ['OPEN', 'IN_PROGRESS'], chargeCategory: 'PROCEDURE',
    titleLabel: 'Chief complaint', empty: 'Dental visits recorded here appear in the patient record and can be billed.',
    fields: [
      { name: 'teeth', label: 'Teeth involved (FDI)', hint: 'For example 36, 37' }, { name: 'findings', label: 'Examination findings', type: 'textarea', full: true },
      { name: 'procedure', label: 'Procedure', type: 'select', options: ['Examination', 'Scaling and polishing', 'Filling', 'Extraction', 'Root canal', 'Crown', 'Denture', 'Orthodontic review', 'X-ray', 'Other'] },
      { name: 'anaesthesia', label: 'Anaesthesia', type: 'select', options: ['None', 'Local', 'General'] }, { name: 'nextVisit', label: 'Next visit', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ], columns: ['procedure', 'teeth', 'nextVisit'] },
  { key: 'eye', label: 'Eye clinic', single: 'eye examination', group: 'Specialty clinics', icon: Eye, roles: CLIN, patient: true, visit: true,
    subtitle: 'Visual acuity, refraction, pressure and spectacle prescriptions.', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], active: ['OPEN', 'IN_PROGRESS'], chargeCategory: 'PROCEDURE',
    titleLabel: 'Presenting complaint', empty: 'Record eye examinations and spectacle prescriptions.',
    fields: [
      { name: 'vaRight', label: 'Visual acuity right', hint: 'For example 6/9' }, { name: 'vaLeft', label: 'Visual acuity left' },
      { name: 'iopRight', label: 'IOP right', type: 'number', unit: 'mmHg' }, { name: 'iopLeft', label: 'IOP left', type: 'number', unit: 'mmHg' },
      { name: 'rxRight', label: 'Refraction right (sph/cyl/axis)' }, { name: 'rxLeft', label: 'Refraction left (sph/cyl/axis)' }, { name: 'add', label: 'Near add' },
      { name: 'diagnosis', label: 'Diagnosis' }, { name: 'plan', label: 'Plan', type: 'textarea', full: true },
    ], columns: ['vaRight', 'vaLeft', 'diagnosis'] },
  { key: 'mental-health', label: 'Mental health', single: 'mental health assessment', group: 'Specialty clinics', icon: Brain, roles: ['DOCTOR', 'CLINICAL_OFFICER'], patient: true, visit: true,
    subtitle: 'PHQ-9 and GAD-7 screening, risk and care plans. Restricted access.', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED'], active: ['OPEN', 'IN_PROGRESS'],
    titleLabel: 'Reason for assessment', empty: 'Assessments here are visible only to doctors and clinical officers.',
    fields: [
      { name: 'phq9', label: 'PHQ-9 score', type: 'number', hint: '0-27' }, { name: 'gad7', label: 'GAD-7 score', type: 'number', hint: '0-21' },
      { name: 'risk', label: 'Suicide / self-harm risk', type: 'select', options: ['None identified', 'Low', 'Moderate', 'High'] },
      { name: 'diagnosis', label: 'Working diagnosis' }, { name: 'plan', label: 'Care plan', type: 'textarea', full: true }, { name: 'nextReview', label: 'Next review', type: 'date' },
    ], columns: ['phq9', 'gad7', 'risk'] },
  { key: 'physio', label: 'Physiotherapy', single: 'physiotherapy session', group: 'Specialty clinics', icon: PersonStanding, roles: CLIN, patient: true, visit: true,
    subtitle: 'Therapy plans and sessions, including occupational therapy.', statuses: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'], active: ['SCHEDULED', 'IN_PROGRESS'], chargeCategory: 'PROCEDURE',
    titleLabel: 'Condition treated', empty: 'Schedule and record therapy sessions.',
    fields: [
      { name: 'therapy', label: 'Therapy', type: 'select', options: ['Physiotherapy', 'Occupational therapy', 'Speech therapy'] }, { name: 'sessionAt', label: 'Session time', type: 'datetime-local' },
      { name: 'sessionNo', label: 'Session number', type: 'number' }, { name: 'painBefore', label: 'Pain before (0-10)', type: 'number' }, { name: 'painAfter', label: 'Pain after (0-10)', type: 'number' },
      { name: 'treatment', label: 'Treatment given', type: 'textarea', full: true }, { name: 'homeProgramme', label: 'Home programme', type: 'textarea', full: true },
    ], columns: ['therapy', 'sessionAt', 'sessionNo'] },
  { key: 'nutrition', label: 'Nutrition', single: 'nutrition assessment', group: 'Specialty clinics', icon: Apple, roles: CLIN, patient: true, visit: true,
    subtitle: 'MUAC, weight-for-height and feeding plans.', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED'], active: ['OPEN', 'IN_PROGRESS'],
    titleLabel: 'Reason', empty: 'Record nutrition assessments and therapeutic feeding.',
    fields: [
      { name: 'muac', label: 'MUAC', type: 'number', unit: 'cm' }, { name: 'weight', label: 'Weight', type: 'number', unit: 'kg' }, { name: 'height', label: 'Height', type: 'number', unit: 'cm' },
      { name: 'classification', label: 'Classification', type: 'select', options: ['Normal', 'Moderate acute malnutrition', 'Severe acute malnutrition', 'Overweight', 'Obese'] },
      { name: 'programme', label: 'Programme', type: 'select', options: ['None', 'OTP', 'SFP', 'Inpatient (SC)'] }, { name: 'plan', label: 'Plan', type: 'textarea', full: true },
    ], columns: ['muac', 'classification', 'programme'] },
  { key: 'chronic', label: 'Chronic care', single: 'chronic care enrolment', group: 'Specialty clinics', icon: HeartPulse, roles: CLIN, patient: true,
    subtitle: 'Diabetes, hypertension and other long-term conditions.', statuses: ['ACTIVE', 'DEFAULTED', 'TRANSFERRED', 'CLOSED'], active: ['ACTIVE'],
    titleLabel: 'Condition', empty: 'Enrol patients with long-term conditions to track follow-ups and defaulters.',
    fields: [
      { name: 'condition', label: 'Programme', type: 'select', options: ['Diabetes', 'Hypertension', 'Diabetes and hypertension', 'Asthma / COPD', 'Epilepsy', 'Sickle cell', 'Chronic kidney disease', 'Other'] },
      { name: 'enrolledOn', label: 'Enrolled on', type: 'date' }, { name: 'lastBp', label: 'Last BP', hint: 'For example 130/85' }, { name: 'lastHba1c', label: 'Last HbA1c', type: 'number', unit: '%' },
      { name: 'regimen', label: 'Current medication', type: 'textarea', full: true }, { name: 'nextAppointment', label: 'Next appointment', type: 'date' },
      { name: 'controlled', label: 'At target (BP <140/90, HbA1c <7%)', readOnly: true },
    ], columns: ['condition', 'lastBp', 'controlled', 'nextAppointment'] },
  { key: 'oncology', label: 'Oncology', single: 'chemotherapy cycle', group: 'Specialty clinics', icon: Ribbon, roles: ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'PHARMACIST'], patient: true, visit: true,
    subtitle: 'Chemotherapy protocols, cycles and toxicity checks.', statuses: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'HELD', 'CANCELLED'], active: ['PLANNED', 'IN_PROGRESS', 'HELD'], chargeCategory: 'PROCEDURE',
    titleLabel: 'Diagnosis', empty: 'Plan and record chemotherapy cycles.',
    fields: [
      { name: 'protocol', label: 'Protocol', hint: 'For example AC-T' }, { name: 'cycle', label: 'Cycle', type: 'number' }, { name: 'of', label: 'Of cycles', type: 'number' },
      { name: 'dueOn', label: 'Due on', type: 'date' }, { name: 'heightCm', label: 'Height', type: 'number', unit: 'cm' }, { name: 'weightKg', label: 'Weight', type: 'number', unit: 'kg' },
      { name: 'bsa', label: 'Body surface area (Mosteller)', type: 'number', unit: 'm²', readOnly: true },
      { name: 'labsOk', label: 'Pre-chemo labs acceptable', type: 'select', options: YESNO }, { name: 'toxicity', label: 'Toxicity / side effects', type: 'textarea', full: true },
    ], columns: ['protocol', 'cycle', 'dueOn'] },

  // ---------------------------------------------------------------- Programmes
  { key: 'hiv', label: 'HIV care', single: 'HIV care enrolment', group: 'Programmes', icon: ShieldPlus, roles: CLIN, patient: true,
    subtitle: 'HTS, ART, viral load and PMTCT follow-up.', statuses: ['ACTIVE', 'DEFAULTED', 'TRANSFERRED', 'DECEASED', 'CLOSED'], active: ['ACTIVE'],
    titleLabel: 'CCC number', empty: 'Enrol clients on ART to track refills, viral load and defaulters.',
    fields: [
      { name: 'enrolledOn', label: 'Enrolled on', type: 'date' }, { name: 'artStart', label: 'ART start', type: 'date' }, { name: 'regimen', label: 'Regimen', hint: 'For example TDF/3TC/DTG' },
      { name: 'lastVl', label: 'Last viral load', type: 'number', unit: 'copies/ml' }, { name: 'lastVlDate', label: 'Viral load date', type: 'date' },
      { name: 'pmtct', label: 'PMTCT', type: 'select', options: ['Not applicable', 'Pregnant', 'Breastfeeding'] }, { name: 'nextRefill', label: 'Next refill', type: 'date' },
      { name: 'vlSuppressed', label: 'Virally suppressed (<1000)', readOnly: true }, { name: 'vlCategory', label: 'Viral load category', readOnly: true }, { name: 'tracing', label: 'Refill tracing', readOnly: true },
    ], columns: ['regimen', 'lastVl', 'vlSuppressed', 'nextRefill'] },
  { key: 'tb', label: 'TB register', single: 'TB case', group: 'Programmes', icon: Microscope, roles: CLIN, patient: true,
    subtitle: 'Case register, treatment phases and DOT.', statuses: ['ACTIVE', 'COMPLETED', 'CURED', 'FAILED', 'DEFAULTED', 'DECEASED'], active: ['ACTIVE'],
    titleLabel: 'TB number', empty: 'Register TB cases and follow treatment outcomes.',
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Pulmonary, bacteriologically confirmed', 'Pulmonary, clinically diagnosed', 'Extra-pulmonary'] },
      { name: 'category', label: 'Category', type: 'select', options: ['New', 'Relapse', 'Treatment after failure', 'Treatment after loss to follow-up', 'Transfer in'] },
      { name: 'startedOn', label: 'Treatment start', type: 'date' }, { name: 'phase', label: 'Phase', type: 'select', options: ['Intensive', 'Continuation'] },
      { name: 'hivStatus', label: 'HIV status', type: 'select', options: ['Negative', 'Positive', 'Unknown'] }, { name: 'dotSupporter', label: 'DOT supporter' },
      { name: 'treatmentEndsOn', label: 'Treatment ends (6 months)', type: 'date', readOnly: true },
    ], columns: ['type', 'phase', 'startedOn'] },
  { key: 'family-planning', label: 'Family planning', single: 'family planning client', group: 'Programmes', icon: HeartHandshake, roles: CLIN, patient: true,
    subtitle: 'Methods, refills and removals.', statuses: ['ACTIVE', 'DUE', 'CLOSED'], active: ['ACTIVE', 'DUE'],
    titleLabel: 'Client type', empty: 'Record family planning methods and return dates.',
    fields: [
      { name: 'method', label: 'Method', type: 'select', options: ['Pills (COC)', 'Pills (POP)', 'Injectable (DMPA)', 'Implant', 'IUCD', 'Condoms', 'Tubal ligation', 'Vasectomy', 'Natural methods'] },
      { name: 'givenOn', label: 'Given on', type: 'date' }, { name: 'returnOn', label: 'Return date', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ], columns: ['method', 'givenOn', 'returnOn'] },
  { key: 'immunisation', label: 'Immunisation', single: 'vaccination', group: 'Programmes', icon: Syringe, roles: CLIN, patient: true, visit: true,
    subtitle: 'KEPI doses given and due, with defaulter tracing.', statuses: ['DUE', 'ADMINISTERED', 'MISSED', 'DEFAULTED'], active: ['DUE', 'MISSED'],
    titleLabel: 'Vaccine', empty: 'Record doses and due dates. Missed doses show up for defaulter tracing.',
    fields: [
      { name: 'vaccine', label: 'Antigen', type: 'select', options: ['BCG', 'OPV 0', 'OPV 1', 'OPV 2', 'OPV 3', 'IPV', 'Penta 1', 'Penta 2', 'Penta 3', 'PCV 1', 'PCV 2', 'PCV 3', 'Rota 1', 'Rota 2', 'Measles-Rubella 1', 'Measles-Rubella 2', 'Yellow fever', 'HPV', 'Tetanus-diphtheria', 'Other'] },
      { name: 'dueOn', label: 'Due on', type: 'date' }, { name: 'givenOn', label: 'Given on', type: 'date' }, { name: 'batch', label: 'Batch number' }, { name: 'site', label: 'Site', type: 'select', options: ['Left arm', 'Right arm', 'Left thigh', 'Right thigh', 'Oral'] },
    ], columns: ['vaccine', 'dueOn', 'givenOn'] },
  { key: 'surveillance', label: 'Disease surveillance', single: 'notifiable disease alert', group: 'Programmes', icon: Biohazard, roles: [...CLIN, 'MANAGER'],
    subtitle: 'IDSR notifiable disease alerts sent to the county.', statuses: ['OPEN', 'SENT', 'CLOSED'], active: ['OPEN'],
    titleLabel: 'Disease', empty: 'Raise alerts for notifiable diseases and record when they were sent.',
    fields: [
      { name: 'cases', label: 'Cases', type: 'number' }, { name: 'deaths', label: 'Deaths', type: 'number' }, { name: 'onset', label: 'Onset date', type: 'date' },
      { name: 'location', label: 'Village / ward' }, { name: 'sentTo', label: 'Sent to (county officer)' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ], columns: ['cases', 'deaths', 'location'] },

  // ---------------------------------------------------------------- Clinical support
  { key: 'blood-donors', label: 'Blood donors', single: 'donor', group: 'Blood bank', icon: HandHeart, roles: ['LAB_TECH', 'DOCTOR', 'NURSE'],
    subtitle: 'Donor register, screening and deferrals.', statuses: ['ACTIVE', 'DEFERRED', 'INACTIVE'], active: ['ACTIVE'],
    titleLabel: 'Donor name', empty: 'Register donors and their screening results.',
    fields: [
      { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'idNumber', label: 'ID number' }, { name: 'bloodGroup', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { name: 'lastDonation', label: 'Last donation', type: 'date' }, { name: 'hb', label: 'Haemoglobin', type: 'number', unit: 'g/dl' }, { name: 'deferralReason', label: 'Deferral reason' },
      { name: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] }, { name: 'weightKg', label: 'Weight', type: 'number', unit: 'kg' },
      { name: 'eligible', label: 'Eligible to donate', readOnly: true }, { name: 'nextEligibleOn', label: 'Next eligible on', type: 'date', readOnly: true }, { name: 'eligibilityNotes', label: 'Eligibility notes', readOnly: true, full: true },
    ], columns: ['bloodGroup', 'eligible', 'lastDonation', 'phone'] },
  { key: 'blood-units', label: 'Blood units', single: 'blood unit', group: 'Blood bank', icon: Droplet, roles: ['LAB_TECH', 'DOCTOR', 'NURSE'],
    subtitle: 'Inventory of units by group, component and expiry.', statuses: ['QUARANTINE', 'AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED'], active: ['AVAILABLE'],
    titleLabel: 'Unit / bag number', empty: 'Add units as they are collected or received from the regional centre.',
    fields: [
      { name: 'bloodGroup', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], required: true },
      { name: 'component', label: 'Component', type: 'select', options: ['Whole blood', 'Packed red cells', 'Platelets', 'Fresh frozen plasma', 'Cryoprecipitate'] },
      { name: 'volume', label: 'Volume', type: 'number', unit: 'ml' }, { name: 'collectedOn', label: 'Collected on', type: 'date' }, { name: 'expiresOn', label: 'Expires on', type: 'date' },
      { name: 'source', label: 'Source', type: 'select', options: ['In-house donation', 'KNBTS regional centre', 'Other facility'] }, { name: 'screening', label: 'TTI screening', type: 'select', options: ['Pending', 'Non-reactive', 'Reactive'] },
    ], columns: ['bloodGroup', 'component', 'expiresOn'] },
  { key: 'transfusions', label: 'Transfusions', single: 'transfusion', group: 'Blood bank', icon: HeartPulse, roles: ['LAB_TECH', 'DOCTOR', 'NURSE', 'CLINICAL_OFFICER'], patient: true, visit: true,
    subtitle: 'Requests, crossmatch, issue and reactions.', statuses: ['REQUESTED', 'CROSSMATCHED', 'ISSUED', 'COMPLETED', 'REACTION', 'CANCELLED'], active: ['REQUESTED', 'CROSSMATCHED', 'ISSUED'], chargeCategory: 'LAB',
    titleLabel: 'Indication', empty: 'Track transfusion requests from crossmatch to completion.',
    fields: [
      { name: 'patientGroup', label: 'Patient blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Pending'] },
      { name: 'component', label: 'Component', type: 'select', options: ['Whole blood', 'Packed red cells', 'Platelets', 'Fresh frozen plasma', 'Cryoprecipitate'] },
      { name: 'units', label: 'Units', type: 'number' }, { name: 'unitNumbers', label: 'Unit numbers issued' }, { name: 'startedAt', label: 'Started', type: 'datetime-local' },
      { name: 'reaction', label: 'Reaction', type: 'select', options: ['None', 'Febrile', 'Allergic', 'Haemolytic', 'TACO', 'Other'] }, { name: 'notes', label: 'Notes', type: 'textarea', full: true },
      { name: 'crossmatchResult', label: 'Crossmatch (ABO/Rh check)', readOnly: true, full: true, hint: 'Checked when the status moves to crossmatched or issued' },
    ], columns: ['component', 'units', 'reaction'] },
  { key: 'mortuary', label: 'Mortuary', single: 'body admission', group: 'Support services', icon: Skull, roles: ['NURSE', 'DOCTOR', 'MANAGER', 'CASHIER', 'RECEPTION'],
    subtitle: 'Body admission, storage, post-mortem and release.', statuses: ['ADMITTED', 'POST_MORTEM', 'READY', 'RELEASED'], active: ['ADMITTED', 'POST_MORTEM', 'READY'], chargeCategory: 'OTHER',
    titleLabel: 'Name of deceased', empty: 'Admit bodies, track storage days and release with burial permit details.',
    fields: [
      { name: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female', 'Unknown'] }, { name: 'age', label: 'Age', type: 'number' }, { name: 'dateOfDeath', label: 'Date of death', type: 'datetime-local' },
      { name: 'source', label: 'Brought from', type: 'select', options: ['This facility (ward)', 'Brought in dead', 'Police case', 'Other facility'] }, { name: 'compartment', label: 'Compartment / tray' },
      { name: 'nextOfKin', label: 'Next of kin' }, { name: 'nokPhone', label: 'Next of kin phone', type: 'tel' }, { name: 'burialPermit', label: 'Burial permit number' },
      { name: 'releasedTo', label: 'Released to' }, { name: 'releasedOn', label: 'Released on', type: 'date' },
      { name: 'storageDays', label: 'Storage days', type: 'number', readOnly: true },
    ], columns: ['dateOfDeath', 'compartment', 'storageDays', 'nextOfKin'] },
  { key: 'cssd', label: 'CSSD', single: 'instrument set', group: 'Support services', icon: Sparkles, roles: ['NURSE', 'STOREKEEPER', 'MANAGER'],
    subtitle: 'Instrument sets through washing, sterilisation and issue.', statuses: ['RECEIVED', 'WASHING', 'STERILISING', 'STERILE', 'ISSUED', 'FAILED'], active: ['RECEIVED', 'WASHING', 'STERILISING'],
    titleLabel: 'Set name', empty: 'Track each instrument set to the patient it was used on.',
    fields: [
      { name: 'from', label: 'From department' }, { name: 'cycle', label: 'Autoclave cycle number' }, { name: 'method', label: 'Method', type: 'select', options: ['Steam autoclave', 'Ethylene oxide', 'Plasma', 'Chemical'] },
      { name: 'indicator', label: 'Indicator result', type: 'select', options: ['Pending', 'Pass', 'Fail'] }, { name: 'expiresOn', label: 'Sterile until', type: 'date' }, { name: 'issuedTo', label: 'Issued to (theatre / ward)' },
    ], columns: ['cycle', 'indicator', 'issuedTo'] },
  { key: 'ambulance', label: 'Ambulance', single: 'trip', group: 'Support services', icon: Ambulance, roles: ['NURSE', 'DOCTOR', 'RECEPTION', 'MANAGER'],
    subtitle: 'Dispatch, trip logs and billing.', statuses: ['REQUESTED', 'DISPATCHED', 'ON_SCENE', 'TRANSPORTING', 'COMPLETED', 'CANCELLED'], active: ['REQUESTED', 'DISPATCHED', 'ON_SCENE', 'TRANSPORTING'], chargeCategory: 'OTHER',
    titleLabel: 'Pick-up location', empty: 'Log each call and trip from dispatch to hand-over.',
    fields: [
      { name: 'caller', label: 'Caller' }, { name: 'callerPhone', label: 'Caller phone', type: 'tel' }, { name: 'destination', label: 'Destination' },
      { name: 'vehicle', label: 'Vehicle registration' }, { name: 'crew', label: 'Crew' }, { name: 'priority', label: 'Priority', type: 'select', options: ['Emergency', 'Urgent', 'Routine transfer'] },
      { name: 'kmOut', label: 'Odometer out', type: 'number' }, { name: 'kmIn', label: 'Odometer in', type: 'number' }, { name: 'mileageKm', label: 'Trip distance', type: 'number', unit: 'km', readOnly: true }, { name: 'handover', label: 'Hand-over notes', type: 'textarea', full: true },
    ], columns: ['priority', 'vehicle', 'destination'] },
  { key: 'diet', label: 'Kitchen & diet', single: 'diet order', group: 'Support services', icon: Soup, roles: [...NURSE, 'MANAGER'], patient: true, visit: true,
    subtitle: 'Diet orders from the wards to the kitchen.', statuses: ['ORDERED', 'PREPARING', 'SERVED', 'CANCELLED'], active: ['ORDERED', 'PREPARING'],
    titleLabel: 'Ward / bed', empty: 'Wards order meals here and the kitchen marks them served.',
    fields: [
      { name: 'diet', label: 'Diet', type: 'select', options: ['Normal', 'Soft', 'Liquid', 'Diabetic', 'Low salt', 'Renal', 'High protein', 'Nil by mouth'] },
      { name: 'meal', label: 'Meal', type: 'select', options: ['Breakfast', 'Lunch', 'Supper', 'All meals'] }, { name: 'forDate', label: 'For date', type: 'date' }, { name: 'allergies', label: 'Food allergies' },
    ], columns: ['diet', 'meal', 'forDate'] },
  { key: 'housekeeping', label: 'Housekeeping', single: 'cleaning task', group: 'Support services', icon: Sparkles, roles: ['NURSE', 'MANAGER', 'STOREKEEPER'],
    subtitle: 'Bed cleaning, laundry and area cleaning.', statuses: ['OPEN', 'IN_PROGRESS', 'DONE'], active: ['OPEN', 'IN_PROGRESS'],
    titleLabel: 'Area / bed', empty: 'Raise cleaning and laundry tasks and mark them done.',
    fields: [{ name: 'task', label: 'Task', type: 'select', options: ['Terminal clean (bed)', 'Routine clean', 'Spill', 'Laundry pick-up', 'Laundry delivery'] }, { name: 'assignedTo', label: 'Assigned to' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
    columns: ['task', 'assignedTo'] },

  // ---------------------------------------------------------------- Care coordination and documents
  { key: 'referrals', label: 'Referrals', single: 'referral', group: 'Records & documents', icon: Send, roles: CLIN, patient: true, visit: true,
    subtitle: 'Referrals in and out, with a printable letter.', statuses: ['DRAFT', 'SENT', 'ACCEPTED', 'COMPLETED', 'REJECTED'], active: ['DRAFT', 'SENT'],
    titleLabel: 'Reason for referral', empty: 'Create referral letters and track the reply.',
    fields: [
      { name: 'direction', label: 'Direction', type: 'select', options: ['Out', 'In'], required: true }, { name: 'facility', label: 'Facility', required: true }, { name: 'specialty', label: 'Department / specialty' },
      { name: 'urgency', label: 'Urgency', type: 'select', options: ['Emergency', 'Urgent', 'Routine'] }, { name: 'summary', label: 'Clinical summary', type: 'textarea', full: true }, { name: 'treatmentGiven', label: 'Treatment given', type: 'textarea', full: true },
    ], columns: ['direction', 'facility', 'urgency'] },
  { key: 'certificates', label: 'Medical certificates', single: 'certificate', group: 'Records & documents', icon: FileSignature, roles: ['DOCTOR', 'CLINICAL_OFFICER'], patient: true, visit: true,
    subtitle: 'Sick notes, fitness and medical reports.', statuses: ['DRAFT', 'ISSUED', 'VOID'], active: ['DRAFT'],
    titleLabel: 'Purpose', empty: 'Issue sick notes and certificates that print on your letterhead.',
    fields: [
      { name: 'kind', label: 'Type', type: 'select', options: ['Sick off', 'Light duty', 'Fitness to work', 'Medical report', 'Other'], required: true },
      { name: 'fromDate', label: 'From', type: 'date' }, { name: 'toDate', label: 'To', type: 'date' }, { name: 'text', label: 'Certificate text', type: 'textarea', full: true },
    ], columns: ['kind', 'fromDate', 'toDate'] },
  { key: 'death-notices', label: 'Death notifications', single: 'death notification', group: 'Records & documents', icon: FileWarning, roles: ['DOCTOR', 'CLINICAL_OFFICER', 'MANAGER'],
    subtitle: 'Cause of death certification for CRVS.', statuses: ['DRAFT', 'CERTIFIED', 'SENT'], active: ['DRAFT', 'CERTIFIED'],
    titleLabel: 'Name of deceased', empty: 'Certify causes of death and record when they were sent to CRVS.',
    fields: [
      { name: 'dateOfDeath', label: 'Date and time of death', type: 'datetime-local', required: true }, { name: 'placeOfDeath', label: 'Place of death' },
      { name: 'immediateCause', label: 'Immediate cause', full: true }, { name: 'underlyingCause', label: 'Underlying cause', full: true }, { name: 'manner', label: 'Manner', type: 'select', options: ['Natural', 'Accident', 'Suicide', 'Homicide', 'Pending investigation'] },
    ], columns: ['dateOfDeath', 'manner'] },

  // ---------------------------------------------------------------- Quality and operations
  { key: 'adr', label: 'Adverse drug reactions', single: 'ADR report', group: 'Quality & operations', icon: FileHeart, roles: ['PHARMACIST', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE'], patient: true,
    subtitle: 'Pharmacovigilance reports for PPB (PvERS).', statuses: ['OPEN', 'SENT', 'CLOSED'], active: ['OPEN'],
    titleLabel: 'Suspected medicine', empty: 'Report suspected adverse drug reactions.',
    fields: [
      { name: 'reaction', label: 'Reaction', type: 'textarea', full: true, required: true }, { name: 'onset', label: 'Onset', type: 'date' },
      { name: 'severity', label: 'Severity', type: 'select', options: ['Mild', 'Moderate', 'Severe', 'Fatal'] }, { name: 'action', label: 'Action taken', type: 'select', options: ['Drug withdrawn', 'Dose reduced', 'Dose unchanged', 'Unknown'] },
      { name: 'outcome', label: 'Outcome', type: 'select', options: ['Recovered', 'Recovering', 'Not recovered', 'Fatal', 'Unknown'] }, { name: 'pversRef', label: 'PvERS reference' },
    ], columns: ['severity', 'outcome'] },
  { key: 'infection-control', label: 'Infection control', single: 'IPC event', group: 'Quality & operations', icon: Biohazard, roles: [...NURSE, 'MANAGER'],
    subtitle: 'Healthcare-associated infections and IPC audits.', statuses: ['OPEN', 'INVESTIGATING', 'CLOSED'], active: ['OPEN', 'INVESTIGATING'],
    titleLabel: 'Event', empty: 'Log infections and IPC findings for follow-up.',
    fields: [{ name: 'kind', label: 'Type', type: 'select', options: ['Surgical site infection', 'CAUTI', 'CLABSI', 'VAP', 'Needle-stick injury', 'Hand hygiene audit', 'Other'] }, { name: 'ward', label: 'Ward / unit' }, { name: 'findings', label: 'Findings', type: 'textarea', full: true }, { name: 'actions', label: 'Actions', type: 'textarea', full: true }],
    columns: ['kind', 'ward'] },
  { key: 'clinical-audits', label: 'Clinical audits', single: 'audit', group: 'Quality & operations', icon: BadgeCheck, roles: ['MANAGER', 'DOCTOR'],
    subtitle: 'Clinical audits, M&M reviews and accreditation checklists.', statuses: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'], active: ['PLANNED', 'IN_PROGRESS'],
    titleLabel: 'Audit topic', empty: 'Plan audits and record findings and actions.',
    fields: [{ name: 'kind', label: 'Type', type: 'select', options: ['Clinical audit', 'Mortality and morbidity review', 'Accreditation (SafeCare / KENAS / JCI)', 'Policy review'] }, { name: 'dueOn', label: 'Due on', type: 'date' }, { name: 'lead', label: 'Lead' }, { name: 'findings', label: 'Findings', type: 'textarea', full: true }, { name: 'actions', label: 'Actions', type: 'textarea', full: true }],
    columns: ['kind', 'dueOn', 'lead'] },
  { key: 'work-orders', label: 'Maintenance', single: 'work order', group: 'Quality & operations', icon: Wrench, roles: ['MANAGER', 'STOREKEEPER', 'ACCOUNTANT'],
    subtitle: 'Work orders, preventive maintenance and calibration.', statuses: ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'DONE'], active: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'],
    titleLabel: 'Equipment / area', empty: 'Raise repairs and planned maintenance, including biomedical calibration.',
    fields: [{ name: 'kind', label: 'Type', type: 'select', options: ['Breakdown repair', 'Preventive maintenance', 'Calibration', 'Installation'] }, { name: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] }, { name: 'assignedTo', label: 'Technician / vendor' }, { name: 'downtimeHours', label: 'Downtime', type: 'number', unit: 'hours' }, { name: 'cost', label: 'Cost', type: 'number', unit: 'KES' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
    columns: ['kind', 'priority', 'assignedTo'] },
  { key: 'training', label: 'Training & CPD', single: 'training record', group: 'Quality & operations', icon: GraduationCap, roles: ['HR', 'MANAGER'],
    subtitle: 'Staff training, CPD points and licence renewals.', statuses: ['PLANNED', 'COMPLETED', 'EXPIRED'], active: ['PLANNED'],
    titleLabel: 'Course / licence', empty: 'Track training, CPD points and licence expiry dates.',
    fields: [{ name: 'staff', label: 'Staff member', required: true }, { name: 'provider', label: 'Provider / council' }, { name: 'date', label: 'Date', type: 'date' }, { name: 'points', label: 'CPD points', type: 'number' }, { name: 'expiresOn', label: 'Expires on', type: 'date' }],
    columns: ['staff', 'points', 'expiresOn'] },
];

export const REGISTER_BY_KEY = Object.fromEntries(REGISTERS.map((r) => [r.key, r]));
export const REGISTER_GROUPS = [...new Set(REGISTERS.map((r) => r.group))];
export { Baby };
