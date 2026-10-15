import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { BillingCoreService } from '../../billing/billing-core.service';
import { VisitsService } from '../visits/visits.service';
import { resolveFacilityId } from '../shared/facility';
import { dosesPerDay } from '../pharmacy/rx-checks';
import { bedDaysDue, marTimes } from './bed-charges';
import { AdmissionQuery, AdmitDto, BedBoardQuery, BedDto, DischargeDto, MarActionDto, ScheduleMarDto, TransferBedDto, UpdateWardDto, WardDto } from './inpatient.dto';

@Injectable()
export class InpatientService {
  private log = new Logger(InpatientService.name);
  constructor(private prisma: PrismaService, private audit: AuditService, private billing: BillingCoreService, private visits: VisitsService) {}

  // ── Wards & beds ──
  async createWard(user: AuthUser, dto: WardDto) {
    const facilityId = await resolveFacilityId(this.prisma, user, dto.facilityId);
    if (dto.dailyRateServiceId) await this.mustService(user.tenantId, dto.dailyRateServiceId);
    return this.prisma.ward.create({ data: { tenantId: user.tenantId, facilityId, name: dto.name, type: dto.type ?? 'GENERAL', dailyRateServiceId: dto.dailyRateServiceId } });
  }
  private async mustService(tenantId: string, id: string) {
    if (!(await this.prisma.serviceItem.findFirst({ where: { id, tenantId } }))) throw new NotFoundException('Service item not found');
  }
  listWards(tenantId: string) { return this.prisma.ward.findMany({ where: { tenantId }, include: { beds: { orderBy: { label: 'asc' } } }, orderBy: { name: 'asc' } }); }
  async mustWard(tenantId: string, id: string) {
    const w = await this.prisma.ward.findFirst({ where: { id, tenantId } });
    if (!w) throw new NotFoundException('Ward not found');
    return w;
  }
  async updateWard(user: AuthUser, id: string, dto: UpdateWardDto) {
    await this.mustWard(user.tenantId, id);
    if (dto.dailyRateServiceId) await this.mustService(user.tenantId, dto.dailyRateServiceId);
    const { facilityId, ...rest } = dto;
    return this.prisma.ward.update({ where: { id }, data: rest });
  }
  async deleteWard(user: AuthUser, id: string) {
    await this.mustWard(user.tenantId, id);
    if (await this.prisma.admission.count({ where: { tenantId: user.tenantId, wardId: id, dischargedAt: null } })) throw new BadRequestException('Ward has active admissions');
    await this.prisma.bed.deleteMany({ where: { wardId: id, tenantId: user.tenantId } });
    await this.prisma.ward.delete({ where: { id } });
    return { deleted: true };
  }
  async addBed(user: AuthUser, wardId: string, dto: BedDto) {
    await this.mustWard(user.tenantId, wardId);
    return this.prisma.bed.create({ data: { tenantId: user.tenantId, wardId, label: dto.label } });
  }
  async setBedStatus(user: AuthUser, id: string, status: string) {
    const b = await this.prisma.bed.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!b) throw new NotFoundException('Bed not found');
    if (b.status === 'OCCUPIED') throw new BadRequestException('Bed is occupied; discharge or transfer the patient first');
    return this.prisma.bed.update({ where: { id }, data: { status } });
  }
  async deleteBed(user: AuthUser, id: string) {
    const b = await this.prisma.bed.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!b) throw new NotFoundException('Bed not found');
    if (b.status === 'OCCUPIED') throw new BadRequestException('Bed is occupied');
    await this.prisma.bed.delete({ where: { id } });
    return { deleted: true };
  }

  async bedBoard(user: AuthUser, q: BedBoardQuery) {
    const wards = await this.prisma.ward.findMany({
      where: { tenantId: user.tenantId, ...(q.wardId ? { id: q.wardId } : {}), ...(q.facilityId ? { facilityId: q.facilityId } : {}) },
      include: { beds: { orderBy: { label: 'asc' } } }, orderBy: { name: 'asc' },
    });
    const adms = await this.prisma.admission.findMany({
      where: { tenantId: user.tenantId, dischargedAt: null, wardId: { in: wards.map((w) => w.id) } },
      include: { visit: { select: { id: true, visitNumber: true, payerType: true, patient: { select: { id: true, mrn: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } } } } },
    });
    const byBed = new Map(adms.filter((a) => a.bedId).map((a) => [a.bedId!, a]));
    const now = Date.now();
    return wards.map((w) => {
      const beds = w.beds.map((b) => {
        const a = byBed.get(b.id);
        return { ...b, admission: a ? { id: a.id, admittedAt: a.admittedAt, losDays: Math.ceil((now - a.admittedAt.getTime()) / 86400000), visit: a.visit } : null };
      });
      const count = (s: string) => beds.filter((b) => b.status === s).length;
      return {
        id: w.id, name: w.name, type: w.type, beds,
        stats: { total: beds.length, occupied: count('OCCUPIED'), available: count('AVAILABLE'), cleaning: count('CLEANING'), maintenance: count('MAINTENANCE'), reserved: count('RESERVED'), occupancyPct: beds.length ? Math.round((count('OCCUPIED') / beds.length) * 100) : 0 },
        unbedded: adms.filter((a) => a.wardId === w.id && !a.bedId).map((a) => ({ id: a.id, visit: a.visit })),
      };
    });
  }

  // ── ADT ──
  private async takeBed(tenantId: string, wardId: string, bedId?: string) {
    if (!bedId) return undefined;
    const bed = await this.prisma.bed.findFirst({ where: { id: bedId, tenantId, wardId } });
    if (!bed) throw new NotFoundException('Bed not found in that ward');
    const r = await this.prisma.bed.updateMany({ where: { id: bedId, status: { in: ['AVAILABLE', 'RESERVED'] } }, data: { status: 'OCCUPIED' } });
    if (!r.count) throw new BadRequestException(`Bed ${bed.label} is ${bed.status}`);
    return bed;
  }

  async admit(user: AuthUser, dto: AdmitDto) {
    const t = user.tenantId;
    await this.mustWard(t, dto.wardId);
    let visitId = dto.visitId;
    if (!visitId) {
      if (!dto.patientId) throw new BadRequestException('Provide visitId or patientId');
      const v = await this.visits.open(user, { patientId: dto.patientId, type: 'IPD' as any, payerType: dto.payerType, schemeId: dto.schemeId, skipConsultationFee: true, queueAt: 'NONE' });
      visitId = v.id;
    }
    const visit = await this.visits.mustBeActive(t, visitId);
    if (visit.status === 'ADMITTED') throw new BadRequestException('Visit already admitted');
    if (await this.prisma.admission.findUnique({ where: { visitId } })) throw new BadRequestException('Visit already has an admission record');
    await this.takeBed(t, dto.wardId, dto.bedId);
    try {
      const adm = await this.prisma.admission.create({
        data: { tenantId: t, visitId, wardId: dto.wardId, bedId: dto.bedId, admittedById: user.sub, reason: dto.reason, depositMinor: dto.depositMinor ?? 0 },
      });
      await this.prisma.visit.update({ where: { id: visitId }, data: { status: 'ADMITTED' } });
      await this.prisma.queueTicket.updateMany({ where: { tenantId: t, visitId, status: { in: ['WAITING', 'CALLED'] } }, data: { status: 'DONE', doneAt: new Date() } });
      await this.audit.log({ tenantId: t, userId: user.sub, action: 'ADMIT', entity: 'Admission', entityId: adm.id });
      await this.chargeAdmission(adm.id);
      return this.prisma.admission.findUniqueOrThrow({ where: { id: adm.id } });
    } catch (e) {
      if (dto.bedId) await this.prisma.bed.update({ where: { id: dto.bedId }, data: { status: 'AVAILABLE' } });
      throw e;
    }
  }

  private async activeAdmission(tenantId: string, id: string) {
    const a = await this.prisma.admission.findFirst({ where: { id, tenantId }, include: { visit: true } });
    if (!a) throw new NotFoundException('Admission not found');
    if (a.dischargedAt) throw new BadRequestException('Patient already discharged');
    return a;
  }

  async transfer(user: AuthUser, id: string, dto: TransferBedDto) {
    const t = user.tenantId;
    const a = await this.activeAdmission(t, id);
    await this.mustWard(t, dto.wardId);
    if (dto.bedId && dto.bedId === a.bedId) throw new BadRequestException('Patient is already in that bed');
    await this.chargeAdmission(a.id); // settle bed-days at the old ward's rate first
    await this.takeBed(t, dto.wardId, dto.bedId);
    if (a.bedId) await this.prisma.bed.update({ where: { id: a.bedId }, data: { status: 'CLEANING' } });
    const r = await this.prisma.admission.update({ where: { id }, data: { wardId: dto.wardId, bedId: dto.bedId ?? null } });
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'TRANSFER', entity: 'Admission', entityId: id, data: { fromWard: a.wardId, fromBed: a.bedId, ...dto } });
    return r;
  }

  async listAdmissions(tenantId: string, q: AdmissionQuery) {
    return this.prisma.admission.findMany({
      where: { tenantId, ...(q.wardId ? { wardId: q.wardId } : {}), ...(q.state === 'DISCHARGED' ? { dischargedAt: { not: null } } : { dischargedAt: null }) },
      include: { visit: { select: { id: true, visitNumber: true, patient: { select: { id: true, mrn: true, firstName: true, lastName: true } } } } },
      orderBy: { admittedAt: 'desc' }, take: 500,
    });
  }

  async getAdmission(tenantId: string, id: string) {
    const a = await this.prisma.admission.findFirst({ where: { id, tenantId }, include: { visit: { include: { patient: true, vitals: { orderBy: { takenAt: 'desc' }, take: 20 }, diagnoses: true, prescriptions: true } } } });
    if (!a) throw new NotFoundException('Admission not found');
    const mar = await this.prisma.medicationAdministration.findMany({ where: { tenantId, admissionId: id }, orderBy: { scheduledAt: 'asc' } });
    return { ...a, mar };
  }

  async discharge(user: AuthUser, id: string, dto: DischargeDto) {
    const t = user.tenantId;
    const a = await this.activeAdmission(t, id);
    await this.chargeAdmission(a.id);
    const now = new Date();
    const pendingRx = await this.prisma.prescription.count({ where: { tenantId: t, visitId: a.visitId, status: { in: ['PENDING', 'PARTIAL'] } } });
    await this.prisma.medicationAdministration.updateMany({ where: { tenantId: t, admissionId: id, status: 'SCHEDULED', scheduledAt: { gt: now } }, data: { status: 'HELD', note: 'Discharged' } });
    if (a.bedId) await this.prisma.bed.update({ where: { id: a.bedId }, data: { status: 'CLEANING' } });
    const adm = await this.prisma.admission.update({ where: { id }, data: { dischargedAt: now, dischargeType: dto.dischargeType ?? 'NORMAL', dischargeSummary: dto.summary } });
    await this.prisma.visit.update({ where: { id: a.visitId }, data: { status: 'DISCHARGED', endedAt: now } });
    await this.prisma.clinicalNote.create({ data: { tenantId: t, visitId: a.visitId, type: 'DISCHARGE', plan: dto.summary, authorId: user.sub, signedAt: now } });
    if (dto.dischargeType === 'DECEASED') await this.prisma.patient.update({ where: { id: a.visit.patientId }, data: { deceasedAt: now } });
    const bill = await this.prisma.bill.findFirst({ where: { tenantId: t, visitId: a.visitId, status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' } });
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'DISCHARGE', entity: 'Admission', entityId: id, data: { type: dto.dischargeType } });
    return {
      admission: adm,
      warnings: pendingRx ? [`${pendingRx} prescription(s) not fully dispensed`] : [],
      billing: bill ? { billId: bill.id, billNumber: bill.billNumber, patientBalanceMinor: Math.max(bill.patientAmountMinor - bill.paidMinor, 0) } : null,
      losDays: Math.max(1, Math.ceil((now.getTime() - a.admittedAt.getTime()) / 86400000)),
    };
  }

  // ── Daily bed charges ──
  /** Charge all bed-days due for one admission (idempotent within a day). */
  async chargeAdmission(admissionId: string) {
    const a = await this.prisma.admission.findUnique({ where: { id: admissionId } });
    if (!a || a.dischargedAt) return 0;
    const ward = await this.prisma.ward.findUnique({ where: { id: a.wardId } });
    if (!ward?.dailyRateServiceId) return 0;
    const now = new Date();
    const days = bedDaysDue(a.admittedAt, a.lastChargedAt, now);
    if (days <= 0) return 0;
    // claim the slot first so concurrent runs don't double-charge
    const claimed = await this.prisma.admission.updateMany({ where: { id: a.id, lastChargedAt: a.lastChargedAt }, data: { lastChargedAt: now } });
    if (!claimed.count) return 0;
    await this.billing.charge({ tenantId: a.tenantId, visitId: a.visitId, sourceType: 'BED', sourceId: a.id, serviceItemId: ward.dailyRateServiceId, quantity: days, description: `Bed charge – ${ward.name} (${days} day${days > 1 ? 's' : ''})` });
    return days;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runDailyBedCharges() {
    const active = await this.prisma.admission.findMany({ where: { dischargedAt: null }, select: { id: true } });
    let charged = 0;
    for (const a of active) {
      try { charged += await this.chargeAdmission(a.id); } catch (e) { this.log.error(`Bed charge failed for admission ${a.id}: ${e?.message}`); }
    }
    if (charged) this.log.log(`Posted ${charged} bed-day charge(s)`);
    return { admissions: active.length, bedDaysCharged: charged };
  }

  async runBedChargesForTenant(user: AuthUser) {
    const active = await this.prisma.admission.findMany({ where: { tenantId: user.tenantId, dischargedAt: null }, select: { id: true } });
    let charged = 0;
    for (const a of active) charged += await this.chargeAdmission(a.id);
    return { admissions: active.length, bedDaysCharged: charged };
  }

  // ── eMAR ──
  async scheduleMar(user: AuthUser, admissionId: string, dto: ScheduleMarDto) {
    const t = user.tenantId;
    const a = await this.activeAdmission(t, admissionId);
    const rx = await this.prisma.prescription.findFirst({ where: { id: dto.prescriptionId, tenantId: t, visitId: a.visitId } });
    if (!rx) throw new NotFoundException('Prescription not found on this admission');
    if (rx.status === 'CANCELLED') throw new BadRequestException('Prescription cancelled');
    const perDay = dosesPerDay(rx.frequency);
    if (!perDay) throw new BadRequestException('PRN prescriptions are recorded ad hoc, not scheduled');
    const days = dto.days ?? rx.durationDays ?? Math.max(1, Math.ceil(rx.quantity / perDay));
    const times = marTimes(dto.startAt ? new Date(dto.startAt) : new Date(), perDay, days);
    await this.prisma.medicationAdministration.deleteMany({ where: { tenantId: t, admissionId, prescriptionId: rx.id, status: 'SCHEDULED' } });
    await this.prisma.medicationAdministration.createMany({ data: times.map((s) => ({ tenantId: t, admissionId, prescriptionId: rx.id, scheduledAt: s })) });
    return this.listMar(t, admissionId);
  }

  /** PRN / ad-hoc administration record. */
  async adhocMar(user: AuthUser, admissionId: string, prescriptionId: string, note?: string) {
    const a = await this.activeAdmission(user.tenantId, admissionId);
    const rx = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, tenantId: user.tenantId, visitId: a.visitId } });
    if (!rx) throw new NotFoundException('Prescription not found on this admission');
    const now = new Date();
    return this.prisma.medicationAdministration.create({ data: { tenantId: user.tenantId, admissionId, prescriptionId, scheduledAt: now, givenAt: now, status: 'GIVEN', givenBy: user.sub, note } });
  }

  async listMar(tenantId: string, admissionId: string) {
    const rows = await this.prisma.medicationAdministration.findMany({ where: { tenantId, admissionId }, orderBy: { scheduledAt: 'asc' } });
    const rxs = await this.prisma.prescription.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.prescriptionId))] } }, select: { id: true, drugName: true, dose: true, route: true, frequency: true } });
    const rm = new Map(rxs.map((r) => [r.id, r]));
    const overdueBefore = Date.now() - 60 * 60000;
    return rows.map((r) => ({ ...r, prescription: rm.get(r.prescriptionId), overdue: r.status === 'SCHEDULED' && r.scheduledAt.getTime() < overdueBefore }));
  }

  async recordMar(user: AuthUser, marId: string, dto: MarActionDto) {
    const m = await this.prisma.medicationAdministration.findFirst({ where: { id: marId, tenantId: user.tenantId } });
    if (!m) throw new NotFoundException('MAR entry not found');
    if (m.status !== 'SCHEDULED') throw new BadRequestException(`Dose already recorded as ${m.status}`);
    if (dto.status !== 'GIVEN' && !dto.note) throw new BadRequestException('A reason is required when a dose is not given');
    return this.prisma.medicationAdministration.update({
      where: { id: marId },
      data: { status: dto.status, note: dto.note, givenBy: user.sub, givenAt: dto.status === 'GIVEN' ? (dto.givenAt ? new Date(dto.givenAt) : new Date()) : null },
    });
  }

  /** Missed-dose alerts across a ward: scheduled doses more than 1h overdue. */
  async overdueDoses(user: AuthUser, wardId?: string) {
    const adms = await this.prisma.admission.findMany({ where: { tenantId: user.tenantId, dischargedAt: null, ...(wardId ? { wardId } : {}) }, select: { id: true } });
    return this.prisma.medicationAdministration.findMany({
      where: { tenantId: user.tenantId, admissionId: { in: adms.map((a) => a.id) }, status: 'SCHEDULED', scheduledAt: { lt: new Date(Date.now() - 3600000) } },
      orderBy: { scheduledAt: 'asc' },
    });
  }
}
