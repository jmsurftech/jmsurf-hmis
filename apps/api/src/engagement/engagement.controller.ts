import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentPatient, PatientAuthGuard, PatientPrincipal } from './patient-auth';
import { PortalService } from './portal.service';
import { TelemedicineService } from './telemedicine.service';
import { MessagingService } from './messaging.service';
import { UssdService } from './ussd.service';
import { AvailabilityDto, BookDto, ConsentDto, EPrescribeDto, FeedbackDto, PatientScopeQuery, PayBillDto, PreferencesDto, RequestOtpDto, SlotsQuery, TemplateDto, VerifyOtpDto } from './engagement.dto';

/** Patient OTP login. Public to the staff guard; patients never receive a staff token. */
@Public()
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private svc: PortalService) {}
  @Post('request-otp') @HttpCode(200) request(@Body() dto: RequestOtpDto) { return this.svc.requestOtp(dto.tenant, dto.phone); }
  @Post('verify') @HttpCode(200) verify(@Body() dto: VerifyOtpDto) { return this.svc.verifyOtp(dto.tenant, dto.phone, dto.code); }
}

/** Patient portal & app API. @Public bypasses the staff JWT guard; PatientAuthGuard requires a patient token. */
@Public()
@UseGuards(PatientAuthGuard)
@Controller('portal')
export class PortalController {
  constructor(private svc: PortalService) {}
  @Get('me') me(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.me(p, q.patientId); }
  @Put('me/preferences') prefs(@CurrentPatient() p: PatientPrincipal, @Body() dto: PreferencesDto, @Query() q: PatientScopeQuery) { return this.svc.setPreferences(p, dto, q.patientId); }
  @Get('family') family(@CurrentPatient() p: PatientPrincipal) { return this.svc.family(p); }
  @Get('practitioners') practitioners(@CurrentPatient() p: PatientPrincipal) { return this.svc.practitioners(p.tenantId); }
  @Get('slots') slots(@CurrentPatient() p: PatientPrincipal, @Query() q: SlotsQuery) { return this.svc.slots(p.tenantId, q.practitionerId, q.date, q.mode); }
  @Get('appointments') appts(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.appointments(p, q.patientId); }
  @Post('appointments') book(@CurrentPatient() p: PatientPrincipal, @Body() dto: BookDto) { return this.svc.book(p, dto); }
  @Post('appointments/:id/cancel') @HttpCode(200) cancel(@CurrentPatient() p: PatientPrincipal, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(p, id); }
  @Get('appointments/:id/telemedicine') tele(@CurrentPatient() p: PatientPrincipal, @Param('id', ParseUUIDPipe) id: string) { return this.svc.telemedicineStatus(p, id); }
  @Post('appointments/:id/telemedicine/join') @HttpCode(200) join(@CurrentPatient() p: PatientPrincipal, @Param('id', ParseUUIDPipe) id: string) { return this.svc.telemedicineJoin(p, id); }
  @Get('results') results(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.results(p, q.patientId); }
  @Get('prescriptions') rx(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.prescriptions(p, q.patientId); }
  @Get('visits') visits(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.visits(p, q.patientId); }
  @Get('bills') bills(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.bills(p, q.patientId); }
  @Post('bills/:id/pay') @HttpCode(200) pay(@CurrentPatient() p: PatientPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayBillDto) { return this.svc.payBill(p, id, dto.phone); }
  @Get('payments/:id') payment(@CurrentPatient() p: PatientPrincipal, @Param('id', ParseUUIDPipe) id: string) { return this.svc.paymentStatus(p, id); }
  @Get('sha') sha(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.shaStatus(p, q.patientId); }
  @Get('consents') consents(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.consents(p, q.patientId); }
  @Put('consents') setConsent(@CurrentPatient() p: PatientPrincipal, @Body() dto: ConsentDto) { return this.svc.setConsent(p, dto.scope, dto.granted, dto.patientId); }
  @Post('feedback') feedback(@CurrentPatient() p: PatientPrincipal, @Body() dto: FeedbackDto) { return this.svc.feedback(p, dto); }
  @Get('record') @Header('Content-Disposition', 'attachment; filename="my-health-record.json"') record(@CurrentPatient() p: PatientPrincipal, @Query() q: PatientScopeQuery) { return this.svc.record(p, q.patientId); }
}

/** Public facility page data (no auth). */
@Public()
@Controller('public/facilities')
export class PublicFacilityController {
  constructor(private svc: PortalService) {}
  @Get(':slug') get(@Param('slug') slug: string) { return this.svc.publicFacility(slug); }
  @Get(':slug/slots') slots(@Param('slug') slug: string, @Query() q: SlotsQuery) { return this.svc.publicSlots(slug, q.practitionerId, q.date, q.mode); }
}

const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'];
@Controller('telemedicine')
export class TelemedicineController {
  constructor(private svc: TelemedicineService) {}
  @Get('sessions') @Roles(...CLIN, 'RECEPTION') list(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) { return this.svc.list(u.tenantId, from, to); }
  @Get(':appointmentId') @Roles(...CLIN, 'RECEPTION') status(@CurrentUser() u: AuthUser, @Param('appointmentId', ParseUUIDPipe) id: string) { return this.svc.status(u.tenantId, id); }
  @Post(':appointmentId/join') @HttpCode(200) @Roles('DOCTOR', 'CLINICAL_OFFICER') join(@CurrentUser() u: AuthUser, @Param('appointmentId', ParseUUIDPipe) id: string) { return this.svc.staffJoin(u, id); }
  @Post(':appointmentId/prescriptions') @Roles('DOCTOR', 'CLINICAL_OFFICER') rx(@CurrentUser() u: AuthUser, @Param('appointmentId', ParseUUIDPipe) id: string, @Body() dto: EPrescribeDto) { return this.svc.ePrescribe(u, id, dto.items, dto.notes); }
}

@Controller('messaging')
export class MessagingController {
  constructor(private svc: MessagingService, private prisma: PrismaService) {}
  @Get('templates') @Roles('MANAGER', 'RECEPTION') templates(@CurrentUser() u: AuthUser) { return this.svc.templates(u.tenantId); }
  @Put('templates') @Roles('MANAGER') upsert(@CurrentUser() u: AuthUser, @Body() dto: TemplateDto) { return this.svc.upsertTemplate(u.tenantId, dto.code, dto.lang, dto.body); }
  @Delete('templates/:code/:lang') @Roles('MANAGER') reset(@CurrentUser() u: AuthUser, @Param('code') code: string, @Param('lang') lang: string) { return this.svc.resetTemplate(u.tenantId, code, lang); }
  @Get('reminders') @Roles('MANAGER', 'RECEPTION') log(@CurrentUser() u: AuthUser, @Query() q: { page?: number; pageSize?: number; kind?: string; q?: string }) { return this.svc.reminderLog(u.tenantId, q); }
  @Post('reminders/run') @HttpCode(200) @Roles('MANAGER') run(@CurrentUser() u: AuthUser) { return this.svc.runForTenant(u.tenantId); }
  @Get('feedback') @Roles('MANAGER') async feedback(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.patientFeedback.findMany({ where: { tenantId: u.tenantId }, orderBy: { createdAt: 'desc' }, take: 200 });
    const n = rows.length, promoters = rows.filter((r) => r.score >= 9).length, detractors = rows.filter((r) => r.score <= 6).length;
    return { data: rows, total: n, nps: n ? Math.round(((promoters - detractors) / n) * 100) : null };
  }
  @Get('availability') @Roles('MANAGER', 'RECEPTION') availability(@CurrentUser() u: AuthUser, @Query('practitionerId') practitionerId?: string) {
    return this.prisma.practitionerAvailability.findMany({ where: { tenantId: u.tenantId, ...(practitionerId ? { practitionerId } : {}) }, orderBy: [{ practitionerId: 'asc' }, { weekday: 'asc' }] });
  }
  @Post('availability') @Roles('MANAGER') async addAvailability(@CurrentUser() u: AuthUser, @Body() dto: AvailabilityDto) {
    await this.prisma.practitioner.findFirstOrThrow({ where: { id: dto.practitionerId, tenantId: u.tenantId } });
    return this.prisma.practitionerAvailability.create({ data: { ...dto, tenantId: u.tenantId } });
  }
  @Delete('availability/:id') @Roles('MANAGER') async delAvailability(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.practitionerAvailability.deleteMany({ where: { id, tenantId: u.tenantId } });
    return { ok: true };
  }
}

/** Africa's Talking USSD callback (form-encoded: sessionId, serviceCode, phoneNumber, text). Replies text/plain CON/END. */
@Public()
@Controller('ussd')
export class UssdController {
  constructor(private svc: UssdService) {}
  @Post() @HttpCode(200) @Header('Content-Type', 'text/plain') root(@Body() body: any) { return this.svc.handle(undefined, body ?? {}); }
  @Post(':slug') @HttpCode(200) @Header('Content-Type', 'text/plain') bySlug(@Param('slug') slug: string, @Body() body: any) { return this.svc.handle(slug, body ?? {}); }
}
