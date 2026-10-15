import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { SupportBillingService } from '../support-common/support-billing.service';
import { storageDaysDue, totalStorageDays } from './mortuary.rules';
import { AssignCompartmentDto, BodyAdmissionDto, CaseQuery, CompartmentDto, CompartmentStatusDto, PmReportDto, PmRequestDto, ReleaseDto } from './mortuary.dto';

export const MORTUARY_DAILY_CODE = 'MORT-DAY';

@Injectable()
export class MortuaryService {
  private log = new Logger('Mortuary');
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}

  compartments(t: string) { return this.prisma.mortuaryCompartment.findMany({ where: { tenantId: t }, orderBy: { label: 'asc' } }); }
  createCompartment(u: AuthUser, d: CompartmentDto) { return this.prisma.mortuaryCompartment.create({ data: { tenantId: u.tenantId, label: d.label, type: d.type ?? 'COLD' } }); }
  async compartmentStatus(u: AuthUser, id: string, d: CompartmentStatusDto) {
    const c = await mustFind(this.prisma.mortuaryCompartment.findFirst({ where: { id, tenantId: u.tenantId } }), 'Compartment');
    if (c.status === 'OCCUPIED') throw new BadRequestException('Compartment is occupied');
    return this.prisma.mortuaryCompartment.update({ where: { id }, data: { status: d.status } });
  }
  private async takeCompartment(t: string, id: string) {
    const ok = await this.prisma.mortuaryCompartment.updateMany({ where: { id, tenantId: t, status: 'AVAILABLE' }, data: { status: 'OCCUPIED' } });
    if (!ok.count) throw new BadRequestException('Compartment is not available');
  }

  async admit(u: AuthUser, d: BodyAdmissionDto) {
    const t = u.tenantId;
    let patientId = d.patientId; let admissionId: string | undefined; let visitId: string | undefined;
    if (d.source === 'WARD_DEATH') {
      if (!d.admissionId) throw new BadRequestException('admissionId is required for a ward death');
      const a = await mustFind(this.prisma.admission.findFirst({ where: { id: d.admissionId, tenantId: t }, include: { visit: true } }), 'Admission');
      patientId = a.visit.patientId; admissionId = a.id;
      if (!a.dischargedAt) {
        await this.prisma.admission.update({ where: { id: a.id }, data: { dischargedAt: new Date(), dischargeType: 'DECEASED' } });
        if (a.bedId) await this.prisma.bed.update({ where: { id: a.bedId }, data: { status: 'CLEANING' } });
      }
      if (!['CLOSED', 'CANCELLED', 'DISCHARGED'].includes(a.visit.status)) visitId = a.visitId;
    } else if (!patientId) {
      if (!d.firstName || !d.lastName) throw new BadRequestException('patientId or firstName/lastName is required');
      const dob = d.ageYears != null ? new Date(Date.UTC(new Date().getUTCFullYear() - d.ageYears, 0, 1)) : undefined;
      const p = await this.prisma.patient.create({ data: { tenantId: t, mrn: await this.sb.next(t, 'MRN', 'MRN'), firstName: d.firstName, lastName: d.lastName, sex: (d.sex ?? 'UNKNOWN') as any, dateOfBirth: dob } });
      patientId = p.id;
    }
    const p = await this.sb.patient(t, patientId!);
    if (await this.prisma.mortuaryCase.findFirst({ where: { tenantId: t, patientId: p.id, status: 'IN_STORAGE' } })) throw new BadRequestException('Body already in storage');
    const dateOfDeath = d.dateOfDeath ? new Date(d.dateOfDeath) : p.deceasedAt ?? new Date();
    if (!p.deceasedAt) await this.prisma.patient.update({ where: { id: p.id }, data: { deceasedAt: dateOfDeath } });
    const visit = await this.sb.billableVisit(u, p.id, visitId);
    if (d.compartmentId) await this.takeCompartment(t, d.compartmentId);
    const ageYears = d.ageYears ?? (p.dateOfBirth ? Math.floor((dateOfDeath.getTime() - p.dateOfBirth.getTime()) / (365.25 * 86400000)) : undefined);
    const c = await this.prisma.mortuaryCase.create({ data: {
      tenantId: t, caseNumber: await this.sb.next(t, 'MORTUARY', 'MTY'), source: d.source, patientId: p.id, admissionId, visitId: visit.id,
      deceasedName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '), sex: p.sex, ageYears, dateOfDeath, causeOfDeath: d.causeOfDeath,
      broughtBy: d.broughtBy, policeObNumber: d.policeObNumber, compartmentId: d.compartmentId,
    } });
    await this.sb.chargeCode(t, 'MORT-ADMIT', { visitId: visit.id, sourceType: 'PROCEDURE', sourceId: c.id });
    await this.chargeCase(c.id);
    await this.sb.log(u, 'CREATE', 'MortuaryCase', c.id, { source: d.source, patientId: p.id });
    return c;
  }

  list(t: string, q: CaseQuery) {
    const where: Prisma.MortuaryCaseWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ deceasedName: { contains: q.q, mode: 'insensitive' } }, { caseNumber: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    return paginate(q, (skip, take) => this.prisma.mortuaryCase.findMany({ where, skip, take, orderBy: { admittedAt: 'desc' } }), () => this.prisma.mortuaryCase.count({ where }));
  }
  async get(t: string, id: string) {
    const c = await mustFind(this.prisma.mortuaryCase.findFirst({ where: { id, tenantId: t } }), 'Mortuary case');
    const compartment = c.compartmentId ? await this.prisma.mortuaryCompartment.findUnique({ where: { id: c.compartmentId } }) : null;
    const bill = await this.prisma.bill.findFirst({ where: { tenantId: t, visitId: c.visitId }, include: { lines: true } });
    return { ...c, compartment, storageDays: totalStorageDays(c.admittedAt, c.releasedAt ?? new Date()), bill };
  }
  async assign(u: AuthUser, id: string, d: AssignCompartmentDto) {
    const c = await this.inStorage(u.tenantId, id);
    await this.takeCompartment(u.tenantId, d.compartmentId);
    if (c.compartmentId) await this.prisma.mortuaryCompartment.update({ where: { id: c.compartmentId }, data: { status: 'AVAILABLE' } });
    return this.prisma.mortuaryCase.update({ where: { id }, data: { compartmentId: d.compartmentId } });
  }
  private async inStorage(t: string, id: string) {
    const c = await mustFind(this.prisma.mortuaryCase.findFirst({ where: { id, tenantId: t } }), 'Mortuary case');
    if (c.status !== 'IN_STORAGE') throw new BadRequestException(`Case is ${c.status}`);
    return c;
  }
  async requestPm(u: AuthUser, id: string, d: PmRequestDto) {
    await this.inStorage(u.tenantId, id);
    return this.prisma.mortuaryCase.update({ where: { id }, data: { pmStatus: 'REQUESTED', pmRequestedBy: d.requestedBy, pmReason: d.reason, pmRequestedAt: new Date() } });
  }
  async pmReport(u: AuthUser, id: string, d: PmReportDto) {
    const c = await this.inStorage(u.tenantId, id);
    if (c.pmStatus !== 'REQUESTED') throw new BadRequestException('No post-mortem requested');
    await this.sb.chargeCode(u.tenantId, 'MORT-PM', { visitId: c.visitId, sourceType: 'PROCEDURE', sourceId: c.id });
    await this.sb.log(u, 'UPDATE', 'MortuaryCase', id, { postMortem: 'DONE' });
    return this.prisma.mortuaryCase.update({ where: { id }, data: { pmStatus: 'DONE', pmPathologist: d.pathologist, pmFindings: d.findings, pmCauseOfDeath: d.causeOfDeath, pmCompletedAt: new Date() } });
  }
  async release(u: AuthUser, id: string, d: ReleaseDto) {
    const c = await this.inStorage(u.tenantId, id);
    if (c.pmStatus === 'REQUESTED') throw new BadRequestException('Post-mortem pending');
    await this.chargeCase(c.id);
    const now = new Date();
    const r = await this.prisma.mortuaryCase.update({ where: { id }, data: {
      status: 'RELEASED', releasedAt: now, releasedTo: d.releasedTo, releasedToIdNo: d.releasedToIdNo, releasedToRelationship: d.relationship,
      burialPermitNo: d.burialPermitNo, burialPermitDate: d.burialPermitDate ? new Date(d.burialPermitDate) : now, disposalMethod: d.disposalMethod ?? 'BURIAL', destination: d.destination,
    } });
    if (c.compartmentId) await this.prisma.mortuaryCompartment.update({ where: { id: c.compartmentId }, data: { status: 'AVAILABLE' } });
    await this.sb.log(u, 'UPDATE', 'MortuaryCase', id, { released: true, releasedTo: d.releasedTo, burialPermitNo: d.burialPermitNo });
    return r;
  }

  /** Charge storage days due for one case (claims the slot first so concurrent runs don't double-charge). */
  async chargeCase(id: string, now = new Date()) {
    const c = await this.prisma.mortuaryCase.findUnique({ where: { id } });
    if (!c || c.status !== 'IN_STORAGE') return 0;
    const days = storageDaysDue(c.admittedAt, c.lastChargedAt, now);
    if (days <= 0) return 0;
    const svc = await this.prisma.serviceItem.findFirst({ where: { tenantId: c.tenantId, code: MORTUARY_DAILY_CODE, active: true } });
    if (!svc) return 0;
    const claimed = await this.prisma.mortuaryCase.updateMany({ where: { id, lastChargedAt: c.lastChargedAt }, data: { lastChargedAt: now } });
    if (!claimed.count) return 0;
    await this.sb.chargeCode(c.tenantId, MORTUARY_DAILY_CODE, { visitId: c.visitId, sourceType: 'BED', sourceId: c.id, quantity: days, description: `Mortuary storage (${days} day${days > 1 ? 's' : ''})` });
    return days;
  }
  @Cron(CronExpression.EVERY_HOUR)
  async runDailyCharges(tenantId?: string) {
    const rows = await this.prisma.mortuaryCase.findMany({ where: { status: 'IN_STORAGE', ...(tenantId ? { tenantId } : {}) }, select: { id: true } });
    let days = 0;
    for (const r of rows) { try { days += await this.chargeCase(r.id); } catch (e) { this.log.error(`Mortuary charge failed for ${r.id}: ${e?.message}`); } }
    if (days) this.log.log(`Posted ${days} mortuary storage day(s)`);
    return { cases: rows.length, daysCharged: days };
  }
}
