import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate, PageQueryDto } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { SupportBillingService } from '../support-common/support-billing.service';
import { bsaMosteller, cycleDates, plannedDose, ProtocolDrug } from './oncology.rules';
import { AdministerDto, BsaQuery, DelayDto, ProtocolDto, RegimenQuery, RegimenStartDto } from './oncology.dto';

@Injectable()
export class OncologyService {
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}
  private bsa(h: number, w: number) { try { return bsaMosteller(h, w); } catch (e) { throw new BadRequestException(e.message); } }

  protocols(t: string, q: PageQueryDto) {
    const where: Prisma.ChemoProtocolWhereInput = { tenantId: t, active: true, ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    return paginate(q, (skip, take) => this.prisma.chemoProtocol.findMany({ where, skip, take, orderBy: { code: 'asc' } }), () => this.prisma.chemoProtocol.count({ where }));
  }
  createProtocol(u: AuthUser, d: ProtocolDto) { return this.prisma.chemoProtocol.create({ data: { tenantId: u.tenantId, ...d, drugs: d.drugs as any } }); }
  calcBsa(q: BsaQuery) { return { heightCm: q.heightCm, weightKg: q.weightKg, bsa: this.bsa(q.heightCm, q.weightKg), formula: 'Mosteller' }; }

  /** Start a patient regimen: compute BSA, plan doses and schedule all cycles. */
  async start(u: AuthUser, d: RegimenStartDto) {
    const t = u.tenantId;
    await this.sb.patient(t, d.patientId);
    const p = await mustFind(this.prisma.chemoProtocol.findFirst({ where: { id: d.protocolId, tenantId: t } }), 'Protocol');
    const bsa = this.bsa(d.heightCm, d.weightKg);
    const mod = d.doseModPct ?? 100;
    const doses = (p.drugs as unknown as ProtocolDrug[]).map((x) => plannedDose(x, bsa, d.weightKg, mod));
    const dates = cycleDates(new Date(d.startDate), d.cycles ?? p.cycles, p.intervalDays);
    const r = await this.prisma.patientRegimen.create({ data: {
      tenantId: t, patientId: d.patientId, protocolId: p.id, heightCm: d.heightCm, weightKg: d.weightKg, bsa, doseModPct: mod, startDate: new Date(d.startDate),
      cycles: { create: dates.map((dt, i) => ({ tenantId: t, cycleNo: i + 1, scheduledDate: dt, plannedDoses: doses as any, bsa })) },
    }, include: { cycles: { orderBy: { cycleNo: 'asc' } } } });
    await this.sb.log(u, 'CREATE', 'PatientRegimen', r.id, { protocol: p.code, bsa, doseModPct: mod });
    return r;
  }
  regimens(t: string, q: RegimenQuery) {
    const where: Prisma.PatientRegimenWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.patientId ? { patientId: q.patientId } : {}) };
    return paginate(q, async (skip, take) => {
      const rows = await this.prisma.patientRegimen.findMany({ where, skip, take, orderBy: { startDate: 'desc' }, include: { cycles: { orderBy: { cycleNo: 'asc' } } } });
      const protos = await this.prisma.chemoProtocol.findMany({ where: { id: { in: rows.map((r) => r.protocolId) } } });
      return rows.map(({ cycles, ...r }) => ({ ...r, protocol: protos.find((p) => p.id === r.protocolId), cyclesTotal: cycles.length, cyclesGiven: cycles.filter((c) => c.status === 'ADMINISTERED').length, nextCycle: cycles.find((c) => c.status === 'SCHEDULED' || c.status === 'DELAYED') ?? null }));
    }, () => this.prisma.patientRegimen.count({ where }));
  }
  async regimen(t: string, id: string) {
    const r = await mustFind(this.prisma.patientRegimen.findFirst({ where: { id, tenantId: t }, include: { cycles: { orderBy: { cycleNo: 'asc' } } } }), 'Regimen');
    const protocol = await this.prisma.chemoProtocol.findUnique({ where: { id: r.protocolId } });
    return { ...r, protocol };
  }
  /** Upcoming cycles across patients (chemo day-care schedule). */
  async schedule(t: string, q: PageQueryDto) {
    const where: Prisma.ChemoCycleWhereInput = { tenantId: t, status: { in: ['SCHEDULED', 'DELAYED'] }, regimen: { status: 'ACTIVE' } };
    return paginate(q, async (skip, take) => {
      const rows = await this.prisma.chemoCycle.findMany({ where, skip, take, orderBy: { scheduledDate: 'asc' }, include: { regimen: true } });
      const protos = await this.prisma.chemoProtocol.findMany({ where: { id: { in: rows.map((r) => r.regimen.protocolId) } } });
      return rows.map((c) => ({ ...c, patientId: c.regimen.patientId, protocol: protos.find((p) => p.id === c.regimen.protocolId)?.code }));
    }, () => this.prisma.chemoCycle.count({ where }));
  }
  private async cycle(t: string, id: string) { return mustFind(this.prisma.chemoCycle.findFirst({ where: { id, tenantId: t }, include: { regimen: true } }), 'Cycle'); }
  /** Record administration. A new weight recalculates BSA and planned doses for this cycle. Charges CHEMO-ADMIN. */
  async administer(u: AuthUser, id: string, d: AdministerDto) {
    const t = u.tenantId;
    const c = await this.cycle(t, id);
    if (!['SCHEDULED', 'DELAYED'].includes(c.status)) throw new BadRequestException(`Cycle is ${c.status}`);
    const prev = await this.prisma.chemoCycle.findFirst({ where: { regimenId: c.regimenId, cycleNo: c.cycleNo - 1 } });
    if (prev && !['ADMINISTERED', 'CANCELLED'].includes(prev.status)) throw new BadRequestException(`Cycle ${prev.cycleNo} has not been given`);
    let planned = c.plannedDoses as any[]; let bsa = c.bsa ?? c.regimen.bsa;
    const weight = d.weightKg ?? c.regimen.weightKg;
    if (d.weightKg) {
      bsa = this.bsa(c.regimen.heightCm, d.weightKg);
      const p = await this.prisma.chemoProtocol.findUnique({ where: { id: c.regimen.protocolId } });
      planned = (p!.drugs as unknown as ProtocolDrug[]).map((x) => plannedDose(x, bsa, weight, c.regimen.doseModPct));
    }
    const given = d.givenDoses?.length ? d.givenDoses : planned.map((x) => ({ drug: x.drug, dose: x.dose, unit: x.unit, route: x.route }));
    const visit = await this.sb.billableVisit(u, c.regimen.patientId, d.visitId);
    const r = await this.prisma.chemoCycle.update({ where: { id }, data: { status: 'ADMINISTERED', administeredAt: new Date(), administeredById: u.sub, weightKg: weight, bsa, plannedDoses: planned, givenDoses: given as any, notes: d.notes, visitId: visit.id } });
    const charge = await this.sb.chargeCode(t, 'CHEMO-ADMIN', { visitId: visit.id, sourceType: 'PROCEDURE', sourceId: id, description: `Chemotherapy administration – cycle ${c.cycleNo}` });
    const remaining = await this.prisma.chemoCycle.count({ where: { regimenId: c.regimenId, status: { in: ['SCHEDULED', 'DELAYED'] } } });
    if (!remaining) await this.prisma.patientRegimen.update({ where: { id: c.regimenId }, data: { status: 'COMPLETED' } });
    await this.sb.log(u, 'UPDATE', 'ChemoCycle', id, { administered: given });
    return { ...r, charge };
  }
  /** Delay a cycle; optionally shift all following cycles by the same number of days. */
  async delay(u: AuthUser, id: string, d: DelayDto) {
    const c = await this.cycle(u.tenantId, id);
    if (!['SCHEDULED', 'DELAYED'].includes(c.status)) throw new BadRequestException(`Cycle is ${c.status}`);
    const nd = new Date(d.newDate); const shift = nd.getTime() - c.scheduledDate.getTime();
    if (d.shiftFollowing ?? true) {
      const later = await this.prisma.chemoCycle.findMany({ where: { regimenId: c.regimenId, cycleNo: { gt: c.cycleNo }, status: { in: ['SCHEDULED', 'DELAYED'] } } });
      for (const l of later) await this.prisma.chemoCycle.update({ where: { id: l.id }, data: { scheduledDate: new Date(l.scheduledDate.getTime() + shift) } });
    }
    return this.prisma.chemoCycle.update({ where: { id }, data: { status: 'DELAYED', scheduledDate: nd, notes: d.reason } });
  }
  async stop(u: AuthUser, id: string) {
    await mustFind(this.prisma.patientRegimen.findFirst({ where: { id, tenantId: u.tenantId } }), 'Regimen');
    await this.prisma.chemoCycle.updateMany({ where: { regimenId: id, status: { in: ['SCHEDULED', 'DELAYED'] } }, data: { status: 'CANCELLED' } });
    await this.sb.log(u, 'UPDATE', 'PatientRegimen', id, { stopped: true });
    return this.prisma.patientRegimen.update({ where: { id }, data: { status: 'STOPPED' } });
  }
}
