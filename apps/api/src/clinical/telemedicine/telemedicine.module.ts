import { BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { VisitsModule } from '../visits/visits.module';
import { AppointmentsService } from '../visits/appointments.service';
import { joinWindowOpen, videoEmbeddable, videoRoomUrl } from './video';

const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'RECEPTION'];

/** Balance the patient still owes for a visit (0 when there is no bill or the payer covers it). */
export async function visitBalance(prisma: PrismaService, tenantId: string, visitId: string | null | undefined) {
  if (!visitId) return null;
  const bills = await prisma.bill.findMany({ where: { tenantId, visitId, status: { not: 'VOID' } }, select: { id: true, patientAmountMinor: true, paidMinor: true, currency: true } });
  return { billId: bills[0]?.id ?? null, dueMinor: bills.reduce((a, b) => a + Math.max(b.patientAmountMinor - b.paidMinor, 0), 0), currency: bills[0]?.currency ?? 'KES' };
}

@Injectable()
export class TelemedicineService {
  constructor(private prisma: PrismaService, private appts: AppointmentsService, private audit: AuditService) {}

  async sessions(u: AuthUser, from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date(start.getTime() + 8 * 86400000);
    const rows = await this.prisma.appointment.findMany({ where: { tenantId: u.tenantId, mode: 'TELEMEDICINE', startAt: { gte: start, lt: end } }, orderBy: { startAt: 'asc' } });
    const [patients, pracs] = await Promise.all([
      this.prisma.patient.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.patientId))] } }, select: { id: true, mrn: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } }),
      this.prisma.practitioner.findMany({ where: { tenantId: u.tenantId, id: { in: rows.map((r) => r.practitionerId).filter(Boolean) as string[] } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } }),
    ]);
    return Promise.all(rows.map(async (a) => ({
      ...a, patient: patients.find((p) => p.id === a.patientId), practitioner: pracs.find((p) => p.id === a.practitionerId)?.user ?? null,
      payment: await visitBalance(this.prisma, u.tenantId, a.visitId), joinable: joinWindowOpen(a),
    })));
  }

  async get(u: AuthUser, id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!a || a.mode !== 'TELEMEDICINE') throw new NotFoundException('Video consult not found');
    const patient = await this.prisma.patient.findFirst({ where: { id: a.patientId }, include: { allergies: true, covers: { where: { active: true }, include: { scheme: { select: { name: true } } } } } });
    const visit = a.visitId ? await this.prisma.visit.findFirst({ where: { id: a.visitId }, include: { diagnoses: true, prescriptions: { select: { id: true, drugName: true, dose: true, frequency: true, durationDays: true, status: true } } } }) : null;
    const last = await this.prisma.visit.findMany({ where: { tenantId: u.tenantId, patientId: a.patientId, id: { not: a.visitId ?? undefined } }, orderBy: { startedAt: 'desc' }, take: 5, include: { diagnoses: { select: { display: true } } } });
    return { ...a, patient, visit, recentVisits: last, payment: await visitBalance(this.prisma, u.tenantId, a.visitId), joinable: joinWindowOpen(a), embed: videoEmbeddable() };
  }

  /** Clinician starts the consult: opens the visit (if the patient has not already) and makes sure a room exists. */
  async start(u: AuthUser, id: string) {
    let a = await this.prisma.appointment.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!a || a.mode !== 'TELEMEDICINE') throw new NotFoundException('Video consult not found');
    if (['CANCELLED', 'NO_SHOW'].includes(a.status)) throw new BadRequestException(`This consult is ${a.status.toLowerCase().replace('_', ' ')}`);
    if (!a.visitId) { await this.appts.checkIn(u, id, {}); }
    if (!a.meetingUrl) await this.prisma.appointment.update({ where: { id }, data: { meetingUrl: videoRoomUrl() } });
    a = await this.prisma.appointment.findUniqueOrThrow({ where: { id } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'TELEMEDICINE_START', entity: 'Appointment', entityId: id });
    return this.get(u, id);
  }

  async end(u: AuthUser, id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!a) throw new NotFoundException('Video consult not found');
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'TELEMEDICINE_END', entity: 'Appointment', entityId: id });
    return this.prisma.appointment.update({ where: { id }, data: { status: 'DONE' } });
  }
}

@Controller('telemedicine')
export class TelemedicineController {
  constructor(private svc: TelemedicineService) {}
  @Get() @Roles(...CLIN) list(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) { return this.svc.sessions(u, from, to); }
  @Get(':id') @Roles(...CLIN) get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post(':id/start') @Roles('DOCTOR', 'CLINICAL_OFFICER', 'NURSE') start(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.start(u, id); }
  @Post(':id/end') @Roles('DOCTOR', 'CLINICAL_OFFICER', 'NURSE') end(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.end(u, id); }
}

@Module({ imports: [VisitsModule], controllers: [TelemedicineController], providers: [TelemedicineService] })
export class TelemedicineModule {}
