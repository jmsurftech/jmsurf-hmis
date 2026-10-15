/**
 * Idempotent demo data for clinical support & programmes (roadmap item 5):
 * blood bank, mortuary, CSSD, ambulance, dietetics, rehab, HIV/TB, oncology, FP/NCD.
 * Called from seed.ts. Each section is skipped when its rows already exist.
 */
import { PrismaClient } from '@prisma/client';
import { isCompatible } from '../src/clinical/bloodbank/bloodbank.rules';
import { isSuppressed } from '../src/clinical/programmes/programmes.rules';
import { bsaMosteller, cycleDates, plannedDose, ProtocolDrug } from '../src/clinical/oncology/oncology.rules';
import { ncdControlled } from '../src/clinical/clinics/clinics.rules';

const KES = (n: number) => Math.round(n * 100);
const DAY = 86400000;

const SERVICES: [string, string, string, number][] = [
  ['BB-GROUP', 'Blood grouping & antibody screen', 'LAB', 800], ['BB-XMATCH', 'Crossmatch (per unit)', 'LAB', 1200],
  ['BB-WHOLE_BLOOD', 'Whole blood unit', 'PROCEDURE', 4500], ['BB-PRBC', 'Packed red cells unit', 'PROCEDURE', 5000],
  ['BB-FFP', 'Fresh frozen plasma unit', 'PROCEDURE', 4000], ['BB-PLATELETS', 'Platelet concentrate unit', 'PROCEDURE', 6000],
  ['BB-CRYO', 'Cryoprecipitate unit', 'PROCEDURE', 4000], ['BB-UNIT', 'Blood product unit', 'PROCEDURE', 4500],
  ['MORT-ADMIT', 'Mortuary admission & preparation', 'OTHER', 3000], ['MORT-DAY', 'Mortuary storage (per day)', 'OTHER', 1500],
  ['MORT-PM', 'Post-mortem examination', 'PROCEDURE', 15000],
  ['AMB-BASE', 'Ambulance call-out (base fare)', 'OTHER', 3000], ['AMB-KM', 'Ambulance mileage (per km)', 'OTHER', 120],
  ['PHYSIO-SESSION', 'Physiotherapy session', 'PROCEDURE', 1500], ['OT-SESSION', 'Occupational therapy session', 'PROCEDURE', 1500],
  ['SPEECH-SESSION', 'Speech therapy session', 'PROCEDURE', 1500], ['CHEMO-ADMIN', 'Chemotherapy administration (day care)', 'PROCEDURE', 5000],
];

const PROTOCOLS: { code: string; name: string; indication: string; cycles: number; intervalDays: number; drugs: ProtocolDrug[] }[] = [
  { code: 'AC', name: 'AC (Doxorubicin + Cyclophosphamide)', indication: 'Breast cancer (adjuvant)', cycles: 4, intervalDays: 21, drugs: [
    { drug: 'Doxorubicin', dose: 60, unit: 'mg/m2', route: 'IV', days: [1] }, { drug: 'Cyclophosphamide', dose: 600, unit: 'mg/m2', route: 'IV', days: [1] }] },
  { code: 'CHOP', name: 'CHOP', indication: 'Non-Hodgkin lymphoma', cycles: 6, intervalDays: 21, drugs: [
    { drug: 'Cyclophosphamide', dose: 750, unit: 'mg/m2', route: 'IV', days: [1] }, { drug: 'Doxorubicin', dose: 50, unit: 'mg/m2', route: 'IV', days: [1] },
    { drug: 'Vincristine', dose: 1.4, unit: 'mg/m2', route: 'IV', days: [1], maxDose: 2 }, { drug: 'Prednisolone', dose: 100, unit: 'mg', route: 'PO', days: [1, 2, 3, 4, 5] }] },
  { code: 'CAPOX', name: 'CAPOX (Oxaliplatin + Capecitabine)', indication: 'Colorectal cancer', cycles: 8, intervalDays: 21, drugs: [
    { drug: 'Oxaliplatin', dose: 130, unit: 'mg/m2', route: 'IV', days: [1] }, { drug: 'Capecitabine', dose: 1000, unit: 'mg/m2', route: 'PO BD', days: [1, 14] }] },
];

export async function seedClinical2(prisma: PrismaClient, T: string, F: string) {
  const now = Date.now();
  const seqNo = (p: string, n: number) => `${p}-DEMO-${String(n).padStart(4, '0')}`;
  const svc: Record<string, string> = {};
  for (const [code, name, category, price] of SERVICES) {
    const s = await prisma.serviceItem.upsert({ where: { tenantId_code: { tenantId: T, code } }, update: {}, create: { tenantId: T, code, name, category, basePriceMinor: KES(price) } });
    svc[code] = s.id;
  }
  const patients = await prisma.patient.findMany({ where: { tenantId: T, deceasedAt: null, mergedIntoId: null }, orderBy: { mrn: 'asc' }, take: 40 });
  if (patients.length < 12) { console.log('seed-clinical2: not enough demo patients, skipped'); return; }
  const P = (i: number) => patients[i % patients.length];
  const staff = await prisma.user.findFirst({ where: { tenantId: T, email: { startsWith: 'nurse@' } } });
  const visitFor = async (patientId: string) => (await prisma.visit.findFirst({ where: { tenantId: T, patientId }, orderBy: { startedAt: 'desc' } }))
    ?? prisma.visit.create({ data: { tenantId: T, facilityId: F, patientId, visitNumber: seqNo('V-SUP', Math.floor(now / 1000) % 10000), type: 'OPD' } });

  // ── Blood bank
  if ((await prisma.bloodDonor.count({ where: { tenantId: T } })) === 0) {
    const donors: [string, string, string, string, string][] = [
      ['Peter', 'Kamau', 'MALE', 'O', 'POS'], ['Grace', 'Achieng', 'FEMALE', 'A', 'POS'], ['Samuel', 'Kiprono', 'MALE', 'B', 'POS'],
      ['Faith', 'Njeri', 'FEMALE', 'O', 'NEG'], ['David', 'Mutua', 'MALE', 'AB', 'POS'], ['Mercy', 'Wambui', 'FEMALE', 'A', 'NEG'],
    ];
    let unitN = 0;
    for (const [i, [fn, ln, sex, abo, rh]] of donors.entries()) {
      const donatedAt = new Date(now - (i * 6 + 2) * DAY);
      const d = await prisma.bloodDonor.create({ data: { tenantId: T, donorNumber: seqNo('BD', i + 1), firstName: fn, lastName: ln, sex, abo, rh, phone: `+2547120000${10 + i}`, dateOfBirth: new Date(Date.UTC(1985 + i, i, 10)), lastDonationAt: donatedAt } });
      const tti = { hiv: 'NEG', hbv: 'NEG', hcv: 'NEG', syphilis: 'NEG', malaria: 'NEG' };
      const don = await prisma.bloodDonation.create({ data: { tenantId: T, donorId: d.id, donatedAt, volumeMl: 450, hbGdl: 13.5 + i * 0.3, ttiResults: tti, ttiStatus: 'PASSED', status: 'SCREENED' } });
      for (const [component, life, vol] of [['PRBC', 42, 280], ['FFP', 365, 200]] as const) {
        await prisma.bloodUnit.create({ data: { tenantId: T, unitNumber: seqNo('BU', ++unitN), donationId: don.id, abo, rh, component, volumeMl: vol, collectedAt: donatedAt, expiresAt: new Date(donatedAt.getTime() + life * DAY), status: 'AVAILABLE' } });
      }
    }
    // KNBTS-supplied units, two expiring soon
    const knbts: [string, string, string, number][] = [['O', 'POS', 'WHOLE_BLOOD', 2], ['A', 'POS', 'PRBC', 1], ['B', 'NEG', 'PLATELETS', 3], ['O', 'POS', 'PRBC', 30], ['O', 'NEG', 'PRBC', 25]];
    for (const [abo, rh, component, daysLeft] of knbts) {
      await prisma.bloodUnit.create({ data: { tenantId: T, unitNumber: seqNo('KNBTS', ++unitN), abo, rh, component, volumeMl: 450, collectedAt: new Date(now - 10 * DAY), expiresAt: new Date(now + daysLeft * DAY), status: 'AVAILABLE' } });
    }
    // A deferred donor
    await prisma.bloodDonor.create({ data: { tenantId: T, donorNumber: seqNo('BD', 99), firstName: 'Joseph', lastName: 'Otieno', sex: 'MALE', abo: 'B', rh: 'POS', eligible: false, deferralReason: 'Haemoglobin below 12.5 g/dL', deferredUntil: new Date(now + 60 * DAY) } });
    // Crossmatched & transfused request
    const pt = P(3); const v = await visitFor(pt.id);
    await prisma.patient.update({ where: { id: pt.id }, data: { bloodGroup: 'O+' } });
    const req = await prisma.bloodRequest.create({ data: { tenantId: T, requestNumber: seqNo('BR', 1), patientId: pt.id, visitId: v.id, component: 'PRBC', unitsRequested: 1, urgency: 'URGENT', indication: 'Symptomatic anaemia, Hb 6.2 g/dL', patientAbo: 'O', patientRh: 'POS', antibodyScreen: 'NEGATIVE', status: 'ISSUED' } });
    const unit = await prisma.bloodUnit.findFirst({ where: { tenantId: T, abo: 'O', rh: 'POS', component: 'PRBC', status: 'AVAILABLE' }, orderBy: { expiresAt: 'asc' } });
    if (unit && isCompatible({ abo: 'O', rh: 'POS' }, { abo: 'O', rh: 'POS', component: 'PRBC' }).compatible) {
      await prisma.bloodCrossmatch.create({ data: { tenantId: T, requestId: req.id, unitId: unit.id, method: 'IAT', result: 'COMPATIBLE' } });
      await prisma.bloodUnit.update({ where: { id: unit.id }, data: { status: 'TRANSFUSED', reservedForRequestId: req.id, issuedToPatientId: pt.id, issuedAt: new Date(now - DAY) } });
      await prisma.transfusion.create({ data: { tenantId: T, unitId: unit.id, requestId: req.id, patientId: pt.id, visitId: v.id, issuedAt: new Date(now - DAY), startedAt: new Date(now - DAY + 600000), endedAt: new Date(now - DAY + 3 * 3600000), volumeMl: 280, status: 'COMPLETED', reaction: true, reactionType: 'FEBRILE', reactionSeverity: 'MILD', reactionNotes: 'Temp 38.2°C at 90 min; paracetamol given; completed.', reactionAt: new Date(now - DAY + 5400000), preVitals: { temp: 36.8, pulse: 96, bp: '110/70' }, postVitals: { temp: 37.4, pulse: 88, bp: '118/74' } } });
    }
    const pt2 = P(5); const v2 = await visitFor(pt2.id);
    await prisma.bloodRequest.create({ data: { tenantId: T, requestNumber: seqNo('BR', 2), patientId: pt2.id, visitId: v2.id, component: 'PRBC', unitsRequested: 2, urgency: 'ROUTINE', indication: 'Pre-op (elective hysterectomy)', status: 'REQUESTED' } });
  }

  // ── Mortuary
  if ((await prisma.mortuaryCompartment.count({ where: { tenantId: T } })) === 0) {
    for (let i = 1; i <= 8; i++) await prisma.mortuaryCompartment.create({ data: { tenantId: T, label: `Bay ${i}`, type: i > 6 ? 'DEEP_FREEZE' : 'COLD', status: i === 8 ? 'MAINTENANCE' : 'AVAILABLE' } });
    const bays = await prisma.mortuaryCompartment.findMany({ where: { tenantId: T }, orderBy: { label: 'asc' } });
    const bodies: { first: string; last: string; sex: 'MALE' | 'FEMALE'; age: number; daysAgo: number; source: string; cause: string; released?: boolean; pm?: boolean }[] = [
      { first: 'Unknown', last: 'Adult Male', sex: 'MALE', age: 40, daysAgo: 3, source: 'BROUGHT_IN_DEAD', cause: 'Road traffic accident (police case)', pm: true },
      { first: 'Wanjiru', last: 'Gathoni', sex: 'FEMALE', age: 78, daysAgo: 2, source: 'BROUGHT_IN_DEAD', cause: 'Natural causes' },
      { first: 'Ochieng', last: 'Odhiambo', sex: 'MALE', age: 65, daysAgo: 9, source: 'BROUGHT_IN_DEAD', cause: 'Cardiac arrest', released: true },
    ];
    for (const [i, b] of bodies.entries()) {
      const at = new Date(now - b.daysAgo * DAY);
      const p = await prisma.patient.create({ data: { tenantId: T, mrn: seqNo('MRN-MTY', i + 1), firstName: b.first, lastName: b.last, sex: b.sex, dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - b.age, 0, 1)), deceasedAt: at } });
      const v = await prisma.visit.create({ data: { tenantId: T, facilityId: F, patientId: p.id, visitNumber: seqNo('V-MTY', i + 1), type: 'OPD', startedAt: at } });
      const bay = bays[i];
      await prisma.mortuaryCase.create({ data: {
        tenantId: T, caseNumber: seqNo('MTY', i + 1), source: b.source, patientId: p.id, visitId: v.id, deceasedName: `${b.first} ${b.last}`, sex: b.sex, ageYears: b.age, dateOfDeath: at, causeOfDeath: b.cause,
        broughtBy: b.pm ? 'Kiambu Police Station' : 'Family', policeObNumber: b.pm ? 'OB 23/14/10/2026' : undefined, compartmentId: b.released ? undefined : bay.id, admittedAt: at,
        status: b.released ? 'RELEASED' : 'IN_STORAGE', pmStatus: b.pm ? 'REQUESTED' : undefined, pmRequestedBy: b.pm ? 'OCS Kiambu' : undefined, pmReason: b.pm ? 'Police case – RTA' : undefined, pmRequestedAt: b.pm ? at : undefined,
        ...(b.released ? { releasedAt: new Date(now - 2 * DAY), releasedTo: 'Achieng Odhiambo', releasedToIdNo: '22334455', releasedToRelationship: 'Daughter', burialPermitNo: 'BP-KBU-004521', burialPermitDate: new Date(now - 3 * DAY), disposalMethod: 'BURIAL', destination: 'Siaya' } : {}),
      } });
      if (!b.released) await prisma.mortuaryCompartment.update({ where: { id: bay.id }, data: { status: 'OCCUPIED' } });
    }
  }

  // ── CSSD
  if ((await prisma.instrumentSet.count({ where: { tenantId: T } })) === 0) {
    const sets: [string, string, string, [string, number][]][] = [
      ['SET-MAJ-01', 'Major laparotomy set', 'Theatre', [['Mayo scissors', 2], ['Artery forceps', 12], ['Needle holder', 2], ['Deaver retractor', 2], ['Scalpel handle #4', 1]]],
      ['SET-MAJ-02', 'Major laparotomy set', 'Theatre', [['Mayo scissors', 2], ['Artery forceps', 12], ['Needle holder', 2], ['Deaver retractor', 2], ['Scalpel handle #4', 1]]],
      ['SET-CS-01', 'Caesarean section set', 'Maternity', [['Doyen retractor', 1], ['Green-Armytage forceps', 6], ['Artery forceps', 10], ['Needle holder', 2]]],
      ['SET-MIN-01', 'Minor procedure set', 'OPD', [['Toothed forceps', 1], ['Stitch scissors', 1], ['Needle holder', 1]]],
      ['SET-DEL-01', 'Delivery pack', 'Maternity', [['Cord scissors', 1], ['Artery forceps', 2], ['Kidney dish', 1]]],
    ];
    const ids: string[] = [];
    for (const [code, name, dept, items] of sets) ids.push((await prisma.instrumentSet.create({ data: { tenantId: T, code, name, department: dept, items: items.map(([n, q]) => ({ name: n, qty: q })), status: 'DIRTY' } })).id);
    const c1 = await prisma.sterilisationCycle.create({ data: { tenantId: T, cycleNumber: seqNo('CYC', 1), machine: 'Autoclave A', method: 'STEAM', setIds: ids.slice(0, 4), startedAt: new Date(now - DAY), endedAt: new Date(now - DAY + 3600000), temperatureC: 134, pressureKpa: 216, durationMin: 18, chemicalIndicator: 'PASS', biologicalIndicator: 'PASS', bowieDick: 'PASS', status: 'PASSED' } });
    await prisma.instrumentSet.updateMany({ where: { id: { in: ids.slice(0, 4) } }, data: { status: 'STERILE', lastCycleId: c1.id, sterileUntil: new Date(now + 29 * DAY) } });
    await prisma.sterilisationCycle.create({ data: { tenantId: T, cycleNumber: seqNo('CYC', 2), machine: 'Autoclave B', method: 'STEAM', setIds: [ids[4]], startedAt: new Date(now - 2 * DAY), endedAt: new Date(now - 2 * DAY + 3600000), temperatureC: 121, durationMin: 15, chemicalIndicator: 'FAIL', biologicalIndicator: 'PENDING', status: 'FAILED' } });
    const surgery = await prisma.surgery.findFirst({ where: { tenantId: T }, orderBy: { scheduledStart: 'desc' } });
    if (surgery) {
      const v = await prisma.visit.findUnique({ where: { id: surgery.visitId } });
      await prisma.setIssue.create({ data: { tenantId: T, setId: ids[0], cycleId: c1.id, surgeryId: surgery.id, patientId: v?.patientId, location: surgery.theatre, issuedAt: new Date(now - 3600000) } });
      await prisma.instrumentSet.update({ where: { id: ids[0] }, data: { status: 'ISSUED' } });
    }
  }

  // ── Ambulance / EMS
  if ((await prisma.ambulance.count({ where: { tenantId: T } })) === 0) {
    const a1 = await prisma.ambulance.create({ data: { tenantId: T, regNumber: 'KDA 123A', callSign: 'Rescue 1', type: 'ALS', odometerKm: 48210 } });
    const a2 = await prisma.ambulance.create({ data: { tenantId: T, regNumber: 'KCZ 456B', callSign: 'Rescue 2', type: 'BLS', odometerKm: 91550, status: 'DISPATCHED' } });
    await prisma.ambulance.create({ data: { tenantId: T, regNumber: 'KBX 789C', callSign: 'Transport 1', type: 'TRANSPORT', odometerKm: 132400, status: 'MAINTENANCE' } });
    const pt = P(7); const v = await visitFor(pt.id);
    const km = 18;
    await prisma.ambulanceTrip.create({ data: { tenantId: T, tripNumber: seqNo('TRIP', 1), requestedAt: new Date(now - 2 * DAY), callerName: 'Jane Mwangi', callerPhone: '+254722111333', patientId: pt.id, pickupLocation: 'Ruiru, Kimbo stage', dropoffLocation: 'Demo Mission Hospital A&E', priority: 'EMERGENCY', complaint: 'Difficulty in breathing', ambulanceId: a1.id, crew: ['EMT Kevin Ouma', 'Driver Ali Hassan'], status: 'COMPLETED', dispatchedAt: new Date(now - 2 * DAY + 180000), atSceneAt: new Date(now - 2 * DAY + 1200000), pickedUpAt: new Date(now - 2 * DAY + 1800000), droppedAt: new Date(now - 2 * DAY + 3000000), odometerStart: 48192, odometerEnd: 48210, mileageKm: km, visitId: v.id, chargedMinor: KES(3000 + km * 120) } });
    await prisma.ambulanceTrip.create({ data: { tenantId: T, tripNumber: seqNo('TRIP', 2), requestedAt: new Date(now - 1200000), callerName: 'Thika Road patrol', callerPhone: '+254733444555', patientName: 'Unknown male', pickupLocation: 'Thika Rd, Githurai flyover', priority: 'EMERGENCY', complaint: 'RTA – motorcycle', ambulanceId: a2.id, crew: ['EMT Lucy Chebet', 'Driver Tom Njoroge'], status: 'DISPATCHED', dispatchedAt: new Date(now - 900000), odometerStart: 91550 } });
    await prisma.ambulanceTrip.create({ data: { tenantId: T, tripNumber: seqNo('TRIP', 3), requestedAt: new Date(now - 300000), callerName: 'St. Mary Dispensary', callerPhone: '+254711555666', pickupLocation: 'St. Mary Dispensary, Juja', dropoffLocation: 'Demo Mission Hospital Maternity', priority: 'URGENT', complaint: 'Referral – prolonged labour', status: 'REQUESTED' } });
  }

  // ── Dietetics: diet orders for current admissions
  if ((await prisma.dietOrder.count({ where: { tenantId: T } })) === 0) {
    if ((await prisma.admission.count({ where: { tenantId: T, dischargedAt: null } })) === 0) {
      // Demo needs current inpatients for meal plans: admit a few patients into free beds.
      const beds = await prisma.bed.findMany({ where: { tenantId: T, status: 'AVAILABLE', ward: { type: { in: ['GENERAL', 'PRIVATE'] } } }, include: { ward: true }, take: 6 });
      for (const [i, bed] of beds.entries()) {
        const p = P(24 + i);
        const v = await prisma.visit.create({ data: { tenantId: T, facilityId: F, patientId: p.id, visitNumber: seqNo('V-IPD', i + 1), type: 'IPD', status: 'ADMITTED', startedAt: new Date(now - (i + 1) * DAY) } });
        await prisma.admission.create({ data: { tenantId: T, visitId: v.id, wardId: bed.wardId, bedId: bed.id, reason: ['Pneumonia', 'Diabetic ketoacidosis', 'Hypertensive urgency', 'Cellulitis', 'Acute gastroenteritis', 'CKD exacerbation'][i], admittedAt: v.startedAt, lastChargedAt: new Date(now) } });
        await prisma.bed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } });
      }
    }
    const adms = await prisma.admission.findMany({ where: { tenantId: T, dischargedAt: null }, include: { visit: true }, take: 12 });
    const diets = ['DIABETIC', 'NORMAL', 'LOW_SALT', 'SOFT', 'RENAL', 'HIGH_PROTEIN', 'NORMAL', 'LIQUID'];
    for (const [i, a] of adms.entries()) {
      await prisma.dietOrder.create({ data: { tenantId: T, admissionId: a.id, patientId: a.visit.patientId, wardId: a.wardId, dietType: diets[i % diets.length], allergies: i === 2 ? 'Groundnuts' : undefined, notes: i === 4 ? 'Fluid restrict 1 L/day' : undefined, orderedById: staff?.id } });
    }
  }

  // ── Rehab
  if ((await prisma.rehabPlan.count({ where: { tenantId: T } })) === 0) {
    const plans = [
      { p: P(8), therapy: 'PHYSIO', diagnosis: 'Post-stroke left hemiparesis', goals: 'Independent transfers; walk 20 m with frame', measure: 'BARTHEL', base: 35, target: 75, scores: [40, 48, 55] },
      { p: P(9), therapy: 'PHYSIO', diagnosis: 'Chronic low back pain', goals: 'Pain < 3/10; return to work', measure: 'VAS_PAIN', base: 8, target: 3, scores: [7, 6, 5, 4] },
      { p: P(10), therapy: 'OT', diagnosis: 'Distal radius fracture – post-cast stiffness', goals: 'Grip strength and ADLs', measure: 'QUICKDASH', base: 62, target: 20, scores: [55] },
    ];
    for (const x of plans) {
      const v = await visitFor(x.p.id);
      const plan = await prisma.rehabPlan.create({ data: { tenantId: T, patientId: x.p.id, therapy: x.therapy, diagnosis: x.diagnosis, goals: x.goals, frequency: '2x weekly', plannedSessions: 10, outcomeMeasure: x.measure, baselineScore: x.base, targetScore: x.target, startDate: new Date(now - 21 * DAY) } });
      for (const [i, s] of x.scores.entries()) await prisma.rehabSession.create({ data: { tenantId: T, planId: plan.id, sessionAt: new Date(now - (18 - i * 5) * DAY), durationMin: 45, interventions: 'Therapeutic exercise, gait/ADL training', painScore: Math.max(2, 7 - i), outcomeScore: s, visitId: v.id } });
    }
  }

  // ── HIV programme
  if ((await prisma.hivEnrolment.count({ where: { tenantId: T } })) === 0) {
    const cohort = [
      { p: P(11), regimen: 'TDF/3TC/DTG', vl: [[300, 12000], [120, 400], [30, null]], pmtct: false, nextIn: 14 },
      { p: P(12), regimen: 'TDF/3TC/DTG', vl: [[200, 85000], [20, 15000]], pmtct: false, nextIn: -12 },
      { p: P(13), regimen: 'TDF/3TC/DTG', vl: [[90, null]], pmtct: true, nextIn: -3 },
      { p: P(14), regimen: 'AZT/3TC/LPV/r', vl: [[400, 2500], [60, 600]], pmtct: false, nextIn: -45, second: true },
      { p: P(15), regimen: 'ABC/3TC/DTG', vl: [], pmtct: false, nextIn: 30 },
    ];
    for (const [i, c] of cohort.entries()) {
      const enrolledAt = new Date(now - (500 - i * 60) * DAY);
      const e = await prisma.hivEnrolment.create({ data: { tenantId: T, patientId: c.p.id, cccNumber: `14012-${String(i + 1).padStart(5, '0')}`, enrolledAt, entryPoint: c.pmtct ? 'PMTCT' : ['VCT', 'OPD', 'TB'][i % 3], whoStage: 1 + (i % 3), artStartDate: enrolledAt, currentRegimen: c.regimen, pmtct: c.pmtct } });
      if (c.second) {
        await prisma.artRegimen.create({ data: { tenantId: T, enrolmentId: e.id, regimen: 'TDF/3TC/EFV', line: 'FIRST', startDate: enrolledAt, endDate: new Date(now - 300 * DAY), changeReason: 'Treatment failure (VL > 1000 x2)' } });
        await prisma.artRegimen.create({ data: { tenantId: T, enrolmentId: e.id, regimen: c.regimen, line: 'SECOND', startDate: new Date(now - 300 * DAY) } });
      } else await prisma.artRegimen.create({ data: { tenantId: T, enrolmentId: e.id, regimen: c.regimen, line: 'FIRST', startDate: enrolledAt } });
      for (const [daysAgo, copies] of c.vl) {
        await prisma.viralLoad.create({ data: { tenantId: T, enrolmentId: e.id, sampleDate: new Date(now - (daysAgo as number) * DAY), copiesPerMl: copies as number | null, ldl: copies == null, suppressed: isSuppressed(copies as number | null, copies == null) } });
      }
      await prisma.hivAppointment.create({ data: { tenantId: T, enrolmentId: e.id, scheduledAt: new Date(now - 60 * DAY), purpose: 'REFILL', status: 'ATTENDED', attendedAt: new Date(now - 60 * DAY) } });
      await prisma.hivAppointment.create({ data: { tenantId: T, enrolmentId: e.id, scheduledAt: new Date(now + c.nextIn * DAY), purpose: 'CLINICAL' } });
    }
  }

  // ── TB register
  if ((await prisma.tbCase.count({ where: { tenantId: T } })) === 0) {
    const cases = [
      { p: P(16), start: 30, site: 'PULMONARY', hiv: 'NEG' }, { p: P(12), start: 75, site: 'PULMONARY', hiv: 'POS', cont: true },
      { p: P(17), start: 190, site: 'EXTRA_PULMONARY', hiv: 'NEG', outcome: 'COMPLETED' },
    ];
    for (const [i, c] of cases.entries()) {
      const start = new Date(now - c.start * DAY);
      const tc = await prisma.tbCase.create({ data: { tenantId: T, patientId: c.p.id, tbNumber: seqNo('TB', i + 1), registeredAt: start, intensiveStart: start, diseaseSite: c.site, confirmation: c.site === 'PULMONARY' ? 'BACTERIOLOGICAL' : 'CLINICAL', hivStatus: c.hiv, phase: c.outcome ? 'COMPLETED' : c.cont ? 'CONTINUATION' : 'INTENSIVE', continuationStart: c.cont || c.outcome ? new Date(start.getTime() + 56 * DAY) : undefined, outcome: c.outcome, outcomeDate: c.outcome ? new Date(start.getTime() + 168 * DAY) : undefined } });
      for (let d = 1; d <= 10; d++) {
        const day = new Date(now - d * DAY); const date = new Date(`${day.toISOString().slice(0, 10)}T00:00:00.000Z`);
        if (!c.outcome) await prisma.tbDot.create({ data: { tenantId: T, caseId: tc.id, date, observed: d % 5 !== 0, observer: 'CHV Rose Atieno' } });
      }
    }
  }

  // ── Oncology
  if ((await prisma.chemoProtocol.count({ where: { tenantId: T } })) === 0) {
    const protos: Record<string, { id: string; drugs: ProtocolDrug[]; cycles: number; intervalDays: number }> = {};
    for (const p of PROTOCOLS) protos[p.code] = { ...(await prisma.chemoProtocol.create({ data: { tenantId: T, code: p.code, name: p.name, indication: p.indication, cycles: p.cycles, intervalDays: p.intervalDays, drugs: p.drugs as any } })), drugs: p.drugs };
    for (const [i, x] of [{ p: P(18), code: 'AC', h: 162, w: 68, given: 2 }, { p: P(19), code: 'CHOP', h: 175, w: 72, given: 1 }].entries()) {
      const pr = protos[x.code]; const bsa = bsaMosteller(x.h, x.w);
      const doses = pr.drugs.map((d) => plannedDose(d, bsa, x.w));
      const start = new Date(now - (x.given * pr.intervalDays - 3) * DAY);
      const r = await prisma.patientRegimen.create({ data: { tenantId: T, patientId: x.p.id, protocolId: pr.id, heightCm: x.h, weightKg: x.w, bsa, startDate: start } });
      for (const [n, dt] of cycleDates(start, pr.cycles, pr.intervalDays).entries()) {
        const given = n < x.given;
        await prisma.chemoCycle.create({ data: { tenantId: T, regimenId: r.id, cycleNo: n + 1, scheduledDate: dt, plannedDoses: doses as any, bsa, status: given ? 'ADMINISTERED' : 'SCHEDULED', ...(given ? { administeredAt: dt, givenDoses: doses as any, weightKg: x.w } : {}) } });
      }
      void i;
    }
  }

  // ── FP & NCD clinics
  if ((await prisma.fpRecord.count({ where: { tenantId: T } })) === 0) {
    const women = patients.filter((p) => p.sex === 'FEMALE').slice(0, 6);
    const methods = ['INJECTABLE', 'IMPLANT', 'PILLS_COC', 'IUCD', 'CONDOMS', 'INJECTABLE'];
    for (const [i, w] of women.entries()) {
      const at = new Date(now - (i * 9 + 1) * DAY);
      await prisma.fpRecord.create({ data: { tenantId: T, patientId: w.id, visitDate: at, clientType: i % 2 ? 'REVISIT' : 'NEW', method: methods[i], quantity: methods[i] === 'CONDOMS' ? 30 : methods[i] === 'PILLS_COC' ? 3 : 1, nextVisitAt: new Date(at.getTime() + 84 * DAY), sideEffects: i === 0 ? 'Irregular spotting' : undefined } });
    }
  }
  if ((await prisma.ncdFollowUp.count({ where: { tenantId: T } })) === 0) {
    const series = [
      { p: P(20), cond: 'HTN', bp: [[168, 102], [154, 96], [142, 90], [134, 84]] as number[][], fbs: [] as number[] },
      { p: P(21), cond: 'DM', bp: [], fbs: [12.4, 10.1, 8.2, 6.8] },
      { p: P(22), cond: 'HTN_DM', bp: [[150, 95], [146, 92], [138, 86]], fbs: [9.5, 8.8, 7.4] },
    ];
    for (const s of series) {
      const n = Math.max(s.bp.length, s.fbs.length);
      for (let i = 0; i < n; i++) {
        const v = { systolic: s.bp[i]?.[0], diastolic: s.bp[i]?.[1], fbs: s.fbs[i] };
        await prisma.ncdFollowUp.create({ data: { tenantId: T, patientId: s.p.id, condition: s.cond, visitAt: new Date(now - (n - i) * 30 * DAY), ...v, weightKg: 82 - i, medications: s.cond === 'DM' ? 'Metformin 1 g BD' : s.cond === 'HTN' ? 'Amlodipine 10 mg OD, HCTZ 25 mg OD' : 'Metformin 1 g BD, Losartan 50 mg OD', controlled: ncdControlled(s.cond, v), nextVisitAt: new Date(now + 30 * DAY) } });
      }
    }
  }
  console.log('seed-clinical2: clinical support & programmes demo data ready');
}
