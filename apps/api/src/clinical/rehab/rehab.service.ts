import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { SupportBillingService } from '../support-common/support-billing.service';
import { PlanQuery, PlanStatusDto, RehabPlanDto, RehabSessionDto } from './rehab.dto';

@Injectable()
export class RehabService {
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}
  async createPlan(u: AuthUser, d: RehabPlanDto) {
    await this.sb.patient(u.tenantId, d.patientId);
    return this.prisma.rehabPlan.create({ data: { tenantId: u.tenantId, ...d, startDate: d.startDate ? new Date(d.startDate) : undefined, therapistId: u.sub } });
  }
  list(t: string, q: PlanQuery) {
    const where: Prisma.RehabPlanWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.q ? { diagnosis: { contains: q.q, mode: 'insensitive' } } : {}) };
    return paginate(q, (skip, take) => this.prisma.rehabPlan.findMany({ where, skip, take, orderBy: { startDate: 'desc' }, include: { _count: { select: { sessions: true } } } }), () => this.prisma.rehabPlan.count({ where }));
  }
  async get(t: string, id: string) {
    const p = await mustFind(this.prisma.rehabPlan.findFirst({ where: { id, tenantId: t }, include: { sessions: { orderBy: { sessionAt: 'asc' } } } }), 'Plan');
    const scored = p.sessions.filter((s) => s.outcomeScore != null);
    const latest = scored.at(-1)?.outcomeScore ?? null;
    return { ...p, progress: { sessionsDone: p.sessions.length, baseline: p.baselineScore, latest, change: latest != null && p.baselineScore != null ? Math.round((latest - p.baselineScore) * 10) / 10 : null, target: p.targetScore }, trend: scored.map((s) => ({ date: s.sessionAt, score: s.outcomeScore, pain: s.painScore })) };
  }
  async session(u: AuthUser, planId: string, d: RehabSessionDto) {
    const t = u.tenantId;
    const p = await mustFind(this.prisma.rehabPlan.findFirst({ where: { id: planId, tenantId: t } }), 'Plan');
    if (p.status !== 'ACTIVE') throw new BadRequestException(`Plan is ${p.status}`);
    const visit = await this.sb.billableVisit(u, p.patientId, d.visitId);
    const s = await this.prisma.rehabSession.create({ data: { tenantId: t, planId, sessionAt: d.sessionAt ? new Date(d.sessionAt) : undefined, durationMin: d.durationMin, interventions: d.interventions, notes: d.notes, painScore: d.painScore, outcomeScore: d.outcomeScore, visitId: visit.id, therapistId: u.sub } });
    const charge = await this.sb.chargeCode(t, p.therapy === 'OT' ? 'OT-SESSION' : p.therapy === 'SPEECH' ? 'SPEECH-SESSION' : 'PHYSIO-SESSION', { visitId: visit.id, sourceType: 'PROCEDURE', sourceId: s.id })
      ?? await this.sb.chargeCode(t, 'PHYSIO-SESSION', { visitId: visit.id, sourceType: 'PROCEDURE', sourceId: s.id });
    const count = await this.prisma.rehabSession.count({ where: { planId } });
    if (count >= p.plannedSessions) await this.prisma.rehabPlan.update({ where: { id: planId }, data: { status: 'COMPLETED' } });
    return { ...s, charge };
  }
  async status(u: AuthUser, id: string, d: PlanStatusDto) {
    await mustFind(this.prisma.rehabPlan.findFirst({ where: { id, tenantId: u.tenantId } }), 'Plan');
    return this.prisma.rehabPlan.update({ where: { id }, data: { status: d.status } });
  }
}
