import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQueryDto, pageArgs } from '../shared';
import { schedule, straightLine } from './depreciation';
import { JournalLine } from '../finance/accounting.rules';

class AssetDto {
  @IsString() facilityId: string;
  @IsString() tag: string;
  @IsString() name: string;
  @IsString() category: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @Type(() => Number) @IsInt() @Min(0) costMinor: number;
  @Type(() => Number) @IsInt() @Min(1) usefulLifeYears: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() nextServiceAt?: string;
}
class UpdateAssetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) costMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usefulLifeYears?: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsIn(['IN_USE', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 'DISPOSED']) status?: string;
  @IsOptional() @IsDateString() nextServiceAt?: string;
}
class BudgetLineDto {
  @IsString() accountCode: string;
  @Type(() => Number) @IsInt() @Min(0) amountMinor: number;
}
class BudgetDto {
  @Type(() => Number) @IsInt() year: number;
  /** Department / cost centre name; journal lines tagged with this costCentre count as actuals. Use "FACILITY" for the whole facility. */
  @IsString() department: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineDto) lines: BudgetLineDto[];
}
class UpdateBudgetDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineDto) lines?: BudgetLineDto[];
  @IsOptional() @IsIn(['DRAFT', 'APPROVED', 'CLOSED']) status?: string;
}

const dt = (s?: string) => (s ? new Date(s) : undefined);

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private withDep<T extends { costMinor: number; usefulLifeYears: number; purchaseDate: Date | null }>(a: T, asOf = new Date()) {
    return { ...a, depreciation: a.purchaseDate ? straightLine({ costMinor: a.costMinor, usefulLifeYears: a.usefulLifeYears, purchaseDate: a.purchaseDate }, asOf) : null };
  }

  async list(u: AuthUser, q: ListQueryDto & { category?: string; status?: string }) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: any = { tenantId: u.tenantId };
    if (q.category) where.category = q.category;
    if (q.status) where.status = q.status;
    if (q.q) where.OR = ['name', 'tag', 'location'].map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } }));
    const [rows, total] = await Promise.all([
      this.prisma.asset.findMany({ where, skip, take, orderBy: { tag: 'asc' } }),
      this.prisma.asset.count({ where }),
    ]);
    return { data: rows.map((a) => this.withDep(a)), total, page, pageSize };
  }
  async get(u: AuthUser, id: string) {
    const a = await this.prisma.asset.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!a) throw new NotFoundException('Asset not found');
    return {
      ...this.withDep(a),
      schedule: a.purchaseDate ? schedule({ costMinor: a.costMinor, usefulLifeYears: a.usefulLifeYears, purchaseDate: a.purchaseDate }) : [],
    };
  }
  async create(u: AuthUser, dto: AssetDto) {
    const a = await this.prisma.asset.create({ data: { ...dto, tenantId: u.tenantId, purchaseDate: dt(dto.purchaseDate), nextServiceAt: dt(dto.nextServiceAt) } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'Asset', entityId: a.id });
    return a;
  }
  async update(u: AuthUser, id: string, dto: UpdateAssetDto) {
    await this.get(u, id);
    return this.prisma.asset.update({ where: { id }, data: { ...dto, purchaseDate: dt(dto.purchaseDate), nextServiceAt: dt(dto.nextServiceAt) } });
  }
  /** Record a completed service and set the next due date. */
  async serviced(u: AuthUser, id: string, nextServiceAt?: string) {
    await this.get(u, id);
    const next = nextServiceAt ? new Date(nextServiceAt) : new Date(Date.now() + 180 * 86400000);
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'MAINTENANCE', entity: 'Asset', entityId: id, data: { nextServiceAt: next } });
    return this.prisma.asset.update({ where: { id }, data: { nextServiceAt: next, status: 'IN_USE' } });
  }
  maintenanceDue(u: AuthUser, days = 30) {
    return this.prisma.asset.findMany({
      where: { tenantId: u.tenantId, status: { not: 'DISPOSED' }, nextServiceAt: { lte: new Date(Date.now() + days * 86400000) } },
      orderBy: { nextServiceAt: 'asc' },
    }).then((rows) => rows.map((a) => ({ ...a, overdue: !!a.nextServiceAt && a.nextServiceAt < new Date() })));
  }
  async depreciationReport(u: AuthUser, asOfStr?: string) {
    const asOf = asOfStr ? new Date(asOfStr) : new Date();
    const rows = (await this.prisma.asset.findMany({ where: { tenantId: u.tenantId, status: { not: 'DISPOSED' } } })).map((a) => this.withDep(a, asOf));
    const tot = (k: 'accumulatedMinor' | 'netBookValueMinor' | 'annualMinor') => rows.reduce((s, r) => s + (r.depreciation?.[k] ?? 0), 0);
    return {
      asOf, rows, totalCostMinor: rows.reduce((s, r) => s + r.costMinor, 0),
      totalAccumulatedMinor: tot('accumulatedMinor'), totalNetBookValueMinor: tot('netBookValueMinor'), totalAnnualChargeMinor: tot('annualMinor'),
    };
  }
}

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  list(u: AuthUser, year?: number) {
    return this.prisma.budget.findMany({ where: { tenantId: u.tenantId, ...(year ? { year } : {}) }, orderBy: [{ year: 'desc' }, { department: 'asc' }] });
  }
  create(u: AuthUser, dto: BudgetDto) {
    return this.prisma.budget.create({ data: { tenantId: u.tenantId, year: dto.year, department: dto.department, lines: dto.lines as any } });
  }
  async update(u: AuthUser, id: string, dto: UpdateBudgetDto) {
    const b = await this.prisma.budget.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!b) throw new NotFoundException('Budget not found');
    return this.prisma.budget.update({ where: { id }, data: { status: dto.status, lines: dto.lines as any } });
  }
  /** Budget vs actual: actuals from GL journal lines in the budget year (matching costCentre unless department = FACILITY). */
  async vsActual(u: AuthUser, id: string) {
    const b = await this.prisma.budget.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!b) throw new NotFoundException('Budget not found');
    const lines = b.lines as unknown as { accountCode: string; amountMinor: number }[];
    const accounts = await this.prisma.account.findMany({ where: { tenantId: u.tenantId }, select: { code: true, name: true, type: true } });
    const acc = new Map(accounts.map((a) => [a.code, a]));
    const journals = await this.prisma.journalEntry.findMany({
      where: { tenantId: u.tenantId, date: { gte: new Date(Date.UTC(b.year, 0, 1)), lt: new Date(Date.UTC(b.year + 1, 0, 1)) } },
      select: { lines: true },
    });
    const actual = new Map<string, number>();
    const whole = b.department.toUpperCase() === 'FACILITY';
    for (const j of journals) for (const l of j.lines as unknown as JournalLine[]) {
      if (!whole && l.costCentre !== b.department) continue;
      const type = acc.get(l.accountCode)?.type ?? 'EXPENSE';
      const amt = ['ASSET', 'EXPENSE'].includes(type) ? l.debitMinor - l.creditMinor : l.creditMinor - l.debitMinor;
      actual.set(l.accountCode, (actual.get(l.accountCode) ?? 0) + amt);
    }
    const rows = lines.map((l) => {
      const a = actual.get(l.accountCode) ?? 0;
      return {
        accountCode: l.accountCode, accountName: acc.get(l.accountCode)?.name ?? null, budgetMinor: l.amountMinor, actualMinor: a,
        varianceMinor: l.amountMinor - a, utilisationPct: l.amountMinor ? Math.round((a / l.amountMinor) * 1000) / 10 : null,
      };
    });
    return {
      ...b, rows,
      totalBudgetMinor: rows.reduce((s, r) => s + r.budgetMinor, 0),
      totalActualMinor: rows.reduce((s, r) => s + r.actualMinor, 0),
    };
  }
}

@Controller('assets')
@Roles('ACCOUNTANT', 'MANAGER', 'STOREKEEPER')
export class AssetsController {
  constructor(private svc: AssetsService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ListQueryDto, @Query('category') category?: string, @Query('status') status?: string) {
    return this.svc.list(u, { ...q, category, status });
  }
  @Get('maintenance-due') due(@CurrentUser() u: AuthUser, @Query('days') days?: string) { return this.svc.maintenanceDue(u, days ? Number(days) : 30); }
  @Get('depreciation') dep(@CurrentUser() u: AuthUser, @Query('asOf') asOf?: string) { return this.svc.depreciationReport(u, asOf); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: AssetDto) { return this.svc.create(u, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAssetDto) { return this.svc.update(u, id, dto); }
  @Post(':id/serviced') serviced(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('nextServiceAt') next?: string) { return this.svc.serviced(u, id, next); }
}

@Controller('budgets')
@Roles('ACCOUNTANT', 'MANAGER')
export class BudgetsController {
  constructor(private svc: BudgetsService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query('year') year?: string) { return this.svc.list(u, year ? Number(year) : undefined); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: BudgetDto) { return this.svc.create(u, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateBudgetDto) { return this.svc.update(u, id, dto); }
  @Get(':id/vs-actual') vsActual(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.vsActual(u, id); }
}

@Module({ providers: [AssetsService, BudgetsService], controllers: [AssetsController, BudgetsController] })
export class AssetsModule {}
