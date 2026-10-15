import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { SequenceService } from '../../common/sequence.service';
import { BillingCoreService, ChargeInput } from '../../billing/billing-core.service';
import { AuditService } from '../../common/audit.service';
import { resolveFacilityId } from '../shared/facility';

/** Shared helpers for clinical support modules: visit resolution for billing, service-code charging, audit. */
@Injectable()
export class SupportBillingService {
  constructor(private prisma: PrismaService, private seq: SequenceService, private billing: BillingCoreService, private audit: AuditService) {}

  async patient(tenantId: string, id: string) {
    const p = await this.prisma.patient.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  /**
   * Return a billable visit for the patient: the given one (validated), the latest open visit, or a new one.
   * Bypasses the deceased check on purpose so mortuary services can be billed.
   */
  async billableVisit(user: AuthUser, patientId: string, visitId?: string | null, type: 'OPD' | 'EMERGENCY' = 'OPD') {
    const t = user.tenantId;
    if (visitId) {
      const v = await this.prisma.visit.findFirst({ where: { id: visitId, tenantId: t } });
      if (!v) throw new NotFoundException('Visit not found');
      if (v.patientId !== patientId) throw new BadRequestException('Visit belongs to another patient');
      return v;
    }
    const open = await this.prisma.visit.findFirst({ where: { tenantId: t, patientId, status: { in: ['OPEN', 'IN_PROGRESS', 'ADMITTED'] as any } }, orderBy: { startedAt: 'desc' } });
    if (open) return open;
    await this.patient(t, patientId);
    const cover = await this.prisma.memberCover.findFirst({ where: { tenantId: t, patientId, active: true } });
    const facilityId = await resolveFacilityId(this.prisma, user);
    return this.prisma.visit.create({
      data: { tenantId: t, facilityId, patientId, type, payerType: cover ? 'INSURANCE' : 'CASH', coverId: cover?.id, schemeId: (cover as any)?.schemeId, visitNumber: await this.seq.next(t, 'VISIT', 'V') },
    });
  }

  /** Charge a service item by code if it is configured (returns undefined otherwise). */
  async chargeCode(tenantId: string, code: string, input: Omit<ChargeInput, 'tenantId' | 'serviceItemId'>) {
    const svc = await this.prisma.serviceItem.findFirst({ where: { tenantId, code, active: true } });
    if (!svc) return undefined;
    return this.billing.charge({ ...input, tenantId, serviceItemId: svc.id });
  }

  log(user: AuthUser, action: string, entity: string, entityId?: string, data?: unknown) {
    return this.audit.log({ tenantId: user.tenantId, userId: user.sub, action, entity, entityId, data });
  }

  next(tenantId: string, name: string, prefix: string) { return this.seq.next(tenantId, name, prefix); }
}
