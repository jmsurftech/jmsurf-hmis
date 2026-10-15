import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { AuditService } from '../../common/audit.service';
import { NATIONAL_INSURANCE, NationalInsurancePort } from '../../integrations/ports';
import { withTenant } from '../../integrations/integration-context';
import { buildClaimBundle } from '../../integrations/fhir/mappers';
import { PayersService } from '../payers/payers.service';
import { pageArgs, paged } from '../list-query';
import { assertTransition, ClaimState, mapExternalStatus, transitionPath } from './claim-state';
import { hasBlockingIssues, PackageRule, rejectionRisk, scrubClaim, ScrubIssue } from './scrubber';
import { ClaimListQuery, ManualStatusDto, RemittanceDto } from './claims.dto';

const ACTIVE_STATES: ClaimState[] = ['DRAFT', 'VALIDATED', 'PREAUTH_PENDING', 'SUBMITTED', 'IN_REVIEW', 'QUERIED', 'APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'RECONCILED'];
const OPEN_EXTERNAL: ClaimState[] = ['SUBMITTED', 'IN_REVIEW', 'QUERIED'];
const DECIDED: ClaimState[] = ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'RECONCILED'];

@Injectable()
export class ClaimsService {
  private log = new Logger('Claims');
  constructor(
    private prisma: PrismaService, private seq: SequenceService, private audit: AuditService, private payers: PayersService,
    @Inject(NATIONAL_INSURANCE) private nhi: NationalInsurancePort,
  ) {}

  async list(tenantId: string, q: ClaimListQuery) {
    const where: any = { tenantId };
    if (q.status) where.status = q.status;
    if (q.payerId) where.payerId = q.payerId;
    if (q.q) where.OR = [{ claimNumber: { contains: q.q, mode: 'insensitive' } }, { externalRef: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      this.prisma.claim.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.claim.count({ where }),
    ]);
    return paged(await this.withContext(tenantId, data), total, q);
  }

  /** Attach visit/patient and payer summaries (Claim stores only the ids). */
  private async withContext<T extends { visitId: string; payerId: string }>(tenantId: string, claims: T[]) {
    const [visits, payers] = await Promise.all([
      this.prisma.visit.findMany({ where: { tenantId, id: { in: claims.map((c) => c.visitId) } }, select: { id: true, visitNumber: true, payerType: true, patient: { select: { id: true, mrn: true, firstName: true, lastName: true, shaNumber: true } } } }),
      this.prisma.payer.findMany({ where: { tenantId, id: { in: claims.map((c) => c.payerId) } }, select: { id: true, name: true, type: true } }),
    ]);
    const vm = new Map(visits.map((v) => [v.id, v])); const pm = new Map(payers.map((p) => [p.id, p]));
    return claims.map((c) => ({ ...c, visit: vm.get(c.visitId) ?? null, patient: vm.get(c.visitId)?.patient ?? null, payer: pm.get(c.payerId) ?? null }));
  }

  /** Claim with lines, events and visit/patient/payer context, for the claim detail view. */
  async getDetail(tenantId: string, id: string) {
    const [c] = await this.withContext(tenantId, [await this.get(tenantId, id)]);
    return c;
  }

  async get(tenantId: string, id: string) {
    const c = await this.prisma.claim.findFirst({ where: { id, tenantId }, include: { lines: true, events: { orderBy: { createdAt: 'asc' } } } });
    if (!c) throw new NotFoundException('Claim not found');
    return c;
  }

  /** Move a claim to a new state (validated by the state machine) and append a ClaimEvent. */
  async transition(claimId: string, to: ClaimState, note?: string, data?: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const c = await this.prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    const from = c.status as ClaimState;
    assertTransition(from, to);
    const decided = DECIDED.includes(to) && !c.decidedAt ? { decidedAt: new Date() } : {};
    const [updated] = await this.prisma.$transaction([
      this.prisma.claim.update({ where: { id: claimId }, data: { status: to as any, ...decided, ...extra } }),
      this.prisma.claimEvent.create({ data: { claimId, fromStatus: from, toStatus: to, note, data: (data ?? undefined) as any } }),
    ]);
    return updated;
  }

  /** Walk the shortest legal path to `to`, recording every intermediate state. */
  private async moveTo(claimId: string, to: ClaimState, note?: string, data?: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const c = await this.prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    const path = transitionPath(c.status as ClaimState, to);
    if (!path) throw new BadRequestException(`Cannot move claim from ${c.status} to ${to}`);
    let res = c;
    for (const [i, s] of path.entries()) res = await this.transition(claimId, s, note, data, i === path.length - 1 ? extra : {});
    return res;
  }

  async buildFromBill(tenantId: string, userId: string, billId: string) {
    const bill = await this.prisma.bill.findFirst({ where: { id: billId, tenantId }, include: { lines: true, visit: true } });
    if (!bill) throw new NotFoundException('Bill not found');
    const lines = bill.lines.filter((l) => !l.voided && l.payer === 'SCHEME');
    if (!lines.length) throw new BadRequestException('Bill has no scheme-payable lines');
    let payerId: string | undefined;
    if (bill.visit.schemeId) payerId = (await this.prisma.scheme.findFirst({ where: { id: bill.visit.schemeId, tenantId } }))?.payerId;
    if (!payerId && bill.visit.payerType === 'SHA') payerId = (await this.payers.ensureShaPayer(tenantId)).id;
    if (!payerId) throw new BadRequestException('Visit has no scheme / payer');
    const services = await this.prisma.serviceItem.findMany({ where: { tenantId, id: { in: lines.map((l) => l.serviceItemId).filter(Boolean) as string[] } } });
    const code = (l: (typeof lines)[number]) => l.shaInterventionCode ?? services.find((s) => s.id === l.serviceItemId)?.code ?? 'UNCODED';
    const claim = await this.prisma.claim.create({
      data: {
        tenantId, facilityId: bill.facilityId, visitId: bill.visitId, billId: bill.id, payerId,
        claimNumber: await this.seq.next(tenantId, 'CLAIM', 'CLM'), totalMinor: lines.reduce((a, l) => a + l.totalMinor, 0),
        lines: { create: lines.map((l) => ({ billLineId: l.id, code: code(l), description: l.description, quantity: l.quantity, amountMinor: l.totalMinor })) },
        events: { create: { toStatus: 'DRAFT', note: `Built from bill ${bill.billNumber}` } },
      },
    });
    await this.audit.log({ tenantId, userId, action: 'CREATE', entity: 'Claim', entityId: claim.id, data: { billId } });
    return this.scrub(tenantId, claim.id);
  }

  /** Run the scrubber; DRAFT claims with no blocking issues become VALIDATED, VALIDATED claims with new errors drop back to DRAFT. */
  async scrub(tenantId: string, claimId: string) {
    const claim = await this.get(tenantId, claimId);
    const { issues, risk } = await this.evaluate(claim);
    await this.prisma.claim.update({ where: { id: claimId }, data: { scrubIssues: issues as any, rejectionRisk: risk } });
    const blocking = hasBlockingIssues(issues);
    if (!blocking && claim.status === 'DRAFT') await this.transition(claimId, 'VALIDATED', 'Scrubber passed', { warnings: issues.length });
    if (blocking && claim.status === 'VALIDATED') await this.transition(claimId, 'DRAFT', 'Scrubber found blocking issues', { issues: issues.map((i) => i.code) });
    return this.get(tenantId, claimId);
  }

  private async evaluate(claim: Awaited<ReturnType<ClaimsService['get']>>): Promise<{ issues: ScrubIssue[]; risk: number }> {
    const tenantId = claim.tenantId;
    const [visit, payer, facility] = await Promise.all([
      this.prisma.visit.findFirstOrThrow({ where: { id: claim.visitId, tenantId }, include: { patient: true, diagnoses: true } }),
      this.prisma.payer.findFirstOrThrow({ where: { id: claim.payerId, tenantId } }),
      this.prisma.facility.findFirst({ where: { id: claim.facilityId, tenantId } }),
    ]);
    const codes = [...new Set(claim.lines.map((l) => l.code))];
    const isSha = payer.type === 'SHA';
    const pkgs = isSha ? await this.prisma.shaPackage.findMany({ where: { code: { in: codes }, active: true } }) : [];
    const packages: Record<string, PackageRule> = Object.fromEntries(pkgs.map((p) => [p.code, p]));
    const preauths = await this.prisma.preAuth.findMany({ where: { tenantId, visitId: visit.id, status: 'APPROVED' } });
    const patientVisits = await this.prisma.visit.findMany({ where: { tenantId, patientId: visit.patientId }, select: { id: true, startedAt: true } });
    const priorClaims = await this.prisma.claim.findMany({
      where: { tenantId, id: { not: claim.id }, visitId: { in: patientVisits.map((v) => v.id) }, status: { not: 'REJECTED' } },
      include: { lines: { where: { code: { in: codes } } } },
    });
    const priorUsage: Record<string, Date[]> = {};
    for (const pc of priorClaims) {
      const at = patientVisits.find((v) => v.id === pc.visitId)?.startedAt ?? pc.createdAt;
      for (const l of pc.lines) for (let i = 0; i < Math.max(1, Math.round(l.quantity)); i++) (priorUsage[l.code] ??= []).push(at);
    }
    const duplicates = priorClaims.filter((pc) => (pc.visitId === claim.visitId || pc.billId === claim.billId) && ACTIVE_STATES.includes(pc.status as ClaimState));
    const practitioner = visit.practitionerId
      ? await this.prisma.practitioner.findFirst({ where: { tenantId, OR: [{ id: visit.practitionerId }, { userId: visit.practitionerId }] } })
      : null;
    const issues = scrubClaim({
      payerType: payer.type, serviceDate: visit.startedAt,
      diagnoses: visit.diagnoses.map((d) => ({ code: d.code, codeSystem: d.codeSystem })),
      patient: { crId: visit.patient.crId, shaNumber: visit.patient.shaNumber },
      facilityLevel: facility?.level ?? 0,
      lines: claim.lines.map((l) => ({ ref: l.id, code: l.code, description: l.description, quantity: l.quantity, amountMinor: l.amountMinor })),
      packages, approvedPreauthCodes: preauths.map((p) => p.interventionCode).filter(Boolean) as string[],
      priorUsage, duplicateClaimNumbers: duplicates.map((d) => d.claimNumber),
      practitioner, tariffTolerancePercent: Number(process.env.CLAIMS_TARIFF_TOLERANCE_PERCENT ?? 0),
    });
    const since = new Date(Date.now() - 90 * 86400_000);
    const [rejected, decided] = await Promise.all([
      this.prisma.claim.count({ where: { tenantId, payerId: payer.id, status: 'REJECTED', decidedAt: { gte: since } } }),
      this.prisma.claim.count({ where: { tenantId, payerId: payer.id, status: { in: DECIDED as any }, decidedAt: { gte: since } } }),
    ]);
    return { issues, risk: rejectionRisk(issues, { totalMinor: claim.totalMinor, historicalRejectionRate: decided >= 20 ? rejected / decided : undefined }) };
  }

  async buildFhir(tenantId: string, claimId: string) {
    const claim = await this.get(tenantId, claimId);
    const [visit, facility, payer, bill] = await Promise.all([
      this.prisma.visit.findFirstOrThrow({ where: { id: claim.visitId, tenantId }, include: { patient: true, diagnoses: true } }),
      this.prisma.facility.findFirstOrThrow({ where: { id: claim.facilityId, tenantId } }),
      this.prisma.payer.findFirstOrThrow({ where: { id: claim.payerId, tenantId } }),
      this.prisma.bill.findFirstOrThrow({ where: { id: claim.billId, tenantId } }),
    ]);
    const prac = visit.practitionerId
      ? await this.prisma.practitioner.findFirst({ where: { tenantId, OR: [{ id: visit.practitionerId }, { userId: visit.practitionerId }] }, include: { user: true } })
      : null;
    const preauths = await this.prisma.preAuth.findMany({ where: { tenantId, visitId: visit.id, status: 'APPROVED', externalRef: { not: null } } });
    return buildClaimBundle({
      patient: visit.patient,
      encounter: { id: visit.id, type: visit.type, startedAt: visit.startedAt, endedAt: visit.endedAt },
      organization: facility,
      practitioner: prac && { id: prac.id, name: `${prac.user.firstName} ${prac.user.lastName}`, cadre: prac.cadre, regulator: prac.regulator, licenseNumber: prac.licenseNumber, hwrId: prac.hwrId },
      claim: {
        id: claim.id, claimNumber: claim.claimNumber, createdAt: claim.createdAt, currency: bill.currency, totalMinor: claim.totalMinor,
        fund: visit.shaFund, insurerName: payer.name, preAuthRefs: preauths.map((p) => p.externalRef!),
        diagnoses: visit.diagnoses.map((d) => ({ code: d.code, display: d.display, codeSystem: d.codeSystem, type: d.type })),
        items: claim.lines.map((l) => ({ code: l.code, description: l.description, quantity: l.quantity, unitPriceMinor: Math.round(l.amountMinor / (l.quantity || 1)), totalMinor: l.amountMinor, serviceDate: visit.startedAt })),
      },
    });
  }

  async submit(tenantId: string, userId: string, claimId: string) {
    let claim = await this.get(tenantId, claimId);
    if (!['VALIDATED', 'REJECTED', 'QUERIED'].includes(claim.status)) throw new BadRequestException(`Claim in ${claim.status} cannot be submitted; scrub it first`);
    if (claim.status !== 'VALIDATED') {
      const { issues, risk } = await this.evaluate(claim);
      await this.prisma.claim.update({ where: { id: claimId }, data: { scrubIssues: issues as any, rejectionRisk: risk } });
      if (hasBlockingIssues(issues)) throw new BadRequestException({ message: 'Fix scrubber errors before resubmitting', issues });
    }
    const payer = await this.prisma.payer.findFirstOrThrow({ where: { id: claim.payerId, tenantId } });
    const bundle = await this.buildFhir(tenantId, claimId);
    await this.prisma.claim.update({ where: { id: claimId }, data: { fhirBundle: bundle as any } });
    const resubmission = claim.status !== 'VALIDATED';
    if (payer.integration !== 'sha-hie' && payer.type !== 'SHA') {
      // Insurers without an API: mark submitted; the bundle can be exported (GET /claims/:id/fhir) or emailed.
      await this.transition(claimId, 'SUBMITTED', resubmission ? 'Resubmitted (manual channel)' : 'Submitted (manual channel)', undefined, { submittedAt: new Date() });
    } else {
      const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const res = await withTenant(tenantId, () => this.nhi.submitClaim(bundle), tenant.countryCode);
      await this.transition(claimId, 'SUBMITTED', resubmission ? 'Resubmitted to SHA' : 'Submitted to SHA', { response: res.raw as any }, { submittedAt: new Date(), externalRef: res.externalRef ?? claim.externalRef });
      if (!res.accepted) await this.transition(claimId, 'REJECTED', res.message ?? 'Rejected at submission', undefined, { rejectionReason: res.message ?? 'Rejected at submission' });
      else if (res.status === 'IN_REVIEW') await this.transition(claimId, 'IN_REVIEW', 'Acknowledged by payer');
    }
    await this.audit.log({ tenantId, userId, action: resubmission ? 'RESUBMIT' : 'SUBMIT', entity: 'Claim', entityId: claimId });
    return this.get(tenantId, claimId);
  }

  /** Rejected / queried claims: re-open as DRAFT for correction (then scrub → submit), keeping history. */
  async reopen(tenantId: string, userId: string, claimId: string, note?: string) {
    const c = await this.get(tenantId, claimId);
    if (!['REJECTED', 'QUERIED'].includes(c.status)) throw new BadRequestException('Only rejected or queried claims can be reopened');
    await this.transition(claimId, 'DRAFT', note ?? 'Reopened for correction');
    await this.audit.log({ tenantId, userId, action: 'REOPEN', entity: 'Claim', entityId: claimId, data: { note } });
    return this.scrub(tenantId, claimId);
  }

  async refreshStatus(tenantId: string, claimId: string) {
    const c = await this.get(tenantId, claimId);
    if (!c.externalRef) throw new BadRequestException('Claim has no external reference');
    const res = await withTenant(tenantId, () => this.nhi.claimStatus(c.externalRef!));
    await this.applyExternalStatus(c.id, res.status, { approvedMinor: res.approvedMinor, paidMinor: res.paidMinor, reason: res.reason, raw: res.raw });
    return this.get(tenantId, claimId);
  }

  private async applyExternalStatus(claimId: string, status: string, r: { approvedMinor?: number; paidMinor?: number; reason?: string; raw?: unknown }) {
    const target = mapExternalStatus(status);
    const c = await this.prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    if (!target || target === c.status) return c;
    const extra: Record<string, unknown> = {};
    if (r.approvedMinor != null) extra.approvedMinor = r.approvedMinor;
    if (r.paidMinor != null) extra.paidMinor = r.paidMinor;
    if (target === 'REJECTED' || target === 'QUERIED') extra.rejectionReason = r.reason ?? null;
    try {
      return await this.moveTo(claimId, target, `Payer status: ${status}`, { reason: r.reason, raw: r.raw as any }, extra);
    } catch (e: any) {
      this.log.warn(`Claim ${claimId}: ignoring payer status ${status} (${e?.message})`);
      return c;
    }
  }

  manualStatus(tenantId: string, userId: string, claimId: string, dto: ManualStatusDto) {
    return this.get(tenantId, claimId).then(async () => {
      await this.transition(claimId, dto.status as ClaimState, dto.note ?? 'Manual update', { userId }, {
        ...(dto.approvedMinor != null ? { approvedMinor: dto.approvedMinor } : {}),
        ...(dto.rejectionReason ? { rejectionReason: dto.rejectionReason } : {}),
      });
      await this.audit.log({ tenantId, userId, action: 'STATUS', entity: 'Claim', entityId: claimId, data: dto });
      return this.get(tenantId, claimId);
    });
  }

  /** Poll the payer for status updates on in-flight claims. */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'claims-status-poll' })
  async pollStatuses() {
    if (process.env.CLAIMS_POLL_ENABLED === 'false') return;
    const stale = new Date(Date.now() - 15 * 60_000);
    const claims = await this.prisma.claim.findMany({
      where: { status: { in: OPEN_EXTERNAL as any }, externalRef: { not: null }, updatedAt: { lt: stale } },
      take: Number(process.env.CLAIMS_POLL_BATCH ?? 200), orderBy: { updatedAt: 'asc' },
    });
    for (const c of claims) {
      try {
        const res = await withTenant(c.tenantId, () => this.nhi.claimStatus(c.externalRef!));
        await this.applyExternalStatus(c.id, res.status, { approvedMinor: res.approvedMinor, paidMinor: res.paidMinor, reason: res.reason, raw: res.raw });
        await this.prisma.claim.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
      } catch (e: any) {
        this.log.warn(`Status poll failed for ${c.claimNumber}: ${e?.message}`);
      }
    }
    return { polled: claims.length };
  }

  /** Import a remittance / payment advice and auto-reconcile lines to claims by externalRef or claimNumber. */
  async importRemittance(tenantId: string, userId: string, dto: RemittanceDto) {
    await this.payers.getPayer(tenantId, dto.payerId);
    const total = dto.amountMinor ?? dto.lines.reduce((a, l) => a + l.amountMinor, 0);
    const rem = await this.prisma.remittance.create({
      data: { tenantId, payerId: dto.payerId, reference: dto.reference, amountMinor: total, paidAt: new Date(dto.paidAt), lines: dto.lines as any },
    });
    const results: { claimNumber?: string; externalRef?: string; amountMinor: number; matched: boolean; claimId?: string; status?: string; note?: string }[] = [];
    for (const l of dto.lines) {
      const or: any[] = [];
      if (l.externalRef) or.push({ externalRef: l.externalRef });
      if (l.claimNumber) or.push({ claimNumber: l.claimNumber });
      const claim = or.length ? await this.prisma.claim.findFirst({ where: { tenantId, payerId: dto.payerId, OR: or } }) : null;
      if (!claim) { results.push({ ...l, matched: false, note: 'No matching claim' }); continue; }
      try {
        const paid = (claim.paidMinor ?? 0) + l.amountMinor;
        const approved = claim.approvedMinor ?? l.amountMinor;
        if (claim.status !== 'PAID' && claim.status !== 'RECONCILED')
          await this.moveTo(claim.id, 'PAID', `Remittance ${dto.reference}`, { remittanceId: rem.id, amountMinor: l.amountMinor }, { paidMinor: paid, approvedMinor: approved });
        else await this.prisma.claim.update({ where: { id: claim.id }, data: { paidMinor: paid } });
        let status = 'PAID';
        if (paid >= approved) { await this.moveTo(claim.id, 'RECONCILED', 'Fully paid', { remittanceId: rem.id }); status = 'RECONCILED'; }
        results.push({ ...l, matched: true, claimId: claim.id, status, note: paid < approved ? `Short-paid by ${approved - paid}` : undefined });
      } catch (e: any) {
        results.push({ ...l, matched: false, claimId: claim.id, note: e?.message });
      }
    }
    const allMatched = results.every((r) => r.matched);
    await this.prisma.remittance.update({ where: { id: rem.id }, data: { reconciled: allMatched } });
    await this.audit.log({ tenantId, userId, action: 'REMITTANCE_IMPORT', entity: 'Remittance', entityId: rem.id, data: { matched: results.filter((r) => r.matched).length, total: results.length } });
    return { remittanceId: rem.id, reconciled: allMatched, matched: results.filter((r) => r.matched).length, unmatched: results.filter((r) => !r.matched).length, results };
  }

  listRemittances(tenantId: string, q: { page?: number; pageSize?: number }) {
    const qq = { page: q.page ?? 1, pageSize: q.pageSize ?? 25 };
    return Promise.all([
      this.prisma.remittance.findMany({ where: { tenantId }, orderBy: { paidAt: 'desc' }, ...pageArgs(qq) }),
      this.prisma.remittance.count({ where: { tenantId } }),
    ]).then(([d, t]) => paged(d, t, qq));
  }

  async dashboard(tenantId: string, payerId?: string) {
    const where: any = { tenantId, ...(payerId ? { payerId } : {}) };
    const grouped = await this.prisma.claim.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { totalMinor: true, approvedMinor: true, paidMinor: true } });
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, { count: g._count._all, totalMinor: g._sum.totalMinor ?? 0, approvedMinor: g._sum.approvedMinor ?? 0, paidMinor: g._sum.paidMinor ?? 0 }]));

    const decided = await this.prisma.claim.findMany({ where: { ...where, status: { in: DECIDED as any } }, select: { id: true } });
    const bounced = await this.prisma.claimEvent.findMany({
      where: { claimId: { in: decided.map((d) => d.id) }, toStatus: { in: ['REJECTED', 'QUERIED'] } }, select: { claimId: true }, distinct: ['claimId'],
    });
    const firstPassAcceptanceRate = decided.length ? Math.round(((decided.length - bounced.length) / decided.length) * 1000) / 10 : null;

    const open = await this.prisma.claim.findMany({
      where: { ...where, status: { in: ['SUBMITTED', 'IN_REVIEW', 'QUERIED', 'APPROVED', 'PARTIALLY_APPROVED', 'PAID'] as any } },
      select: { submittedAt: true, createdAt: true, totalMinor: true, approvedMinor: true, paidMinor: true },
    });
    const buckets = { '0-30': { count: 0, outstandingMinor: 0 }, '31-60': { count: 0, outstandingMinor: 0 }, '61-90': { count: 0, outstandingMinor: 0 }, '90+': { count: 0, outstandingMinor: 0 } };
    const now = Date.now();
    for (const c of open) {
      const days = Math.floor((now - (c.submittedAt ?? c.createdAt).getTime()) / 86400_000);
      const k = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      buckets[k].count++;
      buckets[k].outstandingMinor += Math.max((c.approvedMinor ?? c.totalMinor) - (c.paidMinor ?? 0), 0);
    }
    const reasons = await this.prisma.claim.groupBy({
      by: ['rejectionReason'], where: { ...where, rejectionReason: { not: null } }, _count: { _all: true },
      orderBy: { _count: { rejectionReason: 'desc' } }, take: 10,
    });
    const scrubCandidates = await this.prisma.claim.findMany({ where: { ...where, status: { in: ['DRAFT'] } }, select: { scrubIssues: true } });
    const scrubCounts: Record<string, number> = {};
    for (const c of scrubCandidates) for (const i of (c.scrubIssues as any[]) ?? []) scrubCounts[i.code] = (scrubCounts[i.code] ?? 0) + 1;
    return {
      byStatus, total: grouped.reduce((a, g) => a + g._count._all, 0),
      firstPassAcceptanceRate, firstPassTarget: 95, decidedCount: decided.length,
      ageing: buckets,
      topRejectionReasons: reasons.map((r) => ({ reason: r.rejectionReason, count: r._count._all })),
      blockingScrubIssues: Object.entries(scrubCounts).sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
    };
  }
}
