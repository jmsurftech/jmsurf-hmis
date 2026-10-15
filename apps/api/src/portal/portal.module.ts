import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, HttpException, HttpStatus, Inject, Injectable, Logger, Module,
  NotFoundException, Param, Post, Res, UnauthorizedException, UseGuards, createParamDecorator,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { MailService } from '../common/mail.service';
import { Public } from '../common/auth-user';
import { SMS, SmsPort } from '../integrations/ports';
import { withTenant } from '../integrations/integration-context';
import { PaymentsModule } from '../revenue/payments/payments.module';
import { PaymentsService } from '../revenue/payments/payments.service';
import { TenantStatusCache } from '../platform/platform.module';

/** Portal tokens are signed with a different secret from staff tokens, so neither can be used as the other. */
const PORTAL_SECRET = () => `${process.env.JWT_SECRET || 'dev-secret'}::patient-portal`;
interface PortalUser { sub: string; tenantId: string; portal: true }

class OtpRequestDto { @IsString() @MinLength(5) @MaxLength(120) identifier: string; }
class OtpVerifyDto { @IsString() identifier: string; @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' }) code: string; }
class PasswordLoginDto { @IsString() identifier: string; @IsString() password: string; }
class SetPasswordDto { @IsString() @MinLength(8) password: string; }
class BookDto {
  @IsString() facilityId: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsISO8601() startAt: string;
  @IsOptional() @IsIn(['IN_PERSON', 'TELEMEDICINE']) mode?: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
class StkDto { @Matches(/^(\+?254|0)?[17]\d{8}$/, { message: 'Enter a Safaricom number, e.g. 07XX XXX XXX' }) phone: string; }

/** 0712…, 712…, +254712… and 254712… all become 254712…; emails are lower-cased. */
export function normaliseIdentifier(raw: string): { kind: 'phone' | 'email'; value: string } {
  const s = raw.trim();
  if (s.includes('@')) return { kind: 'email', value: s.toLowerCase() };
  const d = s.replace(/[^\d]/g, '');
  if (/^0[17]\d{8}$/.test(d)) return { kind: 'phone', value: `254${d.slice(1)}` };
  if (/^[17]\d{8}$/.test(d)) return { kind: 'phone', value: `254${d}` };
  if (/^254[17]\d{8}$/.test(d)) return { kind: 'phone', value: d };
  throw new BadRequestException('Enter the phone number or email address the hospital has on file');
}
const phoneVariants = (p: string) => [p, `+${p}`, `0${p.slice(3)}`, p.slice(3)];
const hashCode = (id: string, code: string) => createHash('sha256').update(`${id}:${code}:${process.env.JWT_SECRET || 'dev-secret'}`).digest('hex');

const Patient = createParamDecorator((_: unknown, ctx: ExecutionContext): PortalUser => ctx.switchToHttp().getRequest().portal);

@Injectable()
class PortalGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!m) throw new UnauthorizedException('Sign in to the patient portal');
    let p: PortalUser;
    try { p = this.jwt.verify(m[1], { secret: PORTAL_SECRET() }); } catch { throw new UnauthorizedException('Your portal session has ended. Sign in again.'); }
    if (!p?.portal || !p.sub || !p.tenantId) throw new UnauthorizedException('Sign in to the patient portal');
    const s = await TenantStatusCache.get(this.prisma, p.tenantId);
    if (s.suspended) throw new UnauthorizedException('This hospital portal is not available right now.');
    req.portal = p;
    return true;
  }
}

@Injectable()
export class PortalService {
  private log = new Logger('Portal');
  constructor(
    private prisma: PrismaService, private jwt: JwtService, private audit: AuditService, private mail: MailService,
    private payments: PaymentsService, @Inject(SMS) private sms: SmsPort,
  ) {}

  private matchWhere(id: { kind: 'phone' | 'email'; value: string }) {
    return id.kind === 'email'
      ? { email: { equals: id.value, mode: 'insensitive' as const }, mergedIntoId: null, deceasedAt: null }
      : { phone: { in: phoneVariants(id.value) }, mergedIntoId: null, deceasedAt: null };
  }
  private async profiles(patientIds: string[]) {
    const pts = await this.prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, tenantId: true, mrn: true, firstName: true, lastName: true } });
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: [...new Set(pts.map((p) => p.tenantId))] }, suspendedAt: null }, select: { id: true, name: true, logoUrl: true } });
    return pts.filter((p) => tenants.some((t) => t.id === p.tenantId)).map((p) => ({
      token: this.jwt.sign({ sub: p.id, tenantId: p.tenantId, portal: true }, { secret: PORTAL_SECRET(), expiresIn: '12h' }),
      patient: { id: p.id, mrn: p.mrn, firstName: p.firstName, lastName: p.lastName },
      hospital: tenants.find((t) => t.id === p.tenantId)!,
    }));
  }

  async requestOtp(dto: OtpRequestDto) {
    const id = normaliseIdentifier(dto.identifier);
    const recent = await this.prisma.portalOtp.count({ where: { identifier: id.value, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= 5) throw new HttpException('Too many codes requested. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    const pts = await this.prisma.patient.findMany({ where: this.matchWhere(id), select: { id: true, tenantId: true, firstName: true }, take: 10 });
    // Same answer whether or not we found a record, so the portal cannot be used to test who is a patient.
    if (!pts.length) return { ok: true, channel: id.kind };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = await this.prisma.portalOtp.create({ data: { identifier: id.value, codeHash: 'pending', expiresAt: new Date(Date.now() + 10 * 60_000) } });
    await this.prisma.portalOtp.update({ where: { id: otp.id }, data: { codeHash: hashCode(otp.id, code) } });
    const text = `${code} is your JMSURF HMIS patient portal code. It expires in 10 minutes. Do not share it.`;
    try {
      if (id.kind === 'phone') await withTenant(pts[0].tenantId, () => this.sms.send(id.value, text));
      else await this.mail.send(id.value, 'Your patient portal code', this.mail.layout(`Hello ${pts[0].firstName}`, `<p>Your sign-in code is</p><p style="font-size:28px;font-weight:800;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not ask for it, ignore this email.</p>`));
    } catch (e) { this.log.warn(`OTP delivery failed: ${(e as Error).message}`); }
    return { ok: true, channel: id.kind };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const id = normaliseIdentifier(dto.identifier);
    const otp = await this.prisma.portalOtp.findFirst({ where: { identifier: id.value, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!otp || otp.attempts >= 5) throw new BadRequestException('That code has expired. Ask for a new one.');
    if (otp.codeHash !== hashCode(otp.id, dto.code)) {
      await this.prisma.portalOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('That code is not correct.');
    }
    await this.prisma.portalOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    const pts = await this.prisma.patient.findMany({ where: this.matchWhere(id), select: { id: true }, take: 10 });
    const accounts = await this.profiles(pts.map((p) => p.id));
    if (!accounts.length) throw new BadRequestException('No patient record matches these details.');
    for (const a of accounts) await this.audit.log({ tenantId: a.hospital.id, action: 'PORTAL_LOGIN', entity: 'Patient', entityId: a.patient.id, data: { method: 'OTP' } });
    return { accounts, hasPassword: (await this.prisma.portalAccount.count({ where: { patientId: { in: pts.map((p) => p.id) } } })) > 0 };
  }

  async passwordLogin(dto: PasswordLoginDto) {
    const id = normaliseIdentifier(dto.identifier);
    const pts = await this.prisma.patient.findMany({ where: this.matchWhere(id), select: { id: true }, take: 10 });
    const accts = await this.prisma.portalAccount.findMany({ where: { patientId: { in: pts.map((p) => p.id) } } });
    const ok: string[] = [];
    for (const a of accts) if (await bcrypt.compare(dto.password, a.passwordHash)) ok.push(a.patientId);
    if (!ok.length) throw new UnauthorizedException('Those details do not match. Sign in with a code instead.');
    await this.prisma.portalAccount.updateMany({ where: { patientId: { in: ok } }, data: { lastLoginAt: new Date() } });
    const accounts = await this.profiles(ok);
    for (const a of accounts) await this.audit.log({ tenantId: a.hospital.id, action: 'PORTAL_LOGIN', entity: 'Patient', entityId: a.patient.id, data: { method: 'PASSWORD' } });
    return { accounts, hasPassword: true };
  }

  async setPassword(p: PortalUser, dto: SetPasswordDto) {
    const pt = await this.prisma.patient.findUnique({ where: { id: p.sub }, select: { email: true } });
    if (pt?.email?.endsWith('@demo.jmsurf.health')) throw new BadRequestException('The demo patient cannot change its password');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.portalAccount.upsert({ where: { patientId: p.sub }, update: { passwordHash }, create: { tenantId: p.tenantId, patientId: p.sub, passwordHash } });
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_SET_PASSWORD', entity: 'Patient', entityId: p.sub });
    return { ok: true };
  }

  async me(p: PortalUser) {
    const pt = await this.prisma.patient.findFirst({
      where: { id: p.sub, tenantId: p.tenantId },
      select: { id: true, mrn: true, firstName: true, middleName: true, lastName: true, sex: true, dateOfBirth: true, phone: true, email: true, bloodGroup: true, shaNumber: true, county: true,
        allergies: { select: { substance: true, reaction: true, severity: true } }, covers: { where: { active: true }, select: { id: true, memberNumber: true, validTo: true, scheme: { select: { name: true, payer: { select: { name: true } } } } } } },
    });
    if (!pt) throw new NotFoundException('Patient not found');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: p.tenantId }, select: { name: true, logoUrl: true, currency: true, facilities: { select: { id: true, name: true, phone: true, address: true } } } });
    const hasPassword = !!(await this.prisma.portalAccount.findUnique({ where: { patientId: p.sub }, select: { id: true } }));
    return { patient: pt, hospital: tenant, hasPassword };
  }

  async summary(p: PortalUser) {
    const now = new Date();
    const [next, results, rx, bills] = await Promise.all([
      this.prisma.appointment.findFirst({ where: { tenantId: p.tenantId, patientId: p.sub, startAt: { gte: now }, status: { in: ['BOOKED', 'CONFIRMED'] } }, orderBy: { startAt: 'asc' } }),
      this.prisma.order.count({ where: { tenantId: p.tenantId, visit: { patientId: p.sub }, OR: [{ labResults: { some: { verifiedAt: { not: null } } } }, { imagingReport: { verifiedAt: { not: null } } }] } }),
      this.prisma.prescription.count({ where: { tenantId: p.tenantId, visit: { patientId: p.sub }, status: { not: 'CANCELLED' } } }),
      this.prisma.bill.findMany({ where: { tenantId: p.tenantId, visit: { patientId: p.sub }, status: { not: 'VOID' } }, select: { patientAmountMinor: true, paidMinor: true } }),
    ]);
    return { nextAppointment: next, results, prescriptions: rx, balanceMinor: bills.reduce((a, b) => a + Math.max(b.patientAmountMinor - b.paidMinor, 0), 0) };
  }

  async bookingOptions(p: PortalUser) {
    const fac = await this.prisma.facility.findMany({ where: { tenantId: p.tenantId }, select: { id: true, name: true, departments: { where: { active: true, type: { notIn: ['ADMIN', 'PHARMACY', 'LAB', 'RADIOLOGY', 'THEATRE'] } }, select: { id: true, name: true, type: true } } } });
    return fac;
  }
  async appointments(p: PortalUser) {
    const rows = await this.prisma.appointment.findMany({ where: { tenantId: p.tenantId, patientId: p.sub }, orderBy: { startAt: 'desc' }, take: 100 });
    const [fac, dep] = await Promise.all([
      this.prisma.facility.findMany({ where: { tenantId: p.tenantId }, select: { id: true, name: true } }),
      this.prisma.department.findMany({ where: { tenantId: p.tenantId }, select: { id: true, name: true } }),
    ]);
    return rows.map((a) => ({ ...a, facility: fac.find((f) => f.id === a.facilityId)?.name, department: dep.find((d) => d.id === a.departmentId)?.name }));
  }
  async book(p: PortalUser, dto: BookDto) {
    const start = new Date(dto.startAt);
    if (start.getTime() < Date.now() + 30 * 60_000) throw new BadRequestException('Choose a time at least 30 minutes from now');
    if (start.getTime() > Date.now() + 180 * 86400000) throw new BadRequestException('Bookings open up to six months ahead');
    const fac = await this.prisma.facility.findFirst({ where: { id: dto.facilityId, tenantId: p.tenantId } });
    if (!fac) throw new BadRequestException('Choose a facility');
    if (dto.departmentId && !(await this.prisma.department.findFirst({ where: { id: dto.departmentId, facilityId: fac.id } }))) throw new BadRequestException('Choose a clinic');
    const open = await this.prisma.appointment.count({ where: { tenantId: p.tenantId, patientId: p.sub, startAt: { gte: new Date() }, status: { in: ['BOOKED', 'CONFIRMED'] } } });
    if (open >= 3) throw new BadRequestException('You already have three upcoming bookings. Cancel one to book another.');
    const a = await this.prisma.appointment.create({
      data: { tenantId: p.tenantId, facilityId: fac.id, patientId: p.sub, departmentId: dto.departmentId, startAt: start, endAt: new Date(start.getTime() + 30 * 60_000),
        mode: dto.mode ?? 'IN_PERSON', status: 'BOOKED', reason: dto.reason?.trim() ? `${dto.reason.trim()} (booked online)` : 'Booked online' },
    });
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_BOOK', entity: 'Appointment', entityId: a.id });
    return a;
  }
  async cancel(p: PortalUser, id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id, tenantId: p.tenantId, patientId: p.sub } });
    if (!a) throw new NotFoundException('Booking not found');
    if (!['BOOKED', 'CONFIRMED'].includes(a.status)) throw new BadRequestException('This booking can no longer be cancelled');
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_CANCEL', entity: 'Appointment', entityId: id });
    return this.prisma.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** Only verified results are shown to patients. */
  async results(p: PortalUser) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId: p.tenantId, visit: { patientId: p.sub }, type: { in: ['LAB', 'IMAGING'] } },
      orderBy: { createdAt: 'desc' }, take: 100,
      include: { labResults: { where: { verifiedAt: { not: null } } }, imagingReport: true, visit: { select: { visitNumber: true, startedAt: true } } },
    });
    const codes = [...new Set(orders.flatMap((o) => o.labResults.map((r) => r.testCode)))];
    const tests = await this.prisma.labTest.findMany({ where: { tenantId: p.tenantId, code: { in: codes } }, select: { code: true, name: true, refRanges: true } });
    return orders.map((o) => ({
      id: o.id, type: o.type, description: o.description, status: o.status, createdAt: o.createdAt, visit: o.visit,
      ready: o.labResults.length > 0 || !!o.imagingReport?.verifiedAt,
      lab: o.labResults.map((r) => ({ testCode: r.testCode, name: tests.find((t) => t.code === r.testCode)?.name ?? r.testCode, value: r.value, unit: r.unit, flag: r.flag, verifiedAt: r.verifiedAt })),
      imaging: o.imagingReport?.verifiedAt ? { modality: o.imagingReport.modality, findings: o.imagingReport.findings, impression: o.imagingReport.impression, verifiedAt: o.imagingReport.verifiedAt } : null,
    }));
  }
  prescriptions(p: PortalUser) {
    return this.prisma.prescription.findMany({
      where: { tenantId: p.tenantId, visit: { patientId: p.sub } }, orderBy: { createdAt: 'desc' }, take: 200,
      select: { id: true, drugName: true, dose: true, route: true, frequency: true, durationDays: true, quantity: true, instructions: true, status: true, createdAt: true, visit: { select: { visitNumber: true, startedAt: true } } },
    });
  }
  bills(p: PortalUser) {
    return this.prisma.bill.findMany({
      where: { tenantId: p.tenantId, visit: { patientId: p.sub }, status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { lines: { where: { voided: false }, select: { id: true, description: true, quantity: true, unitPriceMinor: true, totalMinor: true, payer: true } },
        payments: { where: { status: { in: ['COMPLETED', 'REFUNDED'] } }, select: { id: true, receiptNumber: true, method: true, amountMinor: true, reference: true, createdAt: true } },
        visit: { select: { visitNumber: true, startedAt: true, payerType: true } } },
    });
  }
  async payBill(p: PortalUser, billId: string, dto: StkDto) {
    const b = await this.prisma.bill.findFirst({ where: { id: billId, tenantId: p.tenantId, visit: { patientId: p.sub } } });
    if (!b) throw new NotFoundException('Bill not found');
    const pay = await this.payments.initiateStk(p.tenantId, 'PATIENT_PORTAL', { billId: b.id, phone: dto.phone });
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_STK', entity: 'Payment', entityId: pay.id, data: { billId: b.id, amountMinor: pay.amountMinor } });
    return { id: pay.id, status: pay.status, amountMinor: pay.amountMinor };
  }
  async payment(p: PortalUser, id: string) {
    const pay = await this.prisma.payment.findFirst({ where: { id, tenantId: p.tenantId, bill: { visit: { patientId: p.sub } } }, select: { id: true, status: true, reference: true, receiptNumber: true, amountMinor: true, providerData: true } });
    if (!pay) throw new NotFoundException('Payment not found');
    return { ...pay, providerData: { failure: (pay.providerData as any)?.failure } };
  }

  visits(p: PortalUser) {
    return this.prisma.visit.findMany({
      where: { tenantId: p.tenantId, patientId: p.sub }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, visitNumber: true, type: true, status: true, payerType: true, startedAt: true, endedAt: true, facilityId: true,
        diagnoses: { select: { code: true, display: true, type: true } }, _count: { select: { orders: true, prescriptions: true } } },
    });
  }

  /** Everything the patient can see, in one document, for download. Sensitive clinical notes are not included. */
  async record(p: PortalUser) {
    const [me, visits, results, rx, bills, appts] = await Promise.all([this.me(p), this.visits(p), this.results(p), this.prescriptions(p), this.bills(p), this.appointments(p)]);
    await this.audit.log({ tenantId: p.tenantId, action: 'PORTAL_EXPORT', entity: 'Patient', entityId: p.sub });
    return { generatedAt: new Date().toISOString(), hospital: me.hospital?.name, patient: me.patient, visits, results: results.filter((r) => r.ready), prescriptions: rx,
      bills: bills.map((b) => ({ billNumber: b.billNumber, date: b.createdAt, status: b.status, totalMinor: b.totalMinor, patientAmountMinor: b.patientAmountMinor, paidMinor: b.paidMinor, currency: b.currency, lines: b.lines, payments: b.payments })),
      appointments: appts };
  }
}

@Public()
@Controller('portal')
export class PortalAuthController {
  constructor(private svc: PortalService) {}
  @Post('otp/request') request(@Body() dto: OtpRequestDto) { return this.svc.requestOtp(dto); }
  @Post('otp/verify') verify(@Body() dto: OtpVerifyDto) { return this.svc.verifyOtp(dto); }
  @Post('login') login(@Body() dto: PasswordLoginDto) { return this.svc.passwordLogin(dto); }
}

@Public()
@UseGuards(PortalGuard)
@Controller('portal')
export class PortalController {
  constructor(private svc: PortalService) {}
  @Get('me') me(@Patient() p: PortalUser) { return this.svc.me(p); }
  @Get('summary') summary(@Patient() p: PortalUser) { return this.svc.summary(p); }
  @Post('password') password(@Patient() p: PortalUser, @Body() dto: SetPasswordDto) { return this.svc.setPassword(p, dto); }
  @Get('booking-options') options(@Patient() p: PortalUser) { return this.svc.bookingOptions(p); }
  @Get('appointments') appointments(@Patient() p: PortalUser) { return this.svc.appointments(p); }
  @Post('appointments') book(@Patient() p: PortalUser, @Body() dto: BookDto) { return this.svc.book(p, dto); }
  @Post('appointments/:id/cancel') cancel(@Patient() p: PortalUser, @Param('id') id: string) { return this.svc.cancel(p, id); }
  @Get('results') results(@Patient() p: PortalUser) { return this.svc.results(p); }
  @Get('prescriptions') prescriptions(@Patient() p: PortalUser) { return this.svc.prescriptions(p); }
  @Get('bills') bills(@Patient() p: PortalUser) { return this.svc.bills(p); }
  @Post('bills/:id/stk') pay(@Patient() p: PortalUser, @Param('id') id: string, @Body() dto: StkDto) { return this.svc.payBill(p, id, dto); }
  @Get('payments/:id') payment(@Patient() p: PortalUser, @Param('id') id: string) { return this.svc.payment(p, id); }
  @Get('visits') visits(@Patient() p: PortalUser) { return this.svc.visits(p); }
  @Get('record') async record(@Patient() p: PortalUser, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', 'attachment; filename="my-health-record.json"');
    return this.svc.record(p);
  }
}

@Module({
  imports: [JwtModule.register({}), PaymentsModule],
  controllers: [PortalAuthController, PortalController],
  providers: [PortalService, PortalGuard],
})
export class PortalModule {}
