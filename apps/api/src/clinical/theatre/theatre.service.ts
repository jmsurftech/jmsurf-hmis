import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { BillingCoreService } from '../../billing/billing-core.service';
import { InventoryService } from '../inventory/inventory.service';
import { findClashes } from './clash';
import { AnaesthesiaDto, BookingDto, ChecklistDto, ClashQuery, CompleteDto, ConsumablesDto, OpNoteDto, RescheduleDto, ScheduleQuery } from './theatre.dto';

/** WHO Surgical Safety Checklist items per phase. */
export const WHO_CHECKLIST: Record<string, string[]> = {
  SIGN_IN: ['identityConfirmed', 'siteMarked', 'consentSigned', 'anaesthesiaCheckDone', 'pulseOximeterOn', 'allergyKnown', 'airwayRiskAssessed', 'bloodLossRiskAssessed'],
  TIME_OUT: ['teamIntroduced', 'patientSiteProcedureConfirmed', 'antibioticProphylaxisGiven', 'criticalEventsReviewed', 'imagingDisplayed', 'sterilityConfirmed'],
  SIGN_OUT: ['procedureRecorded', 'countsCorrect', 'specimenLabelled', 'equipmentProblemsAddressed', 'recoveryConcernsReviewed'],
};
const BUFFER_MINS = 15;

@Injectable()
export class TheatreService {
  constructor(private prisma: PrismaService, private audit: AuditService, private billing: BillingCoreService, private inventory: InventoryService) {}

  private async clashes(tenantId: string, p: { id?: string; theatre: string; surgeonId?: string | null; anaesthetistId?: string | null; scheduledStart: Date; scheduledEnd: Date }) {
    const dayStart = new Date(p.scheduledStart.getTime() - 24 * 3600000), dayEnd = new Date(p.scheduledEnd.getTime() + 24 * 3600000);
    const existing = await this.prisma.surgery.findMany({
      where: {
        tenantId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, scheduledStart: { lt: dayEnd }, scheduledEnd: { gt: dayStart },
        OR: [{ theatre: p.theatre }, ...(p.surgeonId ? [{ surgeonId: p.surgeonId }] : []), ...(p.anaesthetistId ? [{ anaesthetistId: p.anaesthetistId }] : [])],
      },
    });
    try { return findClashes(p, existing, BUFFER_MINS); } catch (e) { throw new BadRequestException(e.message); }
  }

  async checkClash(user: AuthUser, q: ClashQuery) {
    const c = await this.clashes(user.tenantId, { ...q, scheduledStart: new Date(q.scheduledStart), scheduledEnd: new Date(q.scheduledEnd) });
    return { available: c.length === 0, clashes: c };
  }

  async book(user: AuthUser, dto: BookingDto) {
    const t = user.tenantId;
    const visit = await this.prisma.visit.findFirst({ where: { id: dto.visitId, tenantId: t } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (['CLOSED', 'CANCELLED', 'DISCHARGED'].includes(visit.status)) throw new BadRequestException(`Visit is ${visit.status}`);
    const p = { ...dto, scheduledStart: new Date(dto.scheduledStart), scheduledEnd: new Date(dto.scheduledEnd) };
    const c = await this.clashes(t, p);
    if (c.length) throw new ConflictException({ message: 'Booking clashes with existing theatre schedule', clashes: c });
    const warnings = visit.payerType !== 'CASH' && !dto.preauthId ? ['Scheme patient: obtain pre-authorisation before the operation'] : [];
    const surgery = await this.prisma.surgery.create({ data: { ...p, tenantId: t, checklist: {} } });
    return { ...surgery, warnings };
  }

  async get(tenantId: string, id: string) {
    const s = await this.prisma.surgery.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Surgery booking not found');
    return s;
  }

  schedule(tenantId: string, q: ScheduleQuery) {
    return this.prisma.surgery.findMany({
      where: { tenantId, scheduledStart: { gte: new Date(q.from), lt: new Date(q.to) }, ...(q.theatre ? { theatre: q.theatre } : {}) },
      orderBy: [{ theatre: 'asc' }, { scheduledStart: 'asc' }],
    });
  }

  async reschedule(user: AuthUser, id: string, dto: RescheduleDto) {
    const s = await this.get(user.tenantId, id);
    if (s.status !== 'SCHEDULED') throw new BadRequestException(`Booking is ${s.status}`);
    const p = {
      id, theatre: dto.theatre ?? s.theatre, surgeonId: dto.surgeonId ?? s.surgeonId, anaesthetistId: dto.anaesthetistId ?? s.anaesthetistId,
      scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : s.scheduledStart, scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : s.scheduledEnd,
    };
    const c = await this.clashes(user.tenantId, p);
    if (c.length) throw new ConflictException({ message: 'Reschedule clashes with existing theatre schedule', clashes: c });
    const { id: _id, ...data } = p;
    return this.prisma.surgery.update({ where: { id }, data });
  }

  async cancel(user: AuthUser, id: string) {
    const s = await this.get(user.tenantId, id);
    if (s.status !== 'SCHEDULED') throw new BadRequestException(`Booking is ${s.status}`);
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CANCEL', entity: 'Surgery', entityId: id });
    return this.prisma.surgery.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async checklist(user: AuthUser, id: string, dto: ChecklistDto) {
    const s = await this.get(user.tenantId, id);
    if (['DONE', 'CANCELLED'].includes(s.status)) throw new BadRequestException(`Booking is ${s.status}`);
    const required = WHO_CHECKLIST[dto.phase];
    const missing = required.filter((k) => dto.items[k] !== true);
    const cl = (s.checklist as Record<string, any>) ?? {};
    cl[dto.phase] = { items: dto.items, notes: dto.notes, complete: missing.length === 0, by: user.sub, at: new Date().toISOString() };
    const r = await this.prisma.surgery.update({ where: { id }, data: { checklist: cl } });
    return { ...r, missing };
  }

  private phaseDone(s: { checklist: unknown }, phase: string) {
    return !!(s.checklist as Record<string, any> | null)?.[phase]?.complete;
  }

  async start(user: AuthUser, id: string) {
    const s = await this.get(user.tenantId, id);
    if (s.status !== 'SCHEDULED') throw new BadRequestException(`Booking is ${s.status}`);
    const missing = ['SIGN_IN', 'TIME_OUT'].filter((p) => !this.phaseDone(s, p));
    if (missing.length) throw new BadRequestException(`WHO checklist incomplete: ${missing.join(', ')}`);
    return this.prisma.surgery.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  }

  async anaesthesia(user: AuthUser, id: string, dto: AnaesthesiaDto) {
    await this.get(user.tenantId, id);
    return this.prisma.surgery.update({ where: { id }, data: { anaesthesia: dto.record as any } });
  }

  async opNote(user: AuthUser, id: string, dto: OpNoteDto) {
    const s = await this.get(user.tenantId, id);
    if (s.status !== 'IN_PROGRESS' && s.status !== 'DONE') throw new BadRequestException('Operation has not started');
    await this.prisma.clinicalNote.create({ data: { tenantId: user.tenantId, visitId: s.visitId, type: 'OPERATION', plan: dto.operationNote, data: { surgeryId: s.id, procedure: s.procedure, counts: dto.counts } as any, authorId: user.sub, signedAt: new Date() } });
    return this.prisma.surgery.update({ where: { id }, data: { operationNote: dto.operationNote } });
  }

  async consumables(user: AuthUser, id: string, dto: ConsumablesDto) {
    const t = user.tenantId;
    const s = await this.get(t, id);
    if (s.status === 'CANCELLED') throw new BadRequestException('Booking cancelled');
    await this.inventory.mustStore(t, dto.storeId);
    const issued = await this.prisma.$transaction(async (tx) => {
      const out = [];
      for (const l of dto.items) out.push({ itemId: l.itemId, batches: await this.inventory.issue({ tenantId: t, userId: user.sub, itemId: l.itemId, storeId: dto.storeId, quantity: l.quantity, type: 'ISSUE', reference: `SURGERY:${s.id}` }, tx) });
      return out;
    });
    const charges = [];
    for (const l of dto.items) charges.push(await this.billing.charge({ tenantId: t, visitId: s.visitId, sourceType: 'PROCEDURE', sourceId: s.id, stockItemId: l.itemId, quantity: l.quantity }));
    return { issued, charges };
  }

  async complete(user: AuthUser, id: string, dto: CompleteDto) {
    const t = user.tenantId;
    const s = await this.get(t, id);
    if (s.status !== 'IN_PROGRESS') throw new BadRequestException(`Booking is ${s.status}`);
    if (!this.phaseDone(s, 'SIGN_OUT')) throw new BadRequestException('WHO checklist SIGN_OUT incomplete');
    if (!s.operationNote) throw new BadRequestException('Operation note required');
    let charge;
    if (dto.serviceId) {
      if (!(await this.prisma.serviceItem.findFirst({ where: { id: dto.serviceId, tenantId: t } }))) throw new NotFoundException('Service item not found');
      charge = await this.billing.charge({ tenantId: t, visitId: s.visitId, sourceType: 'PROCEDURE', sourceId: s.id, serviceItemId: dto.serviceId, description: `Theatre: ${s.procedure}` });
    }
    const r = await this.prisma.surgery.update({ where: { id }, data: { status: 'DONE' } });
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'COMPLETE', entity: 'Surgery', entityId: id });
    return { ...r, charge };
  }
}
