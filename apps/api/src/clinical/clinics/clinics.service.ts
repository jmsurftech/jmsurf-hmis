import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../shared/pagination';
import { SupportBillingService } from '../support-common/support-billing.service';
import { FP_REVISIT_DAYS, ncdControlled } from './clinics.rules';
import { ClinicQuery, FpDto, NcdDto } from './clinics.dto';

@Injectable()
export class ClinicsService {
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}
  private async withPatients<T extends { patientId: string }>(t: string, rows: T[]) {
    const ps = await this.prisma.patient.findMany({ where: { tenantId: t, id: { in: rows.map((r) => r.patientId) } }, select: { id: true, firstName: true, lastName: true, mrn: true } });
    return rows.map((r) => ({ ...r, patient: ps.find((p) => p.id === r.patientId) }));
  }

  async fp(u: AuthUser, d: FpDto) {
    await this.sb.patient(u.tenantId, d.patientId);
    const visitDate = d.visitDate ? new Date(d.visitDate) : new Date();
    const next = d.nextVisitAt ? new Date(d.nextVisitAt) : FP_REVISIT_DAYS[d.method] ? new Date(visitDate.getTime() + FP_REVISIT_DAYS[d.method] * 86400000) : undefined;
    return this.prisma.fpRecord.create({ data: { tenantId: u.tenantId, ...d, visitDate, nextVisitAt: next, createdById: u.sub } });
  }
  listFp(t: string, q: ClinicQuery) {
    const where: Prisma.FpRecordWhereInput = { tenantId: t, ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.method ? { method: q.method } : {}) };
    return paginate(q, async (skip, take) => this.withPatients(t, await this.prisma.fpRecord.findMany({ where, skip, take, orderBy: { visitDate: 'desc' } })), () => this.prisma.fpRecord.count({ where }));
  }
  async fpSummary(t: string) {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const rows = await this.prisma.fpRecord.groupBy({ by: ['method', 'clientType'], where: { tenantId: t, visitDate: { gte: since } }, _count: { _all: true } });
    return rows.map((r) => ({ method: r.method, clientType: r.clientType, count: r._count._all }));
  }

  async ncd(u: AuthUser, d: NcdDto) {
    await this.sb.patient(u.tenantId, d.patientId);
    return this.prisma.ncdFollowUp.create({ data: { tenantId: u.tenantId, ...d, visitAt: d.visitAt ? new Date(d.visitAt) : undefined, nextVisitAt: d.nextVisitAt ? new Date(d.nextVisitAt) : undefined, controlled: ncdControlled(d.condition, d), createdById: u.sub } });
  }
  listNcd(t: string, q: ClinicQuery) {
    const where: Prisma.NcdFollowUpWhereInput = { tenantId: t, ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.condition ? { condition: q.condition } : {}) };
    return paginate(q, async (skip, take) => this.withPatients(t, await this.prisma.ncdFollowUp.findMany({ where, skip, take, orderBy: { visitAt: 'desc' } })), () => this.prisma.ncdFollowUp.count({ where }));
  }
  /** BP / glucose trend for one patient (oldest first). */
  async ncdTrend(t: string, patientId: string) {
    const rows = await this.prisma.ncdFollowUp.findMany({ where: { tenantId: t, patientId }, orderBy: { visitAt: 'asc' } });
    const last = rows.at(-1);
    return { patientId, visits: rows.length, controlled: last?.controlled ?? null, points: rows.map((r) => ({ date: r.visitAt, systolic: r.systolic, diastolic: r.diastolic, fbs: r.fbs, rbs: r.rbs, hba1c: r.hba1c, weightKg: r.weightKg, controlled: r.controlled })) };
  }
}
