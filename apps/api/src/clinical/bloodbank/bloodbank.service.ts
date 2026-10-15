import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate, PageQueryDto } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { SupportBillingService } from '../support-common/support-billing.service';
import { Abo, donorEligibility, expiryFor, groupLabel, isCompatible, parseGroup, Rh, ttiStatus } from './bloodbank.rules';
import {
  BloodRequestDto, CrossmatchDto, DeferDto, DonationDto, DonorDto, ExpiryQuery, GroupingDto, IssueDto, ReactionDto, RequestQuery, ScreeningDto,
  TransfusionEndDto, TransfusionStartDto, UnitDto, UnitQuery,
} from './bloodbank.dto';

@Injectable()
export class BloodBankService {
  private log = new Logger('BloodBank');
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}

  // ── Donors ──
  listDonors(t: string, q: PageQueryDto) {
    const where: Prisma.BloodDonorWhereInput = { tenantId: t, ...(q.q ? { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { donorNumber: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}) };
    return paginate(q, (skip, take) => this.prisma.bloodDonor.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), () => this.prisma.bloodDonor.count({ where }));
  }
  async createDonor(u: AuthUser, d: DonorDto) {
    return this.prisma.bloodDonor.create({ data: { ...d, tenantId: u.tenantId, dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : undefined, donorNumber: await this.sb.next(u.tenantId, 'BLOOD_DONOR', 'BD') } });
  }
  async donor(t: string, id: string) {
    const d = await mustFind(this.prisma.bloodDonor.findFirst({ where: { id, tenantId: t }, include: { donations: { orderBy: { donatedAt: 'desc' }, include: { units: true } } } }), 'Donor');
    return { ...d, eligibility: donorEligibility({ dateOfBirth: d.dateOfBirth, sex: d.sex, lastDonationAt: d.lastDonationAt, deferredUntil: d.deferredUntil }) };
  }
  async deferDonor(u: AuthUser, id: string, dto: DeferDto) {
    await mustFind(this.prisma.bloodDonor.findFirst({ where: { id, tenantId: u.tenantId } }), 'Donor');
    const r = await this.prisma.bloodDonor.update({ where: { id }, data: { eligible: false, deferralReason: dto.reason, deferredUntil: dto.until ? new Date(dto.until) : null } });
    await this.sb.log(u, 'UPDATE', 'BloodDonor', id, { deferred: dto });
    return r;
  }

  // ── Donations → units ──
  listDonations(t: string, q: PageQueryDto) {
    const where = { tenantId: t };
    return paginate(q, (skip, take) => this.prisma.bloodDonation.findMany({ where, skip, take, orderBy: { donatedAt: 'desc' }, include: { donor: true, units: true } }), () => this.prisma.bloodDonation.count({ where }));
  }
  async donate(u: AuthUser, dto: DonationDto) {
    const t = u.tenantId;
    const donor = await mustFind(this.prisma.bloodDonor.findFirst({ where: { id: dto.donorId, tenantId: t } }), 'Donor');
    const el = donorEligibility({ dateOfBirth: donor.dateOfBirth, sex: donor.sex, weightKg: dto.weightKg, hbGdl: dto.hbGdl, lastDonationAt: donor.lastDonationAt, deferredUntil: donor.deferredUntil });
    if (!el.eligible) {
      await this.prisma.bloodDonor.update({ where: { id: donor.id }, data: { eligible: false, deferralReason: el.reasons.join('; '), deferredUntil: el.deferredUntil ?? null } });
      throw new BadRequestException(`Donor deferred: ${el.reasons.join('; ')}`);
    }
    const abo = dto.abo ?? donor.abo; const rh = dto.rh ?? donor.rh;
    if (!abo || !rh) throw new BadRequestException('Donor blood group is required');
    const status = ttiStatus(dto.ttiResults);
    const now = new Date();
    const components = dto.components?.length ? dto.components : ['WHOLE_BLOOD'];
    return this.prisma.$transaction(async (tx) => {
      const donation = await tx.bloodDonation.create({ data: { tenantId: t, donorId: donor.id, volumeMl: dto.volumeMl ?? 450, hbGdl: dto.hbGdl, ttiResults: dto.ttiResults as any, ttiStatus: status, status: status === 'PENDING' ? 'COLLECTED' : status === 'FAILED' ? 'DISCARDED' : 'SCREENED', collectedById: u.sub } });
      for (const c of components) {
        await tx.bloodUnit.create({ data: { tenantId: t, donationId: donation.id, unitNumber: await this.sb.next(t, 'BLOOD_UNIT', 'BU'), abo, rh, component: c, volumeMl: c === 'WHOLE_BLOOD' ? dto.volumeMl ?? 450 : c === 'PRBC' ? 280 : c === 'FFP' ? 200 : 50, collectedAt: now, expiresAt: expiryFor(c, now), status: status === 'PASSED' ? 'AVAILABLE' : status === 'FAILED' ? 'DISCARDED' : 'QUARANTINE' } });
      }
      await tx.bloodDonor.update({ where: { id: donor.id }, data: { abo, rh, lastDonationAt: now, eligible: status !== 'FAILED', ...(status === 'FAILED' ? { deferralReason: 'Reactive TTI screen – permanent deferral, refer for counselling' } : {}) } });
      return tx.bloodDonation.findUnique({ where: { id: donation.id }, include: { units: true } });
    });
  }
  async screen(u: AuthUser, id: string, dto: ScreeningDto) {
    const d = await mustFind(this.prisma.bloodDonation.findFirst({ where: { id, tenantId: u.tenantId } }), 'Donation');
    const results = { hiv: dto.hiv, hbv: dto.hbv, hcv: dto.hcv, syphilis: dto.syphilis, malaria: dto.malaria };
    const status = ttiStatus(results);
    await this.prisma.bloodDonation.update({ where: { id }, data: { ttiResults: results, ttiStatus: status, status: status === 'PENDING' ? 'COLLECTED' : status === 'FAILED' ? 'DISCARDED' : 'SCREENED' } });
    await this.prisma.bloodUnit.updateMany({ where: { donationId: id, status: 'QUARANTINE' }, data: { status: status === 'PASSED' ? 'AVAILABLE' : status === 'FAILED' ? 'DISCARDED' : 'QUARANTINE', ...(dto.abo && dto.rh ? { abo: dto.abo, rh: dto.rh } : {}) } });
    if (status === 'FAILED') await this.prisma.bloodDonor.update({ where: { id: d.donorId }, data: { eligible: false, deferralReason: 'Reactive TTI screen – permanent deferral, refer for counselling' } });
    await this.sb.log(u, 'UPDATE', 'BloodDonation', id, { ttiStatus: status });
    return this.prisma.bloodDonation.findUnique({ where: { id }, include: { units: true } });
  }

  // ── Units & inventory ──
  listUnits(t: string, q: UnitQuery) {
    const where: Prisma.BloodUnitWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.abo ? { abo: q.abo } : {}), ...(q.rh ? { rh: q.rh } : {}), ...(q.component ? { component: q.component } : {}), ...(q.q ? { unitNumber: { contains: q.q, mode: 'insensitive' } } : {}) };
    return paginate(q, (skip, take) => this.prisma.bloodUnit.findMany({ where, skip, take, orderBy: { expiresAt: 'asc' } }), () => this.prisma.bloodUnit.count({ where }));
  }
  receiveUnit(u: AuthUser, d: UnitDto) {
    const collectedAt = d.collectedAt ? new Date(d.collectedAt) : new Date();
    return this.prisma.bloodUnit.create({ data: { tenantId: u.tenantId, unitNumber: d.unitNumber, abo: d.abo, rh: d.rh, component: d.component, volumeMl: d.volumeMl ?? 450, collectedAt, expiresAt: d.expiresAt ? new Date(d.expiresAt) : expiryFor(d.component, collectedAt), status: 'AVAILABLE' } });
  }
  async discardUnit(u: AuthUser, id: string) {
    const unit = await mustFind(this.prisma.bloodUnit.findFirst({ where: { id, tenantId: u.tenantId } }), 'Unit');
    if (['ISSUED', 'TRANSFUSED'].includes(unit.status)) throw new BadRequestException(`Unit is ${unit.status}`);
    await this.sb.log(u, 'UPDATE', 'BloodUnit', id, { discarded: true });
    return this.prisma.bloodUnit.update({ where: { id }, data: { status: 'DISCARDED', reservedForRequestId: null } });
  }
  async inventory(t: string) {
    const rows = await this.prisma.bloodUnit.groupBy({ by: ['abo', 'rh', 'component', 'status'], where: { tenantId: t, status: { in: ['AVAILABLE', 'RESERVED', 'QUARANTINE'] } }, _count: { _all: true } });
    const soon = new Date(Date.now() + 3 * 86400000);
    const expiring = await this.prisma.bloodUnit.groupBy({ by: ['abo', 'rh', 'component'], where: { tenantId: t, status: 'AVAILABLE', expiresAt: { lte: soon } }, _count: { _all: true } });
    const map = new Map<string, any>();
    for (const r of rows) {
      const k = `${groupLabel(r.abo, r.rh)}|${r.component}`;
      const e = map.get(k) ?? { group: groupLabel(r.abo, r.rh), abo: r.abo, rh: r.rh, component: r.component, available: 0, reserved: 0, quarantine: 0, expiringIn3Days: 0 };
      e[r.status === 'AVAILABLE' ? 'available' : r.status === 'RESERVED' ? 'reserved' : 'quarantine'] += r._count._all;
      map.set(k, e);
    }
    for (const r of expiring) { const e = map.get(`${groupLabel(r.abo, r.rh)}|${r.component}`); if (e) e.expiringIn3Days = r._count._all; }
    return [...map.values()].sort((a, b) => a.group.localeCompare(b.group) || a.component.localeCompare(b.component));
  }
  expiryAlerts(t: string, q: ExpiryQuery) {
    const until = new Date(Date.now() + (q.days ?? 3) * 86400000);
    return this.prisma.bloodUnit.findMany({ where: { tenantId: t, status: { in: ['AVAILABLE', 'RESERVED', 'QUARANTINE'] }, expiresAt: { lte: until } }, orderBy: { expiresAt: 'asc' } });
  }
  @Cron(CronExpression.EVERY_HOUR)
  async expireUnits() {
    const r = await this.prisma.bloodUnit.updateMany({ where: { status: { in: ['AVAILABLE', 'RESERVED', 'QUARANTINE'] }, expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
    if (r.count) this.log.log(`Expired ${r.count} blood unit(s)`);
    return r.count;
  }

  // ── Requests: grouping & crossmatch ──
  async createRequest(u: AuthUser, d: BloodRequestDto) {
    const t = u.tenantId;
    let patientId = d.patientId; let visitId = d.visitId;
    if (d.orderId) {
      const o = await mustFind(this.prisma.order.findFirst({ where: { id: d.orderId, tenantId: t }, include: { visit: true } }), 'Order');
      patientId = o.visit.patientId; visitId = o.visitId;
    }
    if (!patientId) throw new BadRequestException('orderId or patientId is required');
    const visit = await this.sb.billableVisit(u, patientId, visitId);
    const p = await this.sb.patient(t, patientId);
    const g = parseGroup(p.bloodGroup);
    return this.prisma.bloodRequest.create({ data: {
      tenantId: t, requestNumber: await this.sb.next(t, 'BLOOD_REQ', 'BR'), patientId, visitId: visit.id, orderId: d.orderId, component: d.component,
      unitsRequested: d.unitsRequested ?? 1, urgency: d.urgency ?? 'ROUTINE', indication: d.indication, patientAbo: g?.abo, patientRh: g?.rh, requestedById: u.sub,
      status: 'REQUESTED',
    } });
  }
  listRequests(t: string, q: RequestQuery) {
    const where: Prisma.BloodRequestWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.patientId ? { patientId: q.patientId } : {}), ...(q.q ? { requestNumber: { contains: q.q, mode: 'insensitive' } } : {}) };
    return paginate(q, (skip, take) => this.prisma.bloodRequest.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { crossmatches: true } }), () => this.prisma.bloodRequest.count({ where }));
  }
  private req(t: string, id: string) { return mustFind(this.prisma.bloodRequest.findFirst({ where: { id, tenantId: t }, include: { crossmatches: true } }), 'Blood request'); }
  /** Request detail with compatible available units (group-specific first). */
  async request(t: string, id: string) {
    const r = await this.req(t, id);
    let candidates: any[] = [];
    if (r.patientAbo && r.patientRh) {
      const units = await this.prisma.bloodUnit.findMany({ where: { tenantId: t, status: 'AVAILABLE', component: r.component }, orderBy: { expiresAt: 'asc' }, take: 200 });
      candidates = units.filter((x) => isCompatible({ abo: r.patientAbo as Abo, rh: r.patientRh as Rh }, { abo: x.abo as Abo, rh: x.rh as Rh, component: x.component }).compatible)
        .sort((a, b) => Number(b.abo === r.patientAbo && b.rh === r.patientRh) - Number(a.abo === r.patientAbo && a.rh === r.patientRh));
    }
    const reserved = await this.prisma.bloodUnit.findMany({ where: { tenantId: t, reservedForRequestId: id } });
    const transfusions = await this.prisma.transfusion.findMany({ where: { tenantId: t, requestId: id } });
    return { ...r, candidates, reserved, transfusions };
  }
  async group(u: AuthUser, id: string, d: GroupingDto) {
    const r = await this.req(u.tenantId, id);
    if (['ISSUED', 'COMPLETED', 'CANCELLED'].includes(r.status)) throw new BadRequestException(`Request is ${r.status}`);
    await this.prisma.patient.update({ where: { id: r.patientId }, data: { bloodGroup: groupLabel(d.abo, d.rh) } });
    if (r.status === 'REQUESTED') await this.sb.chargeCode(u.tenantId, 'BB-GROUP', { visitId: r.visitId, sourceType: 'ORDER', sourceId: r.id });
    return this.prisma.bloodRequest.update({ where: { id }, data: { patientAbo: d.abo, patientRh: d.rh, antibodyScreen: d.antibodyScreen, status: r.status === 'REQUESTED' ? 'GROUPED' : r.status } });
  }
  async crossmatch(u: AuthUser, id: string, d: CrossmatchDto) {
    const t = u.tenantId;
    const r = await this.req(t, id);
    if (!r.patientAbo || !r.patientRh) throw new BadRequestException('Group the patient before crossmatching');
    if (['ISSUED', 'COMPLETED', 'CANCELLED'].includes(r.status) && r.crossmatches.length >= r.unitsRequested) throw new BadRequestException(`Request is ${r.status}`);
    const unit = await mustFind(this.prisma.bloodUnit.findFirst({ where: { id: d.unitId, tenantId: t } }), 'Unit');
    if (unit.status !== 'AVAILABLE') throw new BadRequestException(`Unit ${unit.unitNumber} is ${unit.status}`);
    if (unit.expiresAt < new Date()) throw new BadRequestException('Unit has expired');
    const rule = isCompatible({ abo: r.patientAbo as Abo, rh: r.patientRh as Rh }, { abo: unit.abo as Abo, rh: unit.rh as Rh, component: unit.component });
    const result = !rule.compatible ? 'INCOMPATIBLE' : d.result ?? 'COMPATIBLE';
    const xm = await this.prisma.bloodCrossmatch.create({ data: { tenantId: t, requestId: id, unitId: unit.id, method: d.method ?? 'IAT', result, performedById: u.sub } });
    await this.sb.chargeCode(t, 'BB-XMATCH', { visitId: r.visitId, sourceType: 'ORDER', sourceId: xm.id });
    if (result === 'COMPATIBLE') {
      await this.prisma.bloodUnit.update({ where: { id: unit.id }, data: { status: 'RESERVED', reservedForRequestId: id } });
      await this.prisma.bloodRequest.update({ where: { id }, data: { status: 'CROSSMATCHED' } });
    }
    return { crossmatch: xm, compatible: result === 'COMPATIBLE', reason: rule.reason };
  }
  /** Issue a reserved unit to the patient: re-checks ABO/Rh at the bedside-release step, charges the unit, opens a transfusion record. */
  async issue(u: AuthUser, id: string, d: IssueDto) {
    const t = u.tenantId;
    const r = await this.req(t, id);
    const unit = await mustFind(this.prisma.bloodUnit.findFirst({ where: { id: d.unitId, tenantId: t } }), 'Unit');
    if (unit.status !== 'RESERVED' || unit.reservedForRequestId !== id) throw new BadRequestException('Unit is not crossmatched/reserved for this request');
    if (unit.expiresAt < new Date()) throw new BadRequestException('Unit has expired');
    const rule = isCompatible({ abo: r.patientAbo as Abo, rh: r.patientRh as Rh }, { abo: unit.abo as Abo, rh: unit.rh as Rh, component: unit.component });
    if (!rule.compatible) throw new BadRequestException(`Incompatible: ${rule.reason}`);
    const now = new Date();
    const tr = await this.prisma.$transaction(async (tx) => {
      await tx.bloodUnit.update({ where: { id: unit.id }, data: { status: 'ISSUED', issuedAt: now, issuedToPatientId: r.patientId } });
      return tx.transfusion.create({ data: { tenantId: t, unitId: unit.id, requestId: id, patientId: r.patientId, visitId: r.visitId, issuedAt: now, issuedById: u.sub } });
    });
    const charge = (await this.sb.chargeCode(t, `BB-${unit.component}`, { visitId: r.visitId, sourceType: 'ORDER', sourceId: tr.id, description: `Blood ${unit.component.replace('_', ' ')} ${groupLabel(unit.abo, unit.rh)} – ${unit.unitNumber}` }))
      ?? (await this.sb.chargeCode(t, 'BB-UNIT', { visitId: r.visitId, sourceType: 'ORDER', sourceId: tr.id }));
    const issuedCount = await this.prisma.transfusion.count({ where: { tenantId: t, requestId: id } });
    await this.prisma.bloodRequest.update({ where: { id }, data: { status: issuedCount >= r.unitsRequested ? 'ISSUED' : 'CROSSMATCHED' } });
    await this.sb.log(u, 'CREATE', 'Transfusion', tr.id, { unit: unit.unitNumber, group: groupLabel(unit.abo, unit.rh), patientId: r.patientId });
    return { transfusion: tr, charge };
  }
  async cancelRequest(u: AuthUser, id: string) {
    const r = await this.req(u.tenantId, id);
    if (['ISSUED', 'COMPLETED'].includes(r.status)) throw new BadRequestException(`Request is ${r.status}`);
    await this.prisma.bloodUnit.updateMany({ where: { tenantId: u.tenantId, reservedForRequestId: id, status: 'RESERVED' }, data: { status: 'AVAILABLE', reservedForRequestId: null } });
    return this.prisma.bloodRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // ── Transfusions ──
  listTransfusions(t: string, q: RequestQuery) {
    const where: Prisma.TransfusionWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.patientId ? { patientId: q.patientId } : {}) };
    return paginate(q, async (skip, take) => {
      const rows = await this.prisma.transfusion.findMany({ where, skip, take, orderBy: { issuedAt: 'desc' } });
      const units = await this.prisma.bloodUnit.findMany({ where: { id: { in: rows.map((r) => r.unitId) } } });
      return rows.map((r) => ({ ...r, unit: units.find((x) => x.id === r.unitId) }));
    }, () => this.prisma.transfusion.count({ where }));
  }
  private tr(t: string, id: string) { return mustFind(this.prisma.transfusion.findFirst({ where: { id, tenantId: t } }), 'Transfusion'); }
  async startTransfusion(u: AuthUser, id: string, d: TransfusionStartDto) {
    const x = await this.tr(u.tenantId, id);
    if (x.status !== 'ISSUED') throw new BadRequestException(`Transfusion is ${x.status}`);
    return this.prisma.transfusion.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), preVitals: d.preVitals as any } });
  }
  async completeTransfusion(u: AuthUser, id: string, d: TransfusionEndDto) {
    const x = await this.tr(u.tenantId, id);
    if (!['ISSUED', 'IN_PROGRESS'].includes(x.status)) throw new BadRequestException(`Transfusion is ${x.status}`);
    await this.prisma.bloodUnit.update({ where: { id: x.unitId }, data: { status: 'TRANSFUSED' } });
    return this.prisma.transfusion.update({ where: { id }, data: { status: 'COMPLETED', endedAt: new Date(), startedAt: x.startedAt ?? new Date(), postVitals: d.postVitals as any, volumeMl: d.volumeMl } });
  }
  async reaction(u: AuthUser, id: string, d: ReactionDto) {
    const x = await this.tr(u.tenantId, id);
    const stop = d.stopTransfusion ?? d.reactionSeverity !== 'MILD';
    const r = await this.prisma.transfusion.update({ where: { id }, data: { reaction: true, reactionType: d.reactionType, reactionSeverity: d.reactionSeverity, reactionNotes: d.reactionNotes, reactionAt: new Date(), ...(stop && x.status !== 'COMPLETED' ? { status: 'STOPPED', endedAt: new Date() } : {}) } });
    if (stop) await this.prisma.bloodUnit.update({ where: { id: x.unitId }, data: { status: 'TRANSFUSED' } });
    await this.sb.log(u, 'CREATE', 'TransfusionReaction', id, { ...d, patientId: x.patientId });
    return r;
  }
  async reactions(t: string) {
    return this.prisma.transfusion.findMany({ where: { tenantId: t, reaction: true }, orderBy: { reactionAt: 'desc' }, take: 200 });
  }
}
