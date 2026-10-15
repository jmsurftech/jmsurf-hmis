import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { BillingCoreService } from '../../billing/billing-core.service';
import { NATIONAL_INSURANCE, NationalInsurancePort } from '../../integrations/ports';
import { paginate } from '../shared/pagination';
import { resolveFacilityId } from '../shared/facility';
import { OpenVisitDto, UpdateVisitDto, VisitQueryDto } from './visits.dto';
import { decryptNoteFields } from '../../common/field-crypto';
import { QueueService } from './queue.service';

@Injectable()
export class VisitsService {
  private log = new Logger(VisitsService.name);
  constructor(
    private prisma: PrismaService,
    private seq: SequenceService,
    private audit: AuditService,
    private billing: BillingCoreService,
    private queue: QueueService,
    @Inject(NATIONAL_INSURANCE) private nationalInsurance: NationalInsurancePort,
  ) {}

  async open(user: AuthUser, dto: OpenVisitDto) {
    const t = user.tenantId;
    const patient = await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId: t } });
    if (!patient) throw new NotFoundException('Patient not found');
    if (patient.mergedIntoId) throw new BadRequestException(`Patient was merged into ${patient.mergedIntoId}`);
    if (patient.deceasedAt) throw new BadRequestException('Patient is recorded as deceased');
    const facilityId = await resolveFacilityId(this.prisma, user, dto.facilityId);
    const payerType = dto.payerType ?? 'CASH';
    let schemeId = dto.schemeId;
    if (dto.coverId) {
      const cover = await this.prisma.memberCover.findFirst({ where: { id: dto.coverId, tenantId: t, patientId: patient.id } });
      if (!cover) throw new NotFoundException('Member cover not found for this patient');
      if (!cover.active || (cover.validTo && cover.validTo < new Date())) throw new BadRequestException('Member cover is inactive or expired');
      schemeId = cover.schemeId;
    }
    if (payerType === 'INSURANCE' && !schemeId) throw new BadRequestException('Insurance visits need a scheme or cover');
    const type = dto.type ?? 'OPD';
    let visit = await this.prisma.visit.create({
      data: {
        tenantId: t, facilityId, patientId: patient.id, type, payerType, schemeId, coverId: dto.coverId,
        departmentId: dto.departmentId, practitionerId: dto.practitionerId,
        visitNumber: await this.seq.next(t, 'VISIT', 'V'),
      },
    });

    let eligibility: unknown;
    if (payerType === 'SHA') {
      const r = await this.checkEligibility(user, visit.id);
      eligibility = r.check;
      visit = r.visit;
    }

    let consultationCharge: unknown;
    if (!dto.skipConsultationFee && ['OPD', 'EMERGENCY', 'REFERRAL', 'TELEMEDICINE'].includes(type)) {
      consultationCharge = await this.chargeConsultation(t, visit.id, dto.practitionerId);
    }

    let ticket: unknown;
    const queueAt = dto.queueAt ?? (['OPD', 'EMERGENCY', 'REFERRAL', 'WALK_IN'].includes(type) ? 'TRIAGE' : 'NONE');
    if (queueAt !== 'NONE') ticket = await this.queue.create(user, { visitId: visit.id, servicePoint: queueAt, priority: type === 'EMERGENCY' ? 1 : 3 });

    await this.audit.log({ tenantId: t, userId: user.sub, action: 'CREATE', entity: 'Visit', entityId: visit.id });
    return { ...visit, eligibility, consultationCharge, ticket };
  }

  /** Auto-charge consultation if a ServiceItem 'CONSULT' exists; practitioner fee overrides price. */
  async chargeConsultation(tenantId: string, visitId: string, practitionerId?: string) {
    const item = await this.prisma.serviceItem.findFirst({ where: { tenantId, code: 'CONSULT', active: true } });
    if (!item) return undefined;
    let unitPriceMinor: number | undefined;
    if (practitionerId) {
      const pr = await this.prisma.practitioner.findFirst({ where: { id: practitionerId, tenantId } });
      if (pr?.consultationFeeMinor != null) unitPriceMinor = pr.consultationFeeMinor;
    }
    return this.billing.charge({ tenantId, visitId, sourceType: 'CONSULTATION', sourceId: visitId, serviceItemId: item.id, unitPriceMinor });
  }

  /** SHA eligibility via the national insurance port; stores an EligibilityCheck and sets visit.shaFund. */
  async checkEligibility(user: AuthUser, visitId: string) {
    const t = user.tenantId;
    const visit = await this.mustGet(t, visitId);
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: visit.patientId } });
    const facility = await this.prisma.facility.findUnique({ where: { id: visit.facilityId } });
    const request = { crId: patient.crId ?? undefined, idNumber: patient.idNumber ?? undefined, facilityCode: facility?.shaFacilityId ?? facility?.kmhflCode ?? undefined, visitType: visit.type };
    let response: any;
    try {
      response = await this.nationalInsurance.checkEligibility(request);
    } catch (e) {
      this.log.warn(`Eligibility check failed: ${e?.message}`);
      response = { eligible: false, message: `Eligibility service error: ${e?.message ?? e}` };
    }
    const check = await this.prisma.eligibilityCheck.create({
      data: {
        tenantId: t, patientId: patient.id, payer: 'SHA', request: request as Prisma.InputJsonValue,
        response: JSON.parse(JSON.stringify(response ?? {})), eligible: response?.eligible ?? false, fund: response?.fund, reference: response?.reference,
      },
    });
    const updated = await this.prisma.visit.update({
      where: { id: visit.id },
      data: { shaFund: response?.eligible ? response.fund ?? null : null, eligibilityRef: response?.reference ?? null },
    });
    if (response?.memberNumber && !patient.shaNumber) await this.prisma.patient.update({ where: { id: patient.id }, data: { shaNumber: response.memberNumber } });
    return { check, visit: updated };
  }

  async mustGet(tenantId: string, id: string) {
    const v = await this.prisma.visit.findFirst({ where: { id, tenantId } });
    if (!v) throw new NotFoundException('Visit not found');
    return v;
  }

  async list(tenantId: string, q: VisitQueryDto) {
    const where: Prisma.VisitWhereInput = {
      tenantId,
      ...(q.status ? { status: { in: q.status.split(',') as any } } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.facilityId ? { facilityId: q.facilityId } : {}),
      ...(q.from || q.to ? { startedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.q ? { OR: [{ visitNumber: { contains: q.q, mode: 'insensitive' } }, { patient: { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { mrn: { contains: q.q, mode: 'insensitive' } }] } }] } : {}),
    };
    return paginate(
      q,
      (skip, take) => this.prisma.visit.findMany({ where, skip, take, orderBy: { startedAt: 'desc' }, include: { patient: { select: { id: true, mrn: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } } } }),
      () => this.prisma.visit.count({ where }),
    );
  }

  async get(user: AuthUser, id: string) {
    const canSensitive = user.isSuperAdmin || user.roles.some((r) => ['ADMIN', 'DOCTOR', 'CLINICAL_OFFICER'].includes(r));
    const v = await this.prisma.visit.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        patient: { include: { allergies: true } }, triage: true, vitals: { orderBy: { takenAt: 'desc' } },
        notes: { where: canSensitive ? {} : { sensitive: false }, orderBy: { createdAt: 'desc' } },
        diagnoses: true, orders: { include: { labResults: true, imagingReport: true, labSpecimen: true } },
        prescriptions: { include: { dispenses: true } }, bills: { include: { lines: true } }, queueTickets: true, admission: true,
      },
    });
    if (!v) throw new NotFoundException('Visit not found');
    return { ...v, notes: v.notes.map((n) => decryptNoteFields(n)) };
  }

  async update(user: AuthUser, id: string, dto: UpdateVisitDto) {
    const v = await this.mustGet(user.tenantId, id);
    if (['DISCHARGED', 'CLOSED', 'CANCELLED'].includes(v.status)) throw new BadRequestException(`Visit is ${v.status}`);
    return this.prisma.visit.update({ where: { id }, data: { ...dto, status: dto.status as any } });
  }

  async close(user: AuthUser, id: string) {
    const v = await this.mustGet(user.tenantId, id);
    if (v.status === 'ADMITTED') throw new BadRequestException('Admitted visits are closed via discharge');
    if (['CLOSED', 'CANCELLED'].includes(v.status)) throw new BadRequestException(`Visit already ${v.status}`);
    await this.prisma.queueTicket.updateMany({ where: { tenantId: user.tenantId, visitId: id, status: { in: ['WAITING', 'CALLED', 'SERVING'] } }, data: { status: 'DONE', doneAt: new Date() } });
    const r = await this.prisma.visit.update({ where: { id }, data: { status: 'CLOSED', endedAt: new Date() } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CLOSE', entity: 'Visit', entityId: id });
    return r;
  }

  /** Visits must be active for clinical actions (orders, notes, prescriptions). */
  async mustBeActive(tenantId: string, id: string) {
    const v = await this.mustGet(tenantId, id);
    if (['CLOSED', 'CANCELLED', 'DISCHARGED'].includes(v.status)) throw new BadRequestException(`Visit is ${v.status}`);
    return v;
  }
}
