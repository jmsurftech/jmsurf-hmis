import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { monthRange, toCsv } from '../shared';
import { FinanceService, AccountingService } from '../finance/finance.module';
import { moh705 } from './moh-reports';
import { buildDataValueSet, DEFAULT_DHIS2_MAPPING, Dhis2Mapping } from './dhis2-mapping';

const EAT_OFFSET_MS = 3 * 3600000; // Africa/Nairobi, no DST
/** Start of the current day / month in East Africa Time, as a UTC Date. */
export function eatStartOfDay(now = new Date()) {
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - EAT_OFFSET_MS);
}
export function eatStartOfMonth(now = new Date()) {
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - EAT_OFFSET_MS);
}
const eatMonth = (period: string) => {
  const { start, end } = monthRange(period);
  return { start: new Date(start.getTime() - EAT_OFFSET_MS), end: new Date(end.getTime() - EAT_OFFSET_MS) };
};
const currentPeriod = () => new Date(Date.now() + EAT_OFFSET_MS).toISOString().slice(0, 7);

class Dhis2PushDto {
  @IsIn(['MOH705A', 'MOH705B', 'MOH717']) report: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) period: string;
  @IsOptional() @IsString() facilityId?: string;
  @IsOptional() @IsString() orgUnit?: string;
}

const PENDING_CLAIM_STATUSES = ['VALIDATED', 'PREAUTH_PENDING', 'SUBMITTED', 'IN_REVIEW', 'QUERIED', 'APPROVED', 'PARTIALLY_APPROVED'] as const;

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService, private finance: FinanceService, private accounting: AccountingService, private audit: AuditService,
  ) {}

  async dashboard(u: AuthUser, facilityId?: string) {
    const t = u.tenantId;
    const today = eatStartOfDay();
    const month = eatStartOfMonth();
    const since30 = new Date(Date.now() - 30 * 86400000);
    const fac = facilityId ? { facilityId } : {};
    const [visitsToday, revToday, revMonth, collToday, collMonth, claimsPending, beds, occupied, topDx, tat, lowStock] = await Promise.all([
      this.prisma.visit.count({ where: { tenantId: t, ...fac, startedAt: { gte: today }, status: { not: 'CANCELLED' } } }),
      this.prisma.billLine.aggregate({ where: { tenantId: t, voided: false, createdAt: { gte: today }, bill: fac }, _sum: { totalMinor: true } }),
      this.prisma.billLine.aggregate({ where: { tenantId: t, voided: false, createdAt: { gte: month }, bill: fac }, _sum: { totalMinor: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { tenantId: t, status: 'COMPLETED', createdAt: { gte: today } }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.payment.groupBy({ by: ['method'], where: { tenantId: t, status: 'COMPLETED', createdAt: { gte: month } }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.claim.aggregate({ where: { tenantId: t, ...fac, status: { in: [...PENDING_CLAIM_STATUSES] } }, _sum: { totalMinor: true }, _count: true }),
      this.prisma.bed.count({ where: { tenantId: t, status: { not: 'MAINTENANCE' }, ...(facilityId ? { ward: { facilityId } } : {}) } }),
      this.prisma.bed.count({ where: { tenantId: t, status: 'OCCUPIED', ...(facilityId ? { ward: { facilityId } } : {}) } }),
      this.prisma.diagnosis.groupBy({
        by: ['code', 'display'], where: { tenantId: t, createdAt: { gte: since30 } }, _count: { _all: true },
        orderBy: { _count: { code: 'desc' } }, take: 10,
      }),
      this.prisma.$queryRaw<{ avg: number | null; n: bigint }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (r.first_at - o."createdAt")) / 60)::float AS avg, COUNT(*) AS n
        FROM "Order" o JOIN (SELECT "orderId", MIN(COALESCE("verifiedAt", "createdAt")) AS first_at FROM "LabResult" WHERE "tenantId" = ${t} GROUP BY "orderId") r
        ON r."orderId" = o.id WHERE o."tenantId" = ${t} AND o.type = 'LAB' AND o."createdAt" >= ${since30}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "StockItem" i
        WHERE i."tenantId" = ${t} AND i.active = true AND i."reorderLevel" > 0
        AND COALESCE((SELECT SUM(b.quantity) FROM "StockBatch" b WHERE b."itemId" = i.id AND b."tenantId" = ${t}), 0) <= i."reorderLevel"`,
    ]);
    const since14 = new Date(today.getTime() - 13 * 86400000);
    const [visitDays, payDays, payerMix, queue, apptsToday, inpatients, labPending, rxPending] = await Promise.all([
      this.prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT to_char(("startedAt" + interval '3 hours')::date, 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "Visit"
        WHERE "tenantId" = ${t} AND "startedAt" >= ${since14} AND status <> 'CANCELLED' GROUP BY 1`,
      this.prisma.$queryRaw<{ d: string; s: bigint }[]>`
        SELECT to_char(("createdAt" + interval '3 hours')::date, 'YYYY-MM-DD') AS d, COALESCE(SUM("amountMinor"), 0) AS s FROM "Payment"
        WHERE "tenantId" = ${t} AND "createdAt" >= ${since14} AND status = 'COMPLETED' GROUP BY 1`,
      this.prisma.visit.groupBy({ by: ['payerType'], where: { tenantId: t, ...fac, startedAt: { gte: month }, status: { not: 'CANCELLED' } }, _count: true }),
      this.prisma.queueTicket.groupBy({ by: ['servicePoint', 'status'], where: { tenantId: t, createdAt: { gte: today }, status: { in: ['WAITING', 'CALLED', 'SERVING'] } }, _count: true }).catch(() => []),
      this.prisma.appointment.count({ where: { tenantId: t, startAt: { gte: today, lt: new Date(today.getTime() + 86400000) }, status: { notIn: ['CANCELLED'] } } }).catch(() => 0),
      this.prisma.admission.count({ where: { tenantId: t, dischargedAt: null } }).catch(() => 0),
      this.prisma.order.count({ where: { tenantId: t, type: 'LAB', status: { in: ['REQUESTED', 'PAID', 'IN_PROGRESS', 'COMPLETED'] } } }).catch(() => 0),
      this.prisma.prescription.count({ where: { tenantId: t, status: { in: ['PENDING', 'PARTIAL'] } } }).catch(() => 0),
    ]);
    const days = Array.from({ length: 14 }, (_, i) => new Date(since14.getTime() + i * 86400000 + EAT_OFFSET_MS).toISOString().slice(0, 10));
    const vMap = new Map(visitDays.map((r) => [r.d, Number(r.n)])); const pMap = new Map(payDays.map((r) => [r.d, Number(r.s)]));
    const coll = (rows: typeof collToday) => {
      const byMethod = rows.map((r) => ({ method: r.method, amountMinor: r._sum.amountMinor ?? 0, count: r._count }));
      return { totalMinor: byMethod.reduce((s, r) => s + r.amountMinor, 0), byMethod };
    };
    const queueBy: Record<string, { waiting: number; called: number; serving: number }> = {};
    for (const q of queue as any[]) { const s = (queueBy[q.servicePoint] ??= { waiting: 0, called: 0, serving: 0 }); s[String(q.status).toLowerCase() as 'waiting'] += q._count; }
    // Money is shown only to roles that handle it.
    const money = u.isSuperAdmin || u.roles.some((r) => ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER', 'CLAIMS_OFFICER'].includes(r));
    return {
      asOf: new Date().toISOString(),
      showMoney: money,
      visitsToday,
      revenueTodayMinor: money ? revToday._sum.totalMinor ?? 0 : null,
      revenueMonthMinor: money ? revMonth._sum.totalMinor ?? 0 : null,
      collectionsToday: money ? coll(collToday) : null,
      collectionsMonth: money ? coll(collMonth) : null,
      claimsPending: money ? { count: claimsPending._count, valueMinor: claimsPending._sum.totalMinor ?? 0 } : null,
      beds: { total: beds, occupied, occupancyPct: beds ? Math.round((occupied / beds) * 1000) / 10 : 0 },
      topDiagnoses: topDx.map((d) => ({ code: d.code, display: d.display, count: d._count._all })),
      labTurnaround: { avgMinutes: tat[0]?.avg != null ? Math.round(tat[0].avg) : null, orders: Number(tat[0]?.n ?? 0) },
      lowStockCount: Number(lowStock[0]?.n ?? 0),
      trend: days.map((d) => ({ day: d, visits: vMap.get(d) ?? 0, collectedMinor: money ? pMap.get(d) ?? 0 : 0 })),
      payerMix: payerMix.map((p) => ({ payerType: p.payerType, visits: p._count })),
      queue: Object.entries(queueBy).map(([servicePoint, v]) => ({ servicePoint, ...v })),
      appointmentsToday: apptsToday, inpatients, labPending, prescriptionsPending: rxPending,
    };
  }

  /** MOH 705A (<5) / 705B (≥5) OPD morbidity summary for a month (OPD-type visits, all diagnoses except provisional). */
  async moh705(u: AuthUser, form: '705A' | '705B', period: string, facilityId?: string) {
    const { start, end } = eatMonth(period);
    const dx = await this.prisma.diagnosis.findMany({
      where: {
        tenantId: u.tenantId, type: { not: 'PROVISIONAL' },
        visit: { startedAt: { gte: start, lt: end }, type: { in: ['OPD', 'WALK_IN', 'EMERGENCY', 'REFERRAL', 'OUTREACH'] }, ...(facilityId ? { facilityId } : {}) },
      },
      select: { code: true, codeSystem: true, visit: { select: { startedAt: true, patient: { select: { dateOfBirth: true, sex: true } } } } },
    });
    const r = moh705(dx.map((d) => ({ code: d.code, codeSystem: d.codeSystem, visitDate: d.visit.startedAt, dateOfBirth: d.visit.patient.dateOfBirth, sex: d.visit.patient.sex })), form);
    return { report: `MOH${form}`, title: form === '705A' ? 'MOH 705A — OPD Summary (Under 5 years)' : 'MOH 705B — OPD Summary (5 years and over)', period, ...r };
  }

  /** MOH 717 monthly service workload summary. */
  async moh717(u: AuthUser, period: string, facilityId?: string) {
    const t = u.tenantId;
    const { start, end } = eatMonth(period);
    const inMonth = { gte: start, lt: end };
    const fac = facilityId ? { facilityId } : {};
    const visits = await this.prisma.visit.findMany({
      where: { tenantId: t, ...fac, startedAt: inMonth, status: { not: 'CANCELLED' } }, select: { patientId: true, type: true, startedAt: true },
    });
    const opd = visits.filter((v) => v.type !== 'EMERGENCY' && v.type !== 'IPD');
    const prior = await this.prisma.visit.groupBy({
      by: ['patientId'], where: { tenantId: t, patientId: { in: [...new Set(opd.map((v) => v.patientId))] }, startedAt: { lt: start } }, _count: true,
    });
    const seenBefore = new Set(prior.map((p) => p.patientId));
    const seenThisMonth = new Set<string>();
    let opdNew = 0;
    let opdRevisit = 0;
    for (const v of [...opd].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
      if (seenBefore.has(v.patientId) || seenThisMonth.has(v.patientId)) opdRevisit++; else opdNew++;
      seenThisMonth.add(v.patientId);
    }
    const visitFilter = { tenantId: t, ...(facilityId ? { facilityId } : {}) };
    const [admissions, discharges, deaths, adms, lab, imaging, procedures, rx, surgeries, deliveries, dialysis] = await Promise.all([
      this.prisma.admission.count({ where: { tenantId: t, admittedAt: inMonth, visit: visitFilter } }),
      this.prisma.admission.count({ where: { tenantId: t, dischargedAt: inMonth, visit: visitFilter } }),
      this.prisma.admission.count({ where: { tenantId: t, dischargedAt: inMonth, dischargeType: 'DECEASED', visit: visitFilter } }),
      this.prisma.admission.findMany({
        where: { tenantId: t, admittedAt: { lt: end }, OR: [{ dischargedAt: null }, { dischargedAt: { gte: start } }], visit: visitFilter },
        select: { admittedAt: true, dischargedAt: true },
      }),
      this.prisma.order.count({ where: { tenantId: t, type: 'LAB', createdAt: inMonth, status: { not: 'CANCELLED' }, visit: visitFilter } }),
      this.prisma.order.count({ where: { tenantId: t, type: 'IMAGING', createdAt: inMonth, status: { not: 'CANCELLED' }, visit: visitFilter } }),
      this.prisma.order.count({ where: { tenantId: t, type: 'PROCEDURE', createdAt: inMonth, status: { not: 'CANCELLED' }, visit: visitFilter } }),
      this.prisma.prescription.count({ where: { tenantId: t, createdAt: inMonth, status: { not: 'CANCELLED' }, visit: visitFilter } }),
      this.prisma.surgery.count({ where: { tenantId: t, scheduledStart: inMonth, status: 'DONE' } }),
      this.prisma.delivery.count({ where: { tenantId: t, deliveredAt: inMonth } }),
      this.prisma.dialysisSession.count({ where: { tenantId: t, scheduledAt: inMonth, status: { not: 'CANCELLED' } } }),
    ]);
    const now = new Date();
    const bedDays = adms.reduce((s, a) => {
      const from = Math.max(a.admittedAt.getTime(), start.getTime());
      const to = Math.min((a.dischargedAt ?? now).getTime(), end.getTime(), now.getTime());
      return s + Math.max(0, Math.ceil((to - from) / 86400000));
    }, 0);
    const rows = [
      { key: 'OPD_NEW', label: 'Outpatient — new attendances', value: opdNew },
      { key: 'OPD_REVISIT', label: 'Outpatient — re-attendances', value: opdRevisit },
      { key: 'EMERGENCY', label: 'Casualty / emergency attendances', value: visits.filter((v) => v.type === 'EMERGENCY').length },
      { key: 'ADMISSIONS', label: 'Inpatient admissions', value: admissions },
      { key: 'DISCHARGES', label: 'Inpatient discharges', value: discharges },
      { key: 'DEATHS', label: 'Inpatient deaths', value: deaths },
      { key: 'BED_DAYS', label: 'Inpatient bed days', value: bedDays },
      { key: 'LAB_TESTS', label: 'Laboratory tests', value: lab },
      { key: 'IMAGING', label: 'Imaging examinations', value: imaging },
      { key: 'PROCEDURES', label: 'Minor procedures', value: procedures },
      { key: 'PRESCRIPTIONS', label: 'Pharmacy prescriptions', value: rx },
      { key: 'SURGERIES', label: 'Theatre operations', value: surgeries },
      { key: 'DELIVERIES', label: 'Deliveries', value: deliveries },
      { key: 'DIALYSIS', label: 'Dialysis sessions', value: dialysis },
    ];
    return { report: 'MOH717', title: 'MOH 717 — Monthly Workload Report', period, rows };
  }

  async topDiagnoses(u: AuthUser, from?: string, to?: string) {
    const rows = await this.prisma.diagnosis.groupBy({
      by: ['code', 'display'],
      where: { tenantId: u.tenantId, createdAt: { gte: from ? new Date(from) : new Date(Date.now() - 30 * 86400000), ...(to ? { lte: new Date(to) } : {}) } },
      _count: { _all: true }, orderBy: { _count: { code: 'desc' } }, take: 50,
    });
    return { rows: rows.map((r) => ({ code: r.code, display: r.display, count: r._count._all })) };
  }

  async collections(u: AuthUser, from?: string, to?: string) {
    const rows = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { tenantId: u.tenantId, status: 'COMPLETED', createdAt: { gte: from ? new Date(from) : eatStartOfMonth(), ...(to ? { lte: new Date(to) } : {}) } },
      _sum: { amountMinor: true }, _count: true,
    });
    return { rows: rows.map((r) => ({ method: r.method, count: r._count, amountMinor: r._sum.amountMinor ?? 0 })) };
  }

  private async mapping(tenantId: string): Promise<Dhis2Mapping> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const override = (tenant?.settings as any)?.dhis2Mapping as Partial<Dhis2Mapping> | undefined;
    if (!override) return DEFAULT_DHIS2_MAPPING;
    return {
      dataSets: { ...DEFAULT_DHIS2_MAPPING.dataSets, ...override.dataSets },
      defaultCategoryOptionCombo: override.defaultCategoryOptionCombo ?? DEFAULT_DHIS2_MAPPING.defaultCategoryOptionCombo,
      dataElements: { ...DEFAULT_DHIS2_MAPPING.dataElements, ...override.dataElements },
    };
  }

  async dataValueSet(u: AuthUser, dto: Dhis2PushDto) {
    const facility = dto.facilityId
      ? await this.prisma.facility.findFirst({ where: { id: dto.facilityId, tenantId: u.tenantId } })
      : await this.prisma.facility.findFirst({ where: { tenantId: u.tenantId }, orderBy: { createdAt: 'asc' } });
    if (!facility) throw new NotFoundException('Facility not found');
    const orgUnit = dto.orgUnit ?? facility.kmhflCode;
    if (!orgUnit) throw new BadRequestException('Facility has no KMHFL code / DHIS2 orgUnit');
    const report = dto.report === 'MOH717'
      ? await this.moh717(u, dto.period, facility.id)
      : await this.moh705(u, dto.report === 'MOH705A' ? '705A' : '705B', dto.period, facility.id);
    return { orgUnit, ...buildDataValueSet(dto.report, dto.period, orgUnit, report.rows, await this.mapping(u.tenantId)) };
  }

  async pushDhis2(u: AuthUser, dto: Dhis2PushDto) {
    const base = process.env.DHIS2_BASE_URL;
    if (!base) throw new BadRequestException('DHIS2_BASE_URL is not configured');
    const { payload, unmapped, orgUnit } = await this.dataValueSet(u, dto);
    const auth = Buffer.from(`${process.env.DHIS2_USERNAME ?? ''}:${process.env.DHIS2_PASSWORD ?? process.env.DHIS2_PASS ?? ''}`).toString('base64');
    const msg = await this.prisma.integrationMessage.create({
      data: { tenantId: u.tenantId, adapter: 'dhis2', operation: 'dataValueSets', idempotencyKey: `${dto.report}:${dto.period}:${orgUnit}`, request: payload as any, attempts: 1 },
    });
    let status = 'FAILED';
    let response: unknown = null;
    let error: string | undefined;
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/dataValueSets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` }, body: JSON.stringify(payload),
      });
      const text = await res.text();
      try { response = JSON.parse(text); } catch { response = text; }
      status = res.ok ? 'SUCCESS' : 'FAILED';
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e: any) {
      error = e.message;
    }
    await this.prisma.integrationMessage.update({ where: { id: msg.id }, data: { status, response: response as any, error } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'DHIS2_PUSH', entity: 'IntegrationMessage', entityId: msg.id, data: { report: dto.report, period: dto.period, status } });
    return { status, error, response, dataValues: payload.dataValues.length, unmapped, integrationMessageId: msg.id };
  }

  /** Generic runner used by the CSV export. Returns a flat list of rows. */
  async run(u: AuthUser, name: string, q: Record<string, string | undefined>): Promise<Record<string, unknown>[]> {
    const period = q.period ?? currentPeriod();
    switch (name) {
      case 'moh705a': return (await this.moh705(u, '705A', period, q.facilityId)).rows;
      case 'moh705b': return (await this.moh705(u, '705B', period, q.facilityId)).rows;
      case 'moh717': return (await this.moh717(u, period, q.facilityId)).rows;
      case 'top-diagnoses': return (await this.topDiagnoses(u, q.from, q.to)).rows;
      case 'collections': return (await this.collections(u, q.from, q.to)).rows;
      case 'trial-balance': return (await this.accounting.trialBalance(u.tenantId, q.from ? new Date(q.from) : undefined, q.to ? new Date(q.to) : undefined)).rows as any;
      case 'income-statement': {
        const r = await this.finance.incomeStatement(u, q.from, q.to);
        return [...r.income, ...r.expenses, { code: '', name: 'NET SURPLUS', type: '', balanceMinor: r.netSurplusMinor }] as any;
      }
      case 'balance-sheet': {
        const r = await this.finance.balanceSheet(u, q.asOf);
        return [...r.assets, ...r.liabilities, ...r.equity, { code: '', name: 'Current year surplus', type: 'EQUITY', balanceMinor: r.currentYearSurplusMinor }] as any;
      }
      case 'debtors-ageing': return (await this.finance.debtorsAgeing(u, q.asOf)).rows as any;
      case 'dashboard': {
        const d = await this.dashboard(u, q.facilityId);
        return [
          { metric: 'visitsToday', value: d.visitsToday }, { metric: 'revenueTodayMinor', value: d.revenueTodayMinor },
          { metric: 'revenueMonthMinor', value: d.revenueMonthMinor }, { metric: 'collectionsTodayMinor', value: d.collectionsToday?.totalMinor ?? null },
          { metric: 'claimsPendingValueMinor', value: d.claimsPending?.valueMinor ?? null }, { metric: 'bedOccupancyPct', value: d.beds.occupancyPct },
          { metric: 'labTurnaroundAvgMinutes', value: d.labTurnaround.avgMinutes }, { metric: 'lowStockCount', value: d.lowStockCount },
        ];
      }
      default: throw new NotFoundException(`Unknown report '${name}'`);
    }
  }

  static readonly REPORTS = ['dashboard', 'moh705a', 'moh705b', 'moh717', 'top-diagnoses', 'collections', 'trial-balance', 'income-statement', 'balance-sheet', 'debtors-ageing'];
}

@Controller('reports')
@Roles('MANAGER', 'ACCOUNTANT')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Get() list() { return ReportsService.REPORTS; }
  @Get('dashboard') @Roles('MANAGER', 'ACCOUNTANT', 'DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'TRIAGE_NURSE', 'CASHIER', 'CLAIMS_OFFICER', 'RECEPTION', 'LAB_TECH', 'RADIOGRAPHER', 'PHARMACIST', 'STOREKEEPER', 'PROCUREMENT', 'HR')
  dashboard(@CurrentUser() u: AuthUser, @Query('facilityId') facilityId?: string) { return this.svc.dashboard(u, facilityId); }
  @Get('moh705a') moh705a(@CurrentUser() u: AuthUser, @Query('period') period?: string, @Query('facilityId') f?: string) { return this.svc.moh705(u, '705A', period ?? currentPeriod(), f); }
  @Get('moh705b') moh705b(@CurrentUser() u: AuthUser, @Query('period') period?: string, @Query('facilityId') f?: string) { return this.svc.moh705(u, '705B', period ?? currentPeriod(), f); }
  @Get('moh717') moh717(@CurrentUser() u: AuthUser, @Query('period') period?: string, @Query('facilityId') f?: string) { return this.svc.moh717(u, period ?? currentPeriod(), f); }
  @Get('top-diagnoses') top(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) { return this.svc.topDiagnoses(u, from, to); }
  @Get('collections') collections(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) { return this.svc.collections(u, from, to); }

  @Post('dhis2/data-value-set') dataValueSet(@CurrentUser() u: AuthUser, @Body() dto: Dhis2PushDto) { return this.svc.dataValueSet(u, dto); }
  @Post('dhis2/push') push(@CurrentUser() u: AuthUser, @Body() dto: Dhis2PushDto) { return this.svc.pushDhis2(u, dto); }

  /** CSV export for any report: GET /api/reports/<name>/csv?period=2026-10&from=&to=&asOf= */
  @Get(':name/csv')
  async csv(@CurrentUser() u: AuthUser, @Param('name') name: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const rows = await this.svc.run(u, name, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${q.period ?? q.asOf ?? new Date().toISOString().slice(0, 10)}.csv"`);
    return toCsv(rows);
  }
}

@Module({ providers: [ReportsService], controllers: [ReportsController] })
export class ReportsModule {}
