/**
 * Clinical rules layered on the generic register engine (ModuleRecord). Each register keeps its free-form `data`;
 * these rules validate status changes and fill calculated fields (marked read-only in apps/web/src/lib/registers.ts).
 * Pure functions: database look-ups (e.g. crossmatch against blood-unit records) happen in RegistersService.
 */
import { donorEligibility, expiryFor, isCompatible, parseGroup } from './rules/bloodbank.rules';
import { tracingCategory, vlCategory } from './rules/programmes.rules';
import { bsaMosteller } from './rules/oncology.rules';
import { totalStorageDays } from './rules/mortuary.rules';
import { tripMileage } from './rules/ems.rules';
import { FP_REVISIT_DAYS, ncdControlled } from './rules/clinics.rules';

export type Data = Record<string, any>;
export interface RuleResult { data: Data; status?: string; errors: string[] }

/** Register component labels → blood bank component codes. */
export const COMPONENT_CODE: Record<string, string> = {
  'Whole blood': 'WHOLE_BLOOD', 'Packed red cells': 'PRBC', Platelets: 'PLATELETS', 'Fresh frozen plasma': 'FFP', Cryoprecipitate: 'CRYO',
};
const FP_METHOD: Record<string, string> = {
  'Pills (COC)': 'PILLS_COC', 'Pills (POP)': 'PILLS_POP', 'Injectable (DMPA)': 'INJECTABLE', Implant: 'IMPLANT', IUCD: 'IUCD', Condoms: 'CONDOMS', 'Natural methods': 'NATURAL',
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));
const date = (v: unknown) => { if (!v) return undefined; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? undefined : d; };
const startOfToday = (now: Date) => { const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d; };

/** Validate and enrich a record about to be saved. `data` is the merged record data, `status` the resulting status. */
export function applyRegisterRules(module: string, status: string, input: Data, now = new Date(), createdAt = now): RuleResult {
  const data: Data = { ...input };
  const errors: string[] = [];
  let nextStatus: string | undefined;

  switch (module) {
    case 'blood-units': {
      const comp = COMPONENT_CODE[data.component];
      const collected = date(data.collectedOn);
      if (comp && collected && !data.expiresOn) data.expiresOn = ymd(expiryFor(comp, collected));
      if (['AVAILABLE', 'RESERVED', 'ISSUED'].includes(status) && data.screening !== 'Non-reactive') errors.push('A unit can only be released once TTI screening is non-reactive');
      if (data.screening === 'Reactive' && status !== 'DISCARDED') nextStatus = 'DISCARDED';
      const exp = date(data.expiresOn);
      if (exp && exp < startOfToday(now) && ['AVAILABLE', 'RESERVED'].includes(status)) nextStatus = 'EXPIRED';
      break;
    }
    case 'blood-donors': {
      const r = donorEligibility({ weightKg: num(data.weightKg), hbGdl: num(data.hb), lastDonationAt: date(data.lastDonation), sex: data.sex === 'Female' ? 'FEMALE' : 'MALE' }, now);
      data.eligible = r.eligible ? 'Yes' : 'No';
      data.eligibilityNotes = r.reasons.join('; ') || null;
      data.nextEligibleOn = r.deferredUntil ? ymd(r.deferredUntil) : null;
      break;
    }
    case 'hiv': {
      const vl = num(data.lastVl);
      if (vl !== undefined) {
        if (vl < 0) errors.push('Viral load cannot be negative');
        else { const c = vlCategory(vl); data.vlCategory = c; data.vlSuppressed = c === 'UNSUPPRESSED' ? 'No' : 'Yes'; }
      }
      const refill = date(data.nextRefill);
      if (refill) data.tracing = tracingCategory(Math.floor((startOfToday(now).getTime() - refill.getTime()) / 86400000));
      break;
    }
    case 'tb': {
      const start = date(data.startedOn);
      if (start) {
        const days = (now.getTime() - start.getTime()) / 86400000;
        data.phase = days < 56 ? 'Intensive' : 'Continuation';
        data.treatmentEndsOn = ymd(new Date(start.getTime() + 168 * 86400000));
      }
      break;
    }
    case 'oncology': {
      const h = num(data.heightCm), w = num(data.weightKg);
      if (h !== undefined && w !== undefined) {
        try { data.bsa = bsaMosteller(h, w); } catch (e) { errors.push((e as Error).message); }
      }
      if (status === 'IN_PROGRESS' && data.labsOk === 'No') errors.push('Pre-chemotherapy labs are not acceptable: hold the cycle instead');
      break;
    }
    case 'chronic': {
      const m = String(data.lastBp ?? '').match(/^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/);
      const cond = String(data.condition ?? '');
      const code = `${/hypertension/i.test(cond) ? 'HTN' : ''}${/diabetes/i.test(cond) ? '_DM' : ''}`;
      const c = ncdControlled(code, { systolic: m ? Number(m[1]) : null, diastolic: m ? Number(m[2]) : null, hba1c: num(data.lastHba1c) ?? null });
      data.controlled = c === null ? null : c ? 'Yes' : 'No';
      break;
    }
    case 'family-planning': {
      const given = date(data.givenOn); const days = FP_METHOD[data.method] ? FP_REVISIT_DAYS[FP_METHOD[data.method]] : undefined;
      if (given && days && !data.returnOn) data.returnOn = ymd(new Date(given.getTime() + days * 86400000));
      break;
    }
    case 'cssd': {
      if (data.indicator === 'Fail' && status !== 'FAILED') nextStatus = 'FAILED';
      if (['STERILE', 'ISSUED'].includes(status) && data.indicator !== 'Pass' && data.indicator !== 'Fail') errors.push('Record a passing sterilisation indicator before releasing the set');
      const exp = date(data.expiresOn);
      if (status === 'ISSUED' && exp && exp < startOfToday(now)) errors.push('Sterility has expired: reprocess the set');
      break;
    }
    case 'ambulance': {
      try { const km = tripMileage(num(data.kmOut), num(data.kmIn)); data.mileageKm = km || null; } catch (e) { errors.push((e as Error).message); }
      break;
    }
    case 'mortuary': {
      const until = status === 'RELEASED' ? date(data.releasedOn) ?? now : now;
      data.storageDays = totalStorageDays(createdAt, until);
      if (status === 'RELEASED' && !data.burialPermit) errors.push('Enter the burial permit number before release');
      break;
    }
  }
  return { data, status: nextStatus, errors };
}

/** Crossmatch the requested units (blood-unit records) against the recipient group. */
export function crossmatch(patientGroup: string | undefined, component: string | undefined, units: { number: string; status: string; data: Data }[], now = new Date()) {
  const recipient = parseGroup(patientGroup);
  if (!recipient) return { errors: ['Record the patient blood group before crossmatch'], results: [] };
  const errors: string[] = [];
  const results = units.map((u) => {
    const g = parseGroup(u.data.bloodGroup);
    const comp = COMPONENT_CODE[u.data.component] ?? COMPONENT_CODE[component ?? ''] ?? 'PRBC';
    const exp = date(u.data.expiresOn);
    let reason: string | undefined;
    if (!g) reason = 'unit has no blood group';
    else if (!['AVAILABLE', 'RESERVED', 'ISSUED'].includes(u.status)) reason = `unit is ${u.status.toLowerCase()}`;
    else if (exp && exp < startOfToday(now)) reason = 'unit has expired';
    else { const c = isCompatible(recipient, { ...g, component: comp }); if (!c.compatible) reason = c.reason; }
    if (reason) errors.push(`${u.number}: ${reason}`);
    return { unit: u.number, group: u.data.bloodGroup ?? null, component: comp, compatible: !reason, reason: reason ?? null };
  });
  return { errors, results };
}
