import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { resolveFacilityId } from '../shared/facility';
import { BoardQueryDto, CallNextDto, CreateTicketDto } from './visits.dto';

const PREFIX: Record<string, string> = { TRIAGE: 'T', CONSULTATION: 'C', LAB: 'L', PHARMACY: 'P', CASHIER: 'K', RADIOLOGY: 'R', REGISTRATION: 'G', DENTAL: 'D', EYE: 'E', MATERNITY: 'M', DIALYSIS: 'Y', THEATRE: 'O', PROCEDURE: 'X' };
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

@Injectable()
export class QueueService {
  constructor(private prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateTicketDto) {
    const visit = await this.prisma.visit.findFirst({ where: { id: dto.visitId, tenantId: user.tenantId } });
    if (!visit) throw new NotFoundException('Visit not found');
    const existing = await this.prisma.queueTicket.findFirst({ where: { tenantId: user.tenantId, visitId: visit.id, servicePoint: dto.servicePoint, status: { in: ['WAITING', 'CALLED', 'SERVING'] } } });
    if (existing) return existing;
    const count = await this.prisma.queueTicket.count({ where: { tenantId: user.tenantId, facilityId: visit.facilityId, servicePoint: dto.servicePoint, createdAt: { gte: startOfDay() } } });
    const token = `${PREFIX[dto.servicePoint] ?? 'Q'}${String(count + 1).padStart(3, '0')}`;
    return this.prisma.queueTicket.create({
      data: { tenantId: user.tenantId, facilityId: visit.facilityId, visitId: visit.id, servicePoint: dto.servicePoint, token, priority: dto.priority ?? 3 },
    });
  }

  /** Re-prioritise all open tickets of a visit (e.g. after triage). */
  async reprioritise(tenantId: string, visitId: string, priority: number) {
    return this.prisma.queueTicket.updateMany({ where: { tenantId, visitId, status: 'WAITING' }, data: { priority } });
  }

  async callNext(user: AuthUser, dto: CallNextDto) {
    const facilityId = await resolveFacilityId(this.prisma, user, dto.facilityId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const next = await this.prisma.queueTicket.findFirst({
        where: { tenantId: user.tenantId, facilityId, servicePoint: dto.servicePoint, status: 'WAITING' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        include: { visit: { include: { patient: { select: { id: true, mrn: true, firstName: true, lastName: true } } } } },
      });
      if (!next) return null;
      const calledAt = new Date();
      const r = await this.prisma.queueTicket.updateMany({ where: { id: next.id, status: 'WAITING' }, data: { status: 'CALLED', calledAt } });
      if (r.count) return { ...next, status: 'CALLED', calledAt }; // else taken by another counter; retry
    }
    return null;
  }

  private async transition(user: AuthUser, id: string, from: string[], to: string, extra: object = {}) {
    const t = await this.prisma.queueTicket.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (!from.includes(t.status)) throw new BadRequestException(`Ticket is ${t.status}`);
    return this.prisma.queueTicket.update({ where: { id }, data: { status: to, ...extra } });
  }

  serve(user: AuthUser, id: string) { return this.transition(user, id, ['CALLED', 'WAITING'], 'SERVING', { calledAt: new Date() }); }
  skip(user: AuthUser, id: string) { return this.transition(user, id, ['WAITING', 'CALLED'], 'SKIPPED'); }
  requeue(user: AuthUser, id: string) { return this.transition(user, id, ['SKIPPED', 'CALLED'], 'WAITING'); }

  async done(user: AuthUser, id: string, nextServicePoint?: string) {
    const t = await this.transition(user, id, ['CALLED', 'SERVING'], 'DONE', { doneAt: new Date() });
    if (nextServicePoint) {
      const next = await this.create(user, { visitId: t.visitId, servicePoint: nextServicePoint, priority: t.priority });
      return { done: t, next };
    }
    return { done: t };
  }

  async board(user: AuthUser, q: BoardQueryDto) {
    const facilityId = await resolveFacilityId(this.prisma, user, q.facilityId);
    const tickets = await this.prisma.queueTicket.findMany({
      where: { tenantId: user.tenantId, facilityId, ...(q.servicePoint ? { servicePoint: q.servicePoint } : {}), OR: [{ status: { in: ['WAITING', 'CALLED', 'SERVING'] } }, { status: 'DONE', doneAt: { gte: startOfDay() } }] },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { visit: { select: { visitNumber: true, patient: { select: { id: true, firstName: true, lastName: true, mrn: true } } } } },
    });
    const now = Date.now();
    const byPoint: Record<string, { waiting: any[]; called: any[]; serving: any[]; doneToday: number; avgWaitMins: number | null }> = {};
    const waits: Record<string, number[]> = {};
    for (const tk of tickets) {
      const b = (byPoint[tk.servicePoint] ??= { waiting: [], called: [], serving: [], doneToday: 0, avgWaitMins: null });
      const view = { id: tk.id, visitId: tk.visitId, servicePoint: tk.servicePoint, calledAt: tk.calledAt, token: tk.token, priority: tk.priority, status: tk.status, waitingMins: Math.round((now - tk.createdAt.getTime()) / 60000), patient: tk.visit.patient, visitNumber: tk.visit.visitNumber };
      if (tk.status === 'WAITING') b.waiting.push(view);
      else if (tk.status === 'CALLED') b.called.push(view);
      else if (tk.status === 'SERVING') b.serving.push(view);
      else {
        b.doneToday++;
        if (tk.calledAt) (waits[tk.servicePoint] ??= []).push((tk.calledAt.getTime() - tk.createdAt.getTime()) / 60000);
      }
    }
    for (const [sp, w] of Object.entries(waits)) byPoint[sp].avgWaitMins = Math.round(w.reduce((a, b) => a + b, 0) / w.length);
    return byPoint;
  }
}
