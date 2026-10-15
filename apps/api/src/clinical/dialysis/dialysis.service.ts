import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { VisitsService } from '../visits/visits.service';
import { BillingCoreService } from '../../billing/billing-core.service';
import { adequacy, ktvDaugirdas, recurringDates, urr } from './dialysis-calc';
import { CompleteSessionDto, RecurringDto, SessionDto, SessionQuery, StartSessionDto } from './dialysis.dto';

const SESSION_HOURS = 4;

@Injectable()
export class DialysisService {
  constructor(private prisma: PrismaService, private visits: VisitsService, private billing: BillingCoreService) {}

  private async chairFree(tenantId: string, chair: string, at: Date, hours = SESSION_HOURS) {
    const clash = await this.prisma.dialysisSession.findFirst({
      where: { tenantId, chair, status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, scheduledAt: { gt: new Date(at.getTime() - hours * 3600000), lt: new Date(at.getTime() + hours * 3600000) } },
    });
    return !clash;
  }

  async create(user: AuthUser, dto: SessionDto) {
    const t = user.tenantId;
    if (!(await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId: t } }))) throw new NotFoundException('Patient not found');
    const at = new Date(dto.scheduledAt);
    if (!(await this.chairFree(t, dto.chair, at))) throw new ConflictException(`Chair ${dto.chair} is booked at that time`);
    return this.prisma.dialysisSession.create({ data: { tenantId: t, patientId: dto.patientId, chair: dto.chair, machine: dto.machine, scheduledAt: at } });
  }

  async createRecurring(user: AuthUser, dto: RecurringDto) {
    const t = user.tenantId;
    if (!(await this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId: t } }))) throw new NotFoundException('Patient not found');
    const dates = recurringDates(new Date(dto.startDate), dto.weekdays, dto.weeks, dto.time);
    const created = [], skipped = [];
    for (const d of dates) {
      if (await this.chairFree(t, dto.chair, d, dto.durationHours ?? SESSION_HOURS)) created.push(await this.prisma.dialysisSession.create({ data: { tenantId: t, patientId: dto.patientId, chair: dto.chair, machine: dto.machine, scheduledAt: d } }));
      else skipped.push({ scheduledAt: d, reason: `Chair ${dto.chair} occupied` });
    }
    return { created, skipped };
  }

  list(tenantId: string, q: SessionQuery) {
    const where: Prisma.DialysisSessionWhereInput = {
      tenantId, ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.chair ? { chair: q.chair } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { scheduledAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    return this.prisma.dialysisSession.findMany({ where, orderBy: { scheduledAt: 'asc' }, take: 500 });
  }

  private async session(tenantId: string, id: string) {
    const s = await this.prisma.dialysisSession.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  /** Start: opens (or links) a visit and charges the 'DIALYSIS' service item if configured. */
  async start(user: AuthUser, id: string, dto: StartSessionDto) {
    const t = user.tenantId;
    const s = await this.session(t, id);
    if (s.status !== 'SCHEDULED') throw new BadRequestException(`Session is ${s.status}`);
    let visitId = dto.visitId;
    if (visitId) await this.visits.mustBeActive(t, visitId);
    else {
      const cover = await this.prisma.memberCover.findFirst({ where: { tenantId: t, patientId: s.patientId, active: true } });
      const v = await this.visits.open(user, { patientId: s.patientId, type: 'OPD' as any, payerType: cover ? 'INSURANCE' : 'CASH', coverId: cover?.id, skipConsultationFee: true, queueAt: 'NONE' });
      visitId = v.id;
    }
    const svc = await this.prisma.serviceItem.findFirst({ where: { tenantId: t, code: 'DIALYSIS', active: true } });
    const charge = svc ? await this.billing.charge({ tenantId: t, visitId, sourceType: 'PROCEDURE', sourceId: s.id, serviceItemId: svc.id }) : undefined;
    const r = await this.prisma.dialysisSession.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), visitId, preVitals: dto.preVitals as any, parameters: dto.parameters as any } });
    return { ...r, charge };
  }

  async complete(user: AuthUser, id: string, dto: CompleteSessionDto) {
    const s = await this.session(user.tenantId, id);
    if (s.status !== 'IN_PROGRESS') throw new BadRequestException(`Session is ${s.status}`);
    const endedAt = new Date();
    const hours = dto.hours ?? (s.startedAt ? (endedAt.getTime() - s.startedAt.getTime()) / 3600000 : SESSION_HOURS);
    const params: Record<string, unknown> = { ...((s.parameters as object) ?? {}), ...(dto.parameters ?? {}) };
    let ktv: number | undefined;
    if (dto.preUrea != null && dto.postUrea != null) {
      try {
        const u = urr(dto.preUrea, dto.postUrea);
        params.urr = u;
        params.preUrea = dto.preUrea; params.postUrea = dto.postUrea;
        if (dto.postWeightKg) {
          ktv = ktvDaugirdas(dto.preUrea, dto.postUrea, hours, dto.ufLitres ?? 0, dto.postWeightKg);
          Object.assign(params, adequacy(ktv, u));
        }
      } catch (e) { throw new BadRequestException(e.message); }
    }
    params.durationHours = Math.round(hours * 100) / 100;
    if (dto.ufLitres != null) params.ufLitres = dto.ufLitres;
    return this.prisma.dialysisSession.update({ where: { id }, data: { status: 'DONE', endedAt, postVitals: dto.postVitals as any, parameters: params as any, ktv } });
  }

  async cancel(user: AuthUser, id: string) {
    const s = await this.session(user.tenantId, id);
    if (s.status !== 'SCHEDULED') throw new BadRequestException(`Session is ${s.status}`);
    return this.prisma.dialysisSession.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async adequacyTrend(tenantId: string, patientId: string) {
    const rows = await this.prisma.dialysisSession.findMany({ where: { tenantId, patientId, status: 'DONE' }, orderBy: { scheduledAt: 'asc' } });
    const data = rows.map((r) => ({ id: r.id, date: r.scheduledAt, ktv: r.ktv, urr: (r.parameters as any)?.urr ?? null }));
    const withKtv = data.filter((d) => d.ktv != null);
    return {
      sessions: data,
      count: rows.length,
      meanKtv: withKtv.length ? Math.round((withKtv.reduce((a, d) => a + d.ktv!, 0) / withKtv.length) * 100) / 100 : null,
      pctAdequate: withKtv.length ? Math.round((withKtv.filter((d) => d.ktv! >= 1.2).length / withKtv.length) * 100) : null,
    };
  }
}
