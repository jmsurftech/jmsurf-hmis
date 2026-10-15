/**
 * Server side of the register catalogue: which modules exist, their number prefix, allowed statuses and who may use them.
 * Field layouts live in the web app (apps/web/src/lib/registers.ts); keep the keys in step.
 */
export interface RegisterDef { prefix: string; statuses: string[]; roles: string[]; patient?: boolean }

const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'TRIAGE_NURSE'];
const NURSE = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER'];

export const REGISTERS: Record<string, RegisterDef> = {
  // Specialty clinics (BUILD_PLAN 6.3)
  dental: { prefix: 'DEN', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], roles: CLIN, patient: true },
  eye: { prefix: 'EYE', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], roles: CLIN, patient: true },
  'mental-health': { prefix: 'MH', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED'], roles: ['DOCTOR', 'CLINICAL_OFFICER'], patient: true },
  physio: { prefix: 'PHY', statuses: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'], roles: CLIN, patient: true },
  nutrition: { prefix: 'NUT', statuses: ['OPEN', 'IN_PROGRESS', 'COMPLETED'], roles: CLIN, patient: true },
  chronic: { prefix: 'CCC', statuses: ['ACTIVE', 'DEFAULTED', 'TRANSFERRED', 'CLOSED'], roles: CLIN, patient: true },
  oncology: { prefix: 'ONC', statuses: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'HELD', 'CANCELLED'], roles: ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'PHARMACIST'], patient: true },
  // Public health programmes (6.4)
  hiv: { prefix: 'HIV', statuses: ['ACTIVE', 'DEFAULTED', 'TRANSFERRED', 'DECEASED', 'CLOSED'], roles: CLIN, patient: true },
  tb: { prefix: 'TB', statuses: ['ACTIVE', 'COMPLETED', 'CURED', 'FAILED', 'DEFAULTED', 'DECEASED'], roles: CLIN, patient: true },
  'family-planning': { prefix: 'FP', statuses: ['ACTIVE', 'DUE', 'CLOSED'], roles: CLIN, patient: true },
  immunisation: { prefix: 'IMM', statuses: ['DUE', 'ADMINISTERED', 'MISSED', 'DEFAULTED'], roles: CLIN, patient: true },
  surveillance: { prefix: 'IDSR', statuses: ['OPEN', 'SENT', 'CLOSED'], roles: [...CLIN, 'MANAGER'] },
  // Clinical support (6.12)
  'blood-donors': { prefix: 'DNR', statuses: ['ACTIVE', 'DEFERRED', 'INACTIVE'], roles: ['LAB_TECH', 'DOCTOR', 'NURSE'] },
  'blood-units': { prefix: 'BU', statuses: ['QUARANTINE', 'AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED'], roles: ['LAB_TECH', 'DOCTOR', 'NURSE'] },
  transfusions: { prefix: 'TX', statuses: ['REQUESTED', 'CROSSMATCHED', 'ISSUED', 'COMPLETED', 'REACTION', 'CANCELLED'], roles: ['LAB_TECH', 'DOCTOR', 'NURSE', 'CLINICAL_OFFICER'], patient: true },
  mortuary: { prefix: 'MRT', statuses: ['ADMITTED', 'POST_MORTEM', 'READY', 'RELEASED'], roles: ['NURSE', 'DOCTOR', 'MANAGER', 'CASHIER', 'RECEPTION'] },
  cssd: { prefix: 'CSSD', statuses: ['RECEIVED', 'WASHING', 'STERILISING', 'STERILE', 'ISSUED', 'FAILED'], roles: ['NURSE', 'STOREKEEPER', 'MANAGER'] },
  ambulance: { prefix: 'AMB', statuses: ['REQUESTED', 'DISPATCHED', 'ON_SCENE', 'TRANSPORTING', 'COMPLETED', 'CANCELLED'], roles: ['NURSE', 'DOCTOR', 'RECEPTION', 'MANAGER'] },
  diet: { prefix: 'DIET', statuses: ['ORDERED', 'PREPARING', 'SERVED', 'CANCELLED'], roles: [...NURSE, 'MANAGER'], patient: true },
  housekeeping: { prefix: 'HK', statuses: ['OPEN', 'IN_PROGRESS', 'DONE'], roles: ['NURSE', 'MANAGER', 'STOREKEEPER'] },
  // Care coordination and documents
  referrals: { prefix: 'REF', statuses: ['DRAFT', 'SENT', 'ACCEPTED', 'COMPLETED', 'REJECTED'], roles: CLIN, patient: true },
  certificates: { prefix: 'CERT', statuses: ['DRAFT', 'ISSUED', 'VOID'], roles: ['DOCTOR', 'CLINICAL_OFFICER'], patient: true },
  'death-notices': { prefix: 'DTH', statuses: ['DRAFT', 'CERTIFIED', 'SENT'], roles: ['DOCTOR', 'CLINICAL_OFFICER', 'MANAGER'] },
  // Pharmacovigilance and governance
  adr: { prefix: 'ADR', statuses: ['OPEN', 'SENT', 'CLOSED'], roles: ['PHARMACIST', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE'], patient: true },
  'infection-control': { prefix: 'IPC', statuses: ['OPEN', 'INVESTIGATING', 'CLOSED'], roles: [...NURSE, 'MANAGER'] },
  'clinical-audits': { prefix: 'AUD', statuses: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'], roles: ['MANAGER', 'DOCTOR'] },
  'work-orders': { prefix: 'WO', statuses: ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'DONE'], roles: ['MANAGER', 'STOREKEEPER', 'ACCOUNTANT'] },
  training: { prefix: 'CPD', statuses: ['PLANNED', 'COMPLETED', 'EXPIRED'], roles: ['HR', 'MANAGER'] },
};
