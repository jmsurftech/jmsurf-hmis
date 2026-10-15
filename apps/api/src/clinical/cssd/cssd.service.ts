import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate, PageQueryDto } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { SupportBillingService } from '../support-common/support-billing.service';
import { cyclePassed } from './cssd.rules';
import { BiDto, CycleDto, CycleResultDto, InstrumentSetDto, IssueSetDto, RecallDto, SetQuery } from './cssd.dto';

@Injectable()
export class CssdService {
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}

  listSets(t: string, q: SetQuery) {
    const where: Prisma.InstrumentSetWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    return paginate(q, (skip, take) => this.prisma.instrumentSet.findMany({ where, skip, take, orderBy: { code: 'asc' } }), () => this.prisma.instrumentSet.count({ where }));
  }
  createSet(u: AuthUser, d: InstrumentSetDto) { return this.prisma.instrumentSet.create({ data: { tenantId: u.tenantId, code: d.code, name: d.name, department: d.department, items: d.items as any } }); }
  async getSet(t: string, id: string) {
    const s = await mustFind(this.prisma.instrumentSet.findFirst({ where: { id, tenantId: t } }), 'Instrument set');
    const issues = await this.prisma.setIssue.findMany({ where: { tenantId: t, setId: id }, orderBy: { issuedAt: 'desc' }, take: 50 });
    const cycles = await this.prisma.sterilisationCycle.findMany({ where: { tenantId: t, setIds: { has: id } }, orderBy: { startedAt: 'desc' }, take: 20 });
    return { ...s, issues, cycles };
  }

  listCycles(t: string, q: PageQueryDto) {
    const where: Prisma.SterilisationCycleWhereInput = { tenantId: t, ...(q.q ? { OR: [{ cycleNumber: { contains: q.q, mode: 'insensitive' } }, { machine: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    return paginate(q, (skip, take) => this.prisma.sterilisationCycle.findMany({ where, skip, take, orderBy: { startedAt: 'desc' } }), () => this.prisma.sterilisationCycle.count({ where }));
  }
  async startCycle(u: AuthUser, d: CycleDto) {
    const t = u.tenantId;
    const sets = await this.prisma.instrumentSet.findMany({ where: { tenantId: t, id: { in: d.setIds } } });
    if (sets.length !== new Set(d.setIds).size) throw new BadRequestException('Unknown instrument set in load');
    const busy = sets.filter((s) => ['PROCESSING', 'ISSUED'].includes(s.status));
    if (busy.length) throw new BadRequestException(`Sets not ready for reprocessing: ${busy.map((s) => `${s.code} (${s.status})`).join(', ')}`);
    const c = await this.prisma.sterilisationCycle.create({ data: { tenantId: t, cycleNumber: await this.sb.next(t, 'CSSD_CYCLE', 'CYC'), machine: d.machine, method: d.method ?? 'STEAM', setIds: d.setIds, temperatureC: d.temperatureC, pressureKpa: d.pressureKpa, durationMin: d.durationMin, operatorId: u.sub } });
    await this.prisma.instrumentSet.updateMany({ where: { tenantId: t, id: { in: d.setIds } }, data: { status: 'PROCESSING', lastCycleId: c.id } });
    return c;
  }
  async completeCycle(u: AuthUser, id: string, d: CycleResultDto) {
    const t = u.tenantId;
    const c = await mustFind(this.prisma.sterilisationCycle.findFirst({ where: { id, tenantId: t } }), 'Cycle');
    if (c.status !== 'RUNNING') throw new BadRequestException(`Cycle is ${c.status}`);
    const passed = cyclePassed(d);
    const r = await this.prisma.sterilisationCycle.update({ where: { id }, data: { endedAt: new Date(), chemicalIndicator: d.chemicalIndicator, biologicalIndicator: d.biologicalIndicator ?? 'PENDING', bowieDick: d.bowieDick, temperatureC: d.temperatureC ?? c.temperatureC, pressureKpa: d.pressureKpa ?? c.pressureKpa, durationMin: d.durationMin ?? c.durationMin, status: passed ? 'PASSED' : 'FAILED' } });
    await this.prisma.instrumentSet.updateMany({ where: { tenantId: t, id: { in: c.setIds } }, data: passed ? { status: 'STERILE', sterileUntil: new Date(Date.now() + (d.shelfLifeDays ?? 30) * 86400000) } : { status: 'DIRTY', sterileUntil: null } });
    return r;
  }
  /** Late biological-indicator result. A BI failure triggers an automatic recall. */
  async biResult(u: AuthUser, id: string, d: BiDto) {
    const c = await mustFind(this.prisma.sterilisationCycle.findFirst({ where: { id, tenantId: u.tenantId } }), 'Cycle');
    await this.prisma.sterilisationCycle.update({ where: { id }, data: { biologicalIndicator: d.biologicalIndicator } });
    if (d.biologicalIndicator === 'FAIL' && c.status !== 'RECALLED') return this.recall(u, id, { reason: 'Biological indicator failed' });
    return this.prisma.sterilisationCycle.findUnique({ where: { id } });
  }
  /** Recall a load: sets still in store are quarantined; returns every patient/surgery the load's sets were used on. */
  async recall(u: AuthUser, id: string, d: RecallDto) {
    const t = u.tenantId;
    const c = await mustFind(this.prisma.sterilisationCycle.findFirst({ where: { id, tenantId: t } }), 'Cycle');
    await this.prisma.sterilisationCycle.update({ where: { id }, data: { status: 'RECALLED', recallReason: d.reason } });
    await this.prisma.instrumentSet.updateMany({ where: { tenantId: t, id: { in: c.setIds }, lastCycleId: id }, data: { status: 'RECALLED', sterileUntil: null } });
    const exposures = await this.prisma.setIssue.findMany({ where: { tenantId: t, cycleId: id } });
    await this.sb.log(u, 'UPDATE', 'SterilisationCycle', id, { recall: d.reason, exposures: exposures.length });
    return { cycle: c.cycleNumber, reason: d.reason, exposures };
  }
  async recallReport(t: string, id: string) {
    const c = await mustFind(this.prisma.sterilisationCycle.findFirst({ where: { id, tenantId: t } }), 'Cycle');
    const exposures = await this.prisma.setIssue.findMany({ where: { tenantId: t, cycleId: id } });
    const sets = await this.prisma.instrumentSet.findMany({ where: { id: { in: c.setIds } } });
    return { ...c, sets, exposures };
  }

  /** Issue a sterile set to a theatre booking / patient (traceability link: set → cycle → patient). */
  async issue(u: AuthUser, setId: string, d: IssueSetDto) {
    const t = u.tenantId;
    const s = await mustFind(this.prisma.instrumentSet.findFirst({ where: { id: setId, tenantId: t } }), 'Instrument set');
    if (s.status !== 'STERILE') throw new BadRequestException(`Set is ${s.status}`);
    if (s.sterileUntil && s.sterileUntil < new Date()) throw new BadRequestException('Sterility has expired – reprocess the set');
    let patientId = d.patientId;
    if (d.surgeryId) {
      const sg = await mustFind(this.prisma.surgery.findFirst({ where: { id: d.surgeryId, tenantId: t } }), 'Surgery');
      const v = await this.prisma.visit.findUnique({ where: { id: sg.visitId } });
      patientId ??= v?.patientId;
    }
    if (patientId) await this.sb.patient(t, patientId);
    const issue = await this.prisma.setIssue.create({ data: { tenantId: t, setId, cycleId: s.lastCycleId, surgeryId: d.surgeryId, patientId, location: d.location } });
    await this.prisma.instrumentSet.update({ where: { id: setId }, data: { status: 'ISSUED' } });
    return issue;
  }
  async returnSet(u: AuthUser, setId: string) {
    const s = await mustFind(this.prisma.instrumentSet.findFirst({ where: { id: setId, tenantId: u.tenantId } }), 'Instrument set');
    await this.prisma.setIssue.updateMany({ where: { tenantId: u.tenantId, setId, returnedAt: null }, data: { returnedAt: new Date() } });
    return this.prisma.instrumentSet.update({ where: { id: setId }, data: { status: s.status === 'RECALLED' ? 'RECALLED' : 'DIRTY' } });
  }
  async patientTrace(t: string, patientId: string) {
    const issues = await this.prisma.setIssue.findMany({ where: { tenantId: t, patientId }, orderBy: { issuedAt: 'desc' } });
    const sets = await this.prisma.instrumentSet.findMany({ where: { id: { in: issues.map((i) => i.setId) } } });
    const cycles = await this.prisma.sterilisationCycle.findMany({ where: { id: { in: issues.map((i) => i.cycleId!).filter(Boolean) } } });
    return issues.map((i) => ({ ...i, set: sets.find((s) => s.id === i.setId), cycle: cycles.find((c) => c.id === i.cycleId) }));
  }
  issues(t: string, q: PageQueryDto) {
    const where = { tenantId: t };
    return paginate(q, async (skip, take) => {
      const rows = await this.prisma.setIssue.findMany({ where, skip, take, orderBy: { issuedAt: 'desc' } });
      const sets = await this.prisma.instrumentSet.findMany({ where: { id: { in: rows.map((r) => r.setId) } } });
      const cycles = await this.prisma.sterilisationCycle.findMany({ where: { id: { in: rows.map((r) => r.cycleId!).filter(Boolean) } } });
      return rows.map((r) => ({ ...r, set: sets.find((s) => s.id === r.setId), cycle: cycles.find((c) => c.id === r.cycleId) }));
    }, () => this.prisma.setIssue.count({ where }));
  }
}
