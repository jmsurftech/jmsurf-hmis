/**
 * Demo data for the patient portal, telemedicine and reminders. Idempotent; run after the main seed:
 *   pnpm seed:engagement   (ts-node prisma/seed-engagement.ts)
 * Demo portal login: tenant "demo", phone 0711271828 (John Omondi, DMH-00001); in dev the OTP is returned by the API.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_PHONE = '+254711271828';

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'demo' }, include: { facilities: { orderBy: { createdAt: 'asc' } } } });
  if (!tenant) { console.log('Demo tenant not found; run the main seed first.'); return; }
  const T = tenant.id, F = tenant.facilities[0].id;
  if (!tenant.enabledModules.includes('telemedicine')) await prisma.tenant.update({ where: { id: T }, data: { enabledModules: { push: 'telemedicine' } } });

  // Availability: doctors & clinical officers Mon–Fri 08:00–17:00 (30 min), Sat 09:00–13:00.
  const prs = await prisma.practitioner.findMany({ where: { tenantId: T, cadre: { in: ['DOCTOR', 'CLINICAL_OFFICER'] } } });
  for (const p of prs) {
    if (await prisma.practitionerAvailability.count({ where: { tenantId: T, practitionerId: p.id } })) continue;
    await prisma.practitionerAvailability.createMany({
      data: [
        ...[1, 2, 3, 4, 5].map((weekday) => ({ tenantId: T, facilityId: F, practitionerId: p.id, weekday, startTime: '08:00', endTime: '17:00', slotMinutes: 30 })),
        { tenantId: T, facilityId: F, practitionerId: p.id, weekday: 6, startTime: '09:00', endTime: '13:00', slotMinutes: 30 },
      ],
    });
  }
  const doctor = prs.find((p) => p.cadre === 'DOCTOR') ?? prs[0];

  // Demo account holder + a dependant child on the same phone.
  let holder = await prisma.patient.findFirst({ where: { tenantId: T, phone: DEMO_PHONE } });
  if (!holder) holder = await prisma.patient.findFirst({ where: { tenantId: T, mrn: 'DMH-00001' } });
  if (!holder) { console.log('No demo patient found.'); return; }
  holder = await prisma.patient.update({ where: { id: holder.id }, data: { phone: DEMO_PHONE, idNumber: holder.idNumber ?? '27123456', idType: holder.idType ?? 'NATIONAL_ID' } });
  const child = await prisma.patient.findFirst({ where: { tenantId: T, mrn: { not: holder.mrn }, dateOfBirth: { gte: new Date('2018-01-01') }, mergedIntoId: null }, orderBy: { mrn: 'asc' } });
  if (child) await prisma.patient.update({ where: { id: child.id }, data: { nextOfKin: [{ name: `${holder.firstName} ${holder.lastName}`, relationship: 'FATHER', phone: DEMO_PHONE }] } });
  await prisma.patientPreference.upsert({ where: { patientId: holder.id }, create: { tenantId: T, patientId: holder.id, language: 'en' }, update: {} });

  // Appointments: a telemedicine consult tomorrow 10:00 EAT and an in-person review in 3 days, plus a video consult today for staff demo.
  const at = (daysAhead: number, hourLocal: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + daysAhead); d.setUTCHours(hourLocal - 3, 0, 0, 0); return d; };
  const want = [
    { startAt: at(1, 10), mode: 'TELEMEDICINE', reason: 'Follow-up: blood pressure review (video)' },
    { startAt: at(3, 11), mode: 'IN_PERSON', reason: 'Diabetes clinic review' },
    { startAt: at(0, 16), mode: 'TELEMEDICINE', reason: 'Video consult: lab results discussion' },
  ];
  for (const w of want) {
    const exists = await prisma.appointment.findFirst({ where: { tenantId: T, patientId: holder.id, reason: w.reason, status: { in: ['BOOKED', 'CONFIRMED', 'ARRIVED'] } } });
    if (exists) continue;
    await prisma.appointment.create({ data: { tenantId: T, facilityId: F, patientId: holder.id, practitionerId: doctor?.id, startAt: w.startAt, endAt: new Date(w.startAt.getTime() + 30 * 60000), mode: w.mode, reason: w.reason, status: 'BOOKED' } });
  }
  if (child) {
    const imm = await prisma.immunization.findFirst({ where: { tenantId: T, patientId: child.id, status: 'DUE' } });
    if (!imm) await prisma.immunization.create({ data: { tenantId: T, patientId: child.id, vaccine: 'Measles-Rubella', dose: 2, dueDate: at(1, 9), status: 'DUE' } });
  }
  console.log(`Engagement demo ready. Portal: tenant "demo", phone ${DEMO_PHONE} (${holder.firstName} ${holder.lastName}${child ? ` + dependant ${child.firstName}` : ''}).`);
}

main().finally(() => prisma.$disconnect());
