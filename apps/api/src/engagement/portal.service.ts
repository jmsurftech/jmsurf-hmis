import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { AuditService } from '../common/audit.service';
import { MOBILE_MONEY, MobileMoneyPort, NATIONAL_INSURANCE, NationalInsurancePort } from '../integrations/ports';
import { withTenant } from '../integrations/integration-context';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, checkOtp, generateOtp, hashOtp, normalizePhone } from './otp';
import { PatientPrincipal, patientJwtSecret } from './patient-auth';
import { MessagingService } from './messaging.service';
import { TelemedicineService } from './telemedicine.service';
import { DEFAULT_AVAILABILITY, computeSlots } from './slots';

const PATIENT_SELECT = { id: true, mrn: true, firstName: true, middleName: true, lastName: true, sex: true, dateOfBirth: true, phone: true, email: true, shaNumber: true, crId: true, county: true, bloodGroup: true } as const;
export const PORTAL_CONSENT_SCOPES = ['SMS', 'WHATSAPP', 'DATA_SHARING_HIE', 'RESEARCH', 'MARKETING'];
const BOOKABLE_CADRES = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'DENTIST', 'SPECIALIST'];

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService, private jwt: JwtService, private seq: SequenceService, private audit: AuditService,
    private messaging: MessagingService, private tele: TelemedicineService,
    @Inject(MOBILE_MONEY) private mobileMoney: MobileMoneyPort, @Inject(NATIONAL_INSURANCE) private nhi: NationalInsurancePort,
  ) {}

  private async tenantBySlug(slug: string) {
    const t = await this.prisma.tenant.findUnique({ where: { slug: (slug || '').toLowerCase() }, include: { facilities: { orderBy: { createdAt: 'asc' } } } });
    if (!t || t.subscriptionStatus === 'CANCELLED') throw new NotFoundException('Facility not found');
    return t;
  }

  private patientsByPhone(tenantId: string, phone: string) {
    return this.prisma.patient.findMany({ where: { tenantId, phone, mergedIntoId: null, deceasedAt: null }, orderBy: [{ dateOfBirth: 'asc' }, { createdAt: 'asc' }] });
  }

  // ───────── Auth ─────────
  async requestOtp(slug: string, rawPhone: string) {
    const t = await this.tenantBySlug(slug);
    const phone = normalizePhone(rawPhone);
    const recent = await this.prisma.patientOtp.findFirst({ where: { tenantId: t.id, phone }, orderBy: { createdAt: 'desc' } });
    if (recent && Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    const patients = await this.patientsByPhone(t.id, phone);
    const generic = { sent: true, phone, expiresInSeconds: OTP_TTL_MS / 1000 };
    if (!patients.length) return generic; // do not reveal whether the number is registered
    const code = generateOtp();
    await this.prisma.patientOtp.create({ data: { tenantId: t.id, phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
    await this.messaging.sendToPatient(t.id, { patientId: patients[0].id, to: phone, code: 'OTP', vars: { code, facility: t.facilities[0]?.name ?? t.name } }).catch(() => undefined);
    return process.env.NODE_ENV !== 'production' ? { ...generic, devOtp: code } : generic;
  }

  async verifyOtp(slug: string, rawPhone: string, code: string) {
    const t = await this.tenantBySlug(slug);
    const phone = normalizePhone(rawPhone);
    const otp = await this.prisma.patientOtp.findFirst({ where: { tenantId: t.id, phone, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!otp) throw new UnauthorizedException('Request a new code');
    const r = checkOtp(otp, phone, code);
    if (r === 'INVALID') {
      await this.prisma.patientOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException(`Incorrect code (${Math.max(OTP_MAX_ATTEMPTS - otp.attempts - 1, 0)} attempts left)`);
    }
    if (r !== 'OK') throw new UnauthorizedException(r === 'EXPIRED' ? 'Code expired; request a new one' : r === 'TOO_MANY_ATTEMPTS' ? 'Too many attempts; request a new code' : 'Request a new code');
    await this.prisma.patientOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    const patients = await this.patientsByPhone(t.id, phone);
    if (!patients.length) throw new UnauthorizedException('No patient record for this number');
    // Account holder: the oldest adult registered on this number.
    const adult = patients.find((p) => !p.dateOfBirth || Date.now() - p.dateOfBirth.getTime() >= 18 * 365.25 * 86400000) ?? patients[0];
    const principal: PatientPrincipal = { typ: 'patient', sub: adult.id, tenantId: t.id, phone, roles: ['PATIENT'] };
    await this.audit.log({ tenantId: t.id, action: 'PATIENT_LOGIN', entity: 'Patient', entityId: adult.id, data: { via: 'OTP' } });
    return {
      accessToken: this.jwt.sign(principal, { secret: patientJwtSecret(), expiresIn: '12h' }),
      patient: { id: adult.id, firstName: adult.firstName, lastName: adult.lastName, mrn: adult.mrn },
      tenant: { slug: t.slug, name: t.name, logoUrl: t.logoUrl, primaryColor: t.primaryColor },
    };
  }

  // ───────── Family scoping ─────────
  /** The account holder plus dependants: patients sharing the phone, or listing it as next-of-kin phone. */
  async family(p: PatientPrincipal) {
    const rows = await this.prisma.patient.findMany({
      where: { tenantId: p.tenantId, mergedIntoId: null, OR: [{ id: p.sub }, { phone: p.phone }, { nextOfKin: { array_contains: [{ phone: p.phone }] } }] },
      select: PATIENT_SELECT, orderBy: { dateOfBirth: 'asc' },
    });
    return rows.map((r) => ({ ...r, isAccountHolder: r.id === p.sub }));
  }
  async familyIds(p: PatientPrincipal) { return (await this.family(p)).map((f) => f.id); }

  /** Resolve which patient a request is about; must be the holder or a dependant. */
  async subject(p: PatientPrincipal, patientId?: string) {
    if (!patientId || patientId === p.sub) return p.sub;
    if (!(await this.familyIds(p)).includes(patientId)) throw new NotFoundException('Patient not found');
    return patientId;
  }

  // ───────── Profile ─────────
  async me(p: PatientPrincipal, patientId?: string) {
    const id = await this.subject(p, patientId);
    const patient = await this.prisma.patient.findFirstOrThrow({ where: { id, tenantId: p.tenantId }, select: { ...PATIENT_SELECT, nextOfKin: true, allergies: { select: { substance: true, reaction: true, severity: true } }, covers: true } });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: p.tenantId }, select: { name: true, slug: true, logoUrl: true, primaryColor: true, enabledModules: true } });
    const preferences = await this.prisma.patientPreference.findFirst({ where: { tenantId: p.tenantId, patientId: id } });
    return { ...patient, preferences: preferences ?? { language: 'en', whatsapp: false }, tenant };
  }
  async setPreferences(p: PatientPrincipal, dto: { language?: string; whatsapp?: boolean }, patientId?: string) {
    const id = await this.subject(p, patientId);
    return this.prisma.patientPreference.upsert({ where: { patientId: id }, create: { tenantId: p.tenantId, patientId: id, language: dto.language ?? 'en', whatsapp: dto.whatsapp ?? false }, update: { ...dto } });
  }

  // ───────── Appointments ─────────
  async appointments(p: PatientPrincipal, patientId?: string) {
    const ids = patientId ? [await this.subject(p, patientId)] : await this.familyIds(p);
    const appts = await this.prisma.appointment.findMany({ where: { tenantId: p.tenantId, patientId: { in: ids } }, orderBy: { startAt: 'desc' }, take: 100 });
    const pr = await this.practitionerMap(p.tenantId, appts.map((a) => a.practitionerId).filter(Boolean) as string[]);
    const sessions = await this.prisma.telemedicineSession.findMany({ where: { tenantId: p.tenantId, appointmentId: { in: appts.map((a) => a.id) } } });
    return appts.map(({ meetingUrl, ...a }) => {
      const s = sessions.find((x) => x.appointmentId === a.id);
      return { ...a, practitioner: a.practitionerId ? pr.get(a.practitionerId) : null, telemedicine: s ? { feeMinor: s.feeMinor, billId: s.billId } : null };
    });
  }

  private async practitionerMap(tenantId: string, ids: string[]) {
    const rows = await this.prisma.practitioner.findMany({ where: { tenantId, id: { in: ids } }, include: { user: { select: { firstName: true, lastName: true } } } });
    return new Map(rows.map((r) => [r.id, { id: r.id, name: `${r.user.firstName} ${r.user.lastName}`, cadre: r.cadre, specialty: r.specialty }]));
  }

  async practitioners(tenantId: string) {
    const rows = await this.prisma.practitioner.findMany({ where: { tenantId, cadre: { in: BOOKABLE_CADRES }, user: { active: true } }, include: { user: { select: { firstName: true, lastName: true } } } });
    return rows.map((r) => ({ id: r.id, name: `${r.cadre === 'DOCTOR' ? 'Dr. ' : ''}${r.user.firstName} ${r.user.lastName}`, cadre: r.cadre, specialty: r.specialty, consultationFeeMinor: r.consultationFeeMinor }));
  }

  async slots(tenantId: string, practitionerId: string, date: string, mode?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new BadRequestException('date must be YYYY-MM-DD');
    const pr = await this.prisma.practitioner.findFirst({ where: { id: practitionerId, tenantId } });
    if (!pr) throw new NotFoundException('Practitioner not found');
    const rules = await this.prisma.practitionerAvailability.findMany({ where: { tenantId, practitionerId, active: true } });
    const dayStart = new Date(`${date}T00:00:00+03:00`), dayEnd = new Date(dayStart.getTime() + 86400000);
    const booked = await this.prisma.appointment.findMany({ where: { tenantId, practitionerId, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } }, select: { startAt: true, endAt: true } });
    return computeSlots(rules.length ? rules : DEFAULT_AVAILABILITY, date, booked, new Date(), 180, mode);
  }

  async book(p: PatientPrincipal, dto: { practitionerId: string; startAt: string; mode?: string; reason?: string; patientId?: string }) {
    const patientId = await this.subject(p, dto.patientId);
    const mode = dto.mode === 'TELEMEDICINE' ? 'TELEMEDICINE' : 'IN_PERSON';
    const start = new Date(dto.startAt);
    if (isNaN(start.getTime())) throw new BadRequestException('Invalid startAt');
    const date = new Date(start.getTime() + 180 * 60000).toISOString().slice(0, 10);
    const slot = (await this.slots(p.tenantId, dto.practitionerId, date, mode)).find((s) => s.startAt.getTime() === start.getTime());
    if (!slot) throw new ConflictException('That slot is no longer available');
    const facility = await this.prisma.facility.findFirstOrThrow({ where: { tenantId: p.tenantId }, orderBy: { createdAt: 'asc' } });
    const a = await this.prisma.appointment.create({ data: { tenantId: p.tenantId, facilityId: facility.id, patientId, practitionerId: dto.practitionerId, startAt: slot.startAt, endAt: slot.endAt, mode, reason: dto.reason, status: 'BOOKED' } });
    let telemedicine: unknown = null;
    if (mode === 'TELEMEDICINE') {
      const s = await this.tele.ensureBill(p.tenantId, a.id);
      telemedicine = { feeMinor: s.feeMinor, billId: s.billId };
    }
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_BOOK', entity: 'Appointment', entityId: a.id, data: { by: p.sub } });
    const { meetingUrl, ...rest } = a;
    return { ...rest, telemedicine };
  }

  async cancel(p: PatientPrincipal, id: string) {
    const ids = await this.familyIds(p);
    const a = await this.prisma.appointment.findFirst({ where: { id, tenantId: p.tenantId, patientId: { in: ids } } });
    if (!a) throw new NotFoundException('Appointment not found');
    if (!['BOOKED', 'CONFIRMED'].includes(a.status)) throw new BadRequestException(`Appointment is ${a.status}`);
    if (a.startAt.getTime() < Date.now()) throw new BadRequestException('Past appointments cannot be cancelled');
    if (a.mode === 'TELEMEDICINE') await this.tele.releaseOnCancel(p.tenantId, a.id);
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_CANCEL', entity: 'Appointment', entityId: a.id });
    const { meetingUrl, ...rest } = await this.prisma.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
    return rest;
  }

  // ───────── Telemedicine ─────────
  async telemedicineStatus(p: PatientPrincipal, appointmentId: string) {
    const ids = await this.familyIds(p);
    const a = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId: p.tenantId, patientId: { in: ids } } });
    if (!a) throw new NotFoundException('Appointment not found');
    const s = await this.tele.ensureBill(p.tenantId, a.id);
    const st = await this.tele.status(p.tenantId, a.id);
    return { appointmentId: a.id, startAt: a.startAt, status: a.status, paid: st.paid, amountDueMinor: st.amountDueMinor, billId: s.billId, feeMinor: s.feeMinor, doctorJoined: !!s.doctorJoinedAt };
  }
  async telemedicineJoin(p: PatientPrincipal, appointmentId: string) {
    return this.tele.patientJoin(p.tenantId, await this.familyIds(p), appointmentId);
  }

  // ───────── Clinical ─────────
  async results(p: PatientPrincipal, patientId?: string) {
    const id = await this.subject(p, patientId);
    const lab = await this.prisma.labResult.findMany({
      where: { tenantId: p.tenantId, verifiedAt: { not: null }, order: { visit: { patientId: id } } },
      include: { order: { select: { id: true, description: true, createdAt: true, visit: { select: { visitNumber: true } } } } }, orderBy: { verifiedAt: 'desc' }, take: 300,
    });
    const tests = await this.prisma.labTest.findMany({ where: { tenantId: p.tenantId, code: { in: [...new Set(lab.map((l) => l.testCode))] } }, select: { code: true, name: true, refRanges: true } });
    const imaging = await this.prisma.imagingReport.findMany({ where: { tenantId: p.tenantId, verifiedAt: { not: null }, order: { visit: { patientId: id } } }, include: { order: { select: { description: true } } }, orderBy: { verifiedAt: 'desc' } });
    const groups = new Map<string, any>();
    for (const r of lab) {
      const g = groups.get(r.orderId) ?? { orderId: r.orderId, test: r.order.description, visitNumber: r.order.visit.visitNumber, orderedAt: r.order.createdAt, verifiedAt: r.verifiedAt, results: [] };
      g.results.push({ code: r.testCode, name: tests.find((t) => t.code === r.testCode)?.name ?? r.testCode, value: r.value, unit: r.unit, flag: r.flag, isCritical: r.isCritical });
      groups.set(r.orderId, g);
    }
    return { lab: [...groups.values()], imaging: imaging.map((i) => ({ id: i.id, study: i.order.description, modality: i.modality, impression: i.impression, findings: i.findings, verifiedAt: i.verifiedAt })) };
  }

  async prescriptions(p: PatientPrincipal, patientId?: string) {
    const id = await this.subject(p, patientId);
    return this.prisma.prescription.findMany({
      where: { tenantId: p.tenantId, visit: { patientId: id }, status: { not: 'CANCELLED' } },
      select: { id: true, drugName: true, dose: true, route: true, frequency: true, durationDays: true, quantity: true, instructions: true, status: true, createdAt: true, visit: { select: { visitNumber: true, type: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async visits(p: PatientPrincipal, patientId?: string) {
    const id = await this.subject(p, patientId);
    const visits = await this.prisma.visit.findMany({
      where: { tenantId: p.tenantId, patientId: id, status: { not: 'CANCELLED' } }, orderBy: { startedAt: 'desc' }, take: 50,
      select: {
        id: true, visitNumber: true, type: true, status: true, startedAt: true, endedAt: true, practitionerId: true,
        diagnoses: { select: { code: true, display: true, type: true } },
        notes: { where: { signedAt: { not: null }, sensitive: false }, select: { type: true, assessment: true, plan: true, signedAt: true } },
        prescriptions: { select: { drugName: true, dose: true, frequency: true, durationDays: true } },
      },
    });
    const pr = await this.practitionerMap(p.tenantId, visits.map((v) => v.practitionerId).filter(Boolean) as string[]);
    return visits.map((v) => ({ ...v, practitioner: v.practitionerId ? pr.get(v.practitionerId)?.name : null }));
  }

  // ───────── Bills ─────────
  async bills(p: PatientPrincipal, patientId?: string) {
    const ids = patientId ? [await this.subject(p, patientId)] : await this.familyIds(p);
    const bills = await this.prisma.bill.findMany({
      where: { tenantId: p.tenantId, status: { not: 'VOID' }, visit: { patientId: { in: ids } } }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { lines: { where: { voided: false }, select: { description: true, quantity: true, totalMinor: true, payer: true } }, payments: { select: { receiptNumber: true, method: true, amountMinor: true, status: true, createdAt: true } }, visit: { select: { visitNumber: true, patientId: true, type: true } } },
    });
    const data = bills.map((b) => ({ ...b, balanceMinor: Math.max(b.patientAmountMinor - b.paidMinor, 0) }));
    return { data, totalBalanceMinor: data.reduce((s, b) => s + b.balanceMinor, 0) };
  }

  async payBill(p: PatientPrincipal, billId: string, phone?: string) {
    const ids = await this.familyIds(p);
    const bill = await this.prisma.bill.findFirst({ where: { id: billId, tenantId: p.tenantId, visit: { patientId: { in: ids } } } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status === 'VOID') throw new BadRequestException('Bill is void');
    const amount = Math.max(bill.patientAmountMinor - bill.paidMinor, 0);
    if (amount < 100) throw new BadRequestException('Nothing to pay on this bill');
    const payPhone = normalizePhone(phone || p.phone);
    const res = await withTenant(p.tenantId, () => this.mobileMoney.stkPush({ phone: payPhone, amountMinor: amount, accountRef: bill.billNumber, description: 'Hospital bill' }));
    const payment = await this.prisma.payment.create({
      data: {
        tenantId: p.tenantId, billId: bill.id, receiptNumber: await this.seq.next(p.tenantId, 'RECEIPT', 'RCT'), method: 'MPESA', amountMinor: Math.ceil(amount / 100) * 100,
        currency: bill.currency, reference: res.checkoutRequestId, status: 'PENDING', phone: payPhone, providerData: { checkoutRequestId: res.checkoutRequestId, initiate: res.raw as any, channel: 'PORTAL' },
      },
    });
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_STK', entity: 'Payment', entityId: payment.id, data: { billId: bill.id, amountMinor: payment.amountMinor } });
    return { paymentId: payment.id, status: payment.status, amountMinor: payment.amountMinor, checkoutRequestId: res.checkoutRequestId, message: 'Check your phone and enter your M-Pesa PIN' };
  }
  async paymentStatus(p: PatientPrincipal, paymentId: string) {
    const ids = await this.familyIds(p);
    const pay = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId: p.tenantId, bill: { visit: { patientId: { in: ids } } } }, select: { id: true, status: true, amountMinor: true, reference: true, receiptNumber: true } });
    if (!pay) throw new NotFoundException('Payment not found');
    return pay;
  }

  // ───────── SHA ─────────
  async shaStatus(p: PatientPrincipal, patientId?: string) {
    const id = await this.subject(p, patientId);
    const pt = await this.prisma.patient.findFirstOrThrow({ where: { id, tenantId: p.tenantId } });
    const facility = await this.prisma.facility.findFirst({ where: { tenantId: p.tenantId }, orderBy: { createdAt: 'asc' } });
    if (!pt.crId && !pt.idNumber) return { eligible: false, shaNumber: pt.shaNumber, message: 'No national ID or Client Registry ID on file. Please update at reception.' };
    try {
      const r = await withTenant(p.tenantId, () => this.nhi.checkEligibility({ crId: pt.crId ?? undefined, idNumber: pt.idNumber ?? undefined, facilityCode: facility?.shaFacilityId ?? facility?.kmhflCode ?? undefined, visitType: 'OPD' }));
      const { raw, ...rest } = r;
      return { ...rest, shaNumber: pt.shaNumber, checkedAt: new Date() };
    } catch (e: any) {
      return { eligible: false, shaNumber: pt.shaNumber, message: 'SHA service is unavailable right now. Please try again later.' };
    }
  }

  // ───────── Consents, feedback, record ─────────
  async consents(p: PatientPrincipal, patientId?: string) {
    const id = await this.subject(p, patientId);
    const rows = await this.prisma.consent.findMany({ where: { tenantId: p.tenantId, patientId: id }, orderBy: { createdAt: 'desc' } });
    return PORTAL_CONSENT_SCOPES.map((scope) => { const c = rows.find((r) => r.scope === scope); return { scope, granted: c ? c.granted : scope === 'SMS', updatedAt: c?.createdAt ?? null }; });
  }
  async setConsent(p: PatientPrincipal, scope: string, granted: boolean, patientId?: string) {
    if (!PORTAL_CONSENT_SCOPES.includes(scope)) throw new BadRequestException('Unknown consent scope');
    const id = await this.subject(p, patientId);
    await this.prisma.consent.create({ data: { tenantId: p.tenantId, patientId: id, scope, granted, method: 'OTP' } });
    if (scope === 'WHATSAPP') await this.setPreferences(p, { whatsapp: granted }, id);
    await this.audit.log({ tenantId: p.tenantId, action: 'CONSENT', entity: 'Patient', entityId: id, data: { scope, granted, via: 'PORTAL' } });
    return this.consents(p, id);
  }
  async feedback(p: PatientPrincipal, dto: { score: number; comment?: string; visitId?: string }) {
    if (dto.visitId && !(await this.prisma.visit.findFirst({ where: { id: dto.visitId, tenantId: p.tenantId, patientId: { in: await this.familyIds(p) } } }))) throw new NotFoundException('Visit not found');
    return this.prisma.patientFeedback.create({ data: { tenantId: p.tenantId, patientId: p.sub, visitId: dto.visitId, score: dto.score, comment: dto.comment } });
  }

  /** Full machine-readable copy of the patient's record (data-subject access, Kenya DPA s.26). */
  async record(p: PatientPrincipal, patientId?: string) {
    const id = await this.subject(p, patientId);
    const [profile, visits, results, prescriptions, bills, appointments, immunizations, consents] = await Promise.all([
      this.me(p, id), this.visits(p, id), this.results(p, id), this.prescriptions(p, id), this.bills(p, id), this.appointments(p, id),
      this.prisma.immunization.findMany({ where: { tenantId: p.tenantId, patientId: id }, orderBy: { dueDate: 'asc' } }),
      this.consents(p, id),
    ]);
    const vitals = await this.prisma.vitals.findMany({ where: { tenantId: p.tenantId, visit: { patientId: id } }, orderBy: { takenAt: 'desc' }, take: 100 });
    await this.audit.log({ tenantId: p.tenantId, action: 'RECORD_EXPORT', entity: 'Patient', entityId: id, data: { by: p.sub } });
    return { exportedAt: new Date().toISOString(), format: 'jmsurf-patient-record/v1', profile, visits, vitals, results, prescriptions, immunizations, appointments, bills: bills.data, consents };
  }

  // ───────── Public facility page ─────────
  async publicFacility(slug: string) {
    const t = await this.tenantBySlug(slug);
    const services = await this.prisma.serviceItem.findMany({ where: { tenantId: t.id, active: true, category: { in: ['CONSULTATION', 'LAB', 'IMAGING', 'PROCEDURE'] } }, select: { name: true, category: true, basePriceMinor: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 60 });
    return {
      slug: t.slug, name: t.name, logoUrl: t.logoUrl, primaryColor: t.primaryColor, currency: t.currency, countryCode: t.countryCode,
      telemedicine: t.enabledModules.includes('telemedicine'),
      facilities: t.facilities.map((f) => ({ id: f.id, name: f.name, county: f.county, address: f.address, phone: f.phone, email: f.email, level: f.level, kmhflCode: f.kmhflCode })),
      services, practitioners: await this.practitioners(t.id),
    };
  }
  async publicSlots(slug: string, practitionerId: string, date: string, mode?: string) {
    const t = await this.tenantBySlug(slug);
    return this.slots(t.id, practitionerId, date, mode);
  }
}
