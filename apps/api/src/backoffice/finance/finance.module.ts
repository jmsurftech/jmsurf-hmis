import {
  BadRequestException, Body, Controller, Get, Global, Injectable, Logger, Module, Param, Post, Query,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ListQueryDto, pageArgs } from '../shared';
import {
  AGEING_BUCKETS, ageingBucket, balanceSheet, billJournalLines, compactLines, incomeStatement, JournalLine,
  JournalValidationError, KENYA_HEALTHCARE_COA, paymentJournalLines, trialBalance, validateJournal,
} from './accounting.rules';

export interface PostJournalInput {
  tenantId: string;
  date?: Date;
  reference?: string;
  sourceType?: string; // BILL, PAYMENT, GRN, PAYROLL, STOCK, MANUAL...
  sourceId?: string;
  memo?: string;
  lines: JournalLine[];
  postedBy?: string;
}

/** General-ledger posting service. Global: any module may inject it and call post(). */
@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Post a balanced journal. Idempotent when sourceType+sourceId are given: an existing journal for that
   * source is returned instead of creating a duplicate.
   */
  async post(input: PostJournalInput) {
    const lines = compactLines(input.lines);
    try {
      validateJournal(lines);
    } catch (e) {
      if (e instanceof JournalValidationError) throw new BadRequestException(e.message);
      throw e;
    }
    if (input.sourceType && input.sourceId) {
      const existing = await this.prisma.journalEntry.findFirst({
        where: { tenantId: input.tenantId, sourceType: input.sourceType, sourceId: input.sourceId },
      });
      if (existing) return existing;
    }
    await this.ensureChart(input.tenantId);
    const known = new Set((await this.prisma.account.findMany({ where: { tenantId: input.tenantId }, select: { code: true } })).map((a) => a.code));
    const unknown = lines.filter((l) => !known.has(l.accountCode)).map((l) => l.accountCode);
    if (unknown.length) throw new BadRequestException(`Unknown account(s): ${unknown.join(', ')}`);
    return this.prisma.journalEntry.create({
      data: {
        tenantId: input.tenantId, date: input.date ?? new Date(), reference: input.reference, sourceType: input.sourceType ?? 'MANUAL',
        sourceId: input.sourceId, memo: input.memo, lines: lines as any, postedBy: input.postedBy,
      },
    });
  }

  /** Create the Kenyan healthcare template accounts that are missing (idempotent). */
  async seedChart(tenantId: string) {
    const existing = new Set((await this.prisma.account.findMany({ where: { tenantId }, select: { code: true } })).map((a) => a.code));
    const toCreate = KENYA_HEALTHCARE_COA.filter((a) => !existing.has(a.code));
    for (const a of toCreate.filter((x) => !x.parent)) {
      await this.prisma.account.create({ data: { tenantId, code: a.code, name: a.name, type: a.type } });
    }
    const all = await this.prisma.account.findMany({ where: { tenantId } });
    const idByCode = new Map(all.map((a) => [a.code, a.id]));
    for (const a of toCreate.filter((x) => x.parent)) {
      await this.prisma.account.create({ data: { tenantId, code: a.code, name: a.name, type: a.type, parentId: idByCode.get(a.parent!) } });
    }
    return { created: toCreate.length, total: existing.size + toCreate.length };
  }

  async ensureChart(tenantId: string) {
    if ((await this.prisma.account.count({ where: { tenantId } })) === 0) await this.seedChart(tenantId);
  }

  async postPayment(tenantId: string, paymentId: string) {
    const p = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId } });
    if (!p || p.status !== 'COMPLETED' || p.amountMinor <= 0) return null;
    return this.post({
      tenantId, date: p.createdAt, reference: p.receiptNumber, sourceType: 'PAYMENT', sourceId: p.id,
      memo: `Receipt ${p.receiptNumber} (${p.method})`, lines: paymentJournalLines(p),
    });
  }

  async postBill(tenantId: string, billId: string) {
    const b = await this.prisma.bill.findFirst({
      where: { id: billId, tenantId }, include: { lines: { where: { voided: false } }, visit: { select: { payerType: true } } },
    });
    if (!b || !['FINAL', 'PAID', 'PARTIALLY_PAID'].includes(b.status) || !b.lines.length) return null;
    const svcIds = b.lines.map((l) => l.serviceItemId).filter((x): x is string => !!x);
    const svc = await this.prisma.serviceItem.findMany({ where: { tenantId, id: { in: svcIds } }, select: { id: true, category: true } });
    const cat = new Map(svc.map((s) => [s.id, s.category]));
    const lines = billJournalLines({
      discountMinor: b.discountMinor, payerAmountMinor: b.payerAmountMinor, payerType: b.visit.payerType,
      lines: b.lines.map((l) => ({
        totalMinor: l.totalMinor, vatMinor: l.vatMinor,
        category: l.serviceItemId ? cat.get(l.serviceItemId) ?? null : l.stockItemId ? 'PHARMACY' : null,
      })),
    });
    if (lines.length < 2) return null;
    return this.post({ tenantId, date: b.updatedAt, reference: b.billNumber, sourceType: 'BILL', sourceId: b.id, memo: `Invoice ${b.billNumber}`, lines });
  }

  /** Post journals for all completed payments and finalized bills not yet journaled. */
  async autoPost(tenantId: string, limit = 1000) {
    const payments = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Payment" p WHERE p."tenantId" = ${tenantId} AND p.status = 'COMPLETED'
      AND NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."tenantId" = p."tenantId" AND j."sourceType" = 'PAYMENT' AND j."sourceId" = p.id)
      ORDER BY p."createdAt" LIMIT ${limit}`;
    const bills = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT b.id FROM "Bill" b WHERE b."tenantId" = ${tenantId} AND b.status::text IN ('FINAL','PAID','PARTIALLY_PAID')
      AND NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."tenantId" = b."tenantId" AND j."sourceType" = 'BILL' AND j."sourceId" = b.id)
      ORDER BY b."createdAt" LIMIT ${limit}`;
    let posted = 0;
    const errors: string[] = [];
    for (const b of bills) {
      try { if (await this.postBill(tenantId, b.id)) posted++; } catch (e: any) { errors.push(`BILL ${b.id}: ${e.message}`); }
    }
    for (const p of payments) {
      try { if (await this.postPayment(tenantId, p.id)) posted++; } catch (e: any) { errors.push(`PAYMENT ${p.id}: ${e.message}`); }
    }
    return { posted, bills: bills.length, payments: payments.length, errors };
  }

  async journalsBetween(tenantId: string, from?: Date, to?: Date) {
    const rows = await this.prisma.journalEntry.findMany({
      where: { tenantId, date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
      select: { lines: true },
    });
    return rows.map((r) => ({ lines: r.lines as unknown as JournalLine[] }));
  }

  async trialBalance(tenantId: string, from?: Date, to?: Date) {
    const accounts = await this.prisma.account.findMany({ where: { tenantId }, select: { code: true, name: true, type: true } });
    return trialBalance(accounts, await this.journalsBetween(tenantId, from, to));
  }
}

@Injectable()
export class AutoPostingJob {
  private readonly log = new Logger('AutoPostingJob');
  private running = false;
  constructor(private prisma: PrismaService, private accounting: AccountingService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({ where: { subscriptionStatus: { not: 'CANCELLED' } }, select: { id: true } });
      for (const t of tenants) {
        const r = await this.accounting.autoPost(t.id);
        if (r.posted || r.errors.length) this.log.log(`tenant ${t.id}: posted ${r.posted}, errors ${r.errors.length}`);
      }
    } catch (e: any) {
      this.log.error(e.message);
    } finally {
      this.running = false;
    }
  }
}

class JournalLineDto {
  @IsString() accountCode: string;
  @Type(() => Number) @IsInt() @Min(0) debitMinor: number;
  @Type(() => Number) @IsInt() @Min(0) creditMinor: number;
  @IsOptional() @IsString() costCentre?: string;
  @IsOptional() @IsString() memo?: string;
}
class ManualJournalDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() memo?: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines: JournalLineDto[];
}
class AccountDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']) type: string;
  @IsOptional() @IsString() parentId?: string;
}
class JournalQueryDto extends ListQueryDto {
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

const d = (s?: string) => (s ? new Date(s) : undefined);
const endOf = (s?: string) => (s ? new Date(new Date(s).getTime() + (s.length <= 10 ? 86399999 : 0)) : undefined);

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService, private accounting: AccountingService, private audit: AuditService) {}

  accounts(u: AuthUser) {
    return this.prisma.account.findMany({ where: { tenantId: u.tenantId }, orderBy: { code: 'asc' } });
  }
  createAccount(u: AuthUser, dto: AccountDto) {
    return this.prisma.account.create({ data: { ...dto, tenantId: u.tenantId } });
  }
  async journals(u: AuthUser, q: JournalQueryDto) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: any = { tenantId: u.tenantId };
    if (q.sourceType) where.sourceType = q.sourceType;
    if (q.from || q.to) where.date = { ...(q.from ? { gte: d(q.from) } : {}), ...(q.to ? { lte: endOf(q.to) } : {}) };
    if (q.q) where.OR = [{ reference: { contains: q.q, mode: 'insensitive' } }, { memo: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({ where, skip, take, orderBy: { date: 'desc' } }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }
  async manualJournal(u: AuthUser, dto: ManualJournalDto) {
    const j = await this.accounting.post({
      tenantId: u.tenantId, date: d(dto.date), reference: dto.reference, memo: dto.memo, lines: dto.lines, postedBy: u.sub, sourceType: 'MANUAL',
    });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'CREATE', entity: 'JournalEntry', entityId: j.id });
    return j;
  }
  async incomeStatement(u: AuthUser, from?: string, to?: string) {
    const tb = await this.accounting.trialBalance(u.tenantId, d(from), endOf(to));
    return { from, to, ...incomeStatement(tb.rows) };
  }
  async balanceSheet(u: AuthUser, asOf?: string) {
    const tb = await this.accounting.trialBalance(u.tenantId, undefined, endOf(asOf));
    return { asOf: asOf ?? new Date().toISOString().slice(0, 10), ...balanceSheet(tb.rows) };
  }

  /** Outstanding balances by payer (patient portion vs scheme portion), aged by invoice date. */
  async debtorsAgeing(u: AuthUser, asOfStr?: string) {
    const asOf = asOfStr ? endOf(asOfStr)! : new Date();
    const bills = await this.prisma.bill.findMany({
      where: { tenantId: u.tenantId, status: { in: ['FINAL', 'PARTIALLY_PAID', 'PAID'] }, createdAt: { lte: asOf } },
      select: {
        id: true, billNumber: true, createdAt: true, totalMinor: true, discountMinor: true, payerAmountMinor: true, patientAmountMinor: true, paidMinor: true,
        visit: { select: { payerType: true, schemeId: true } },
      },
    });
    const schemes = await this.prisma.scheme.findMany({ where: { tenantId: u.tenantId }, include: { payer: true } });
    const payerBySchemeId = new Map(schemes.map((s) => [s.id, s.payer.name]));
    const claims = await this.prisma.claim.findMany({
      where: { tenantId: u.tenantId, billId: { in: bills.map((b) => b.id) } }, select: { billId: true, paidMinor: true, status: true },
    });
    const claimPaid = new Map<string, number>();
    for (const c of claims) claimPaid.set(c.billId, (claimPaid.get(c.billId) ?? 0) + (c.paidMinor ?? 0));
    const table = new Map<string, Record<string, number>>();
    const add = (payer: string, bucket: string, amt: number) => {
      if (amt <= 0) return;
      const row = table.get(payer) ?? Object.fromEntries([...AGEING_BUCKETS.map((b) => [b, 0]), ['total', 0]]);
      row[bucket] += amt;
      row.total += amt;
      table.set(payer, row);
    };
    for (const b of bills) {
      const bucket = ageingBucket(asOf, b.createdAt);
      const net = b.totalMinor - b.discountMinor;
      const scheme = b.payerAmountMinor;
      const patientDue = b.patientAmountMinor || Math.max(0, net - scheme);
      add('Patients (self-pay)', bucket, patientDue - b.paidMinor);
      if (scheme > 0) {
        const payer = (b.visit.schemeId && payerBySchemeId.get(b.visit.schemeId)) || (b.visit.payerType === 'SHA' ? 'SHA' : 'Other schemes');
        add(payer, bucket, scheme - (claimPaid.get(b.id) ?? 0));
      }
    }
    const rows: Record<string, any>[] = [...table.entries()].map(([payer, r]) => ({ payer, ...r })).sort((a: any, b: any) => b.total - a.total);
    const totals = Object.fromEntries([...AGEING_BUCKETS, 'total'].map((k) => [k, rows.reduce((s, r: any) => s + r[k], 0)]));
    return { asOf: asOf.toISOString(), buckets: AGEING_BUCKETS, rows, totals };
  }
}

@Controller('finance')
@Roles('ACCOUNTANT', 'MANAGER')
export class FinanceController {
  constructor(private svc: FinanceService, private accounting: AccountingService) {}

  @Get('accounts') accounts(@CurrentUser() u: AuthUser) { return this.svc.accounts(u); }
  @Post('accounts') @Roles('ACCOUNTANT') createAccount(@CurrentUser() u: AuthUser, @Body() dto: AccountDto) { return this.svc.createAccount(u, dto); }
  @Post('accounts/seed-template') @Roles('ACCOUNTANT') seedChart(@CurrentUser() u: AuthUser) { return this.accounting.seedChart(u.tenantId); }

  @Get('journals') journals(@CurrentUser() u: AuthUser, @Query() q: JournalQueryDto) { return this.svc.journals(u, q); }
  @Post('journals') @Roles('ACCOUNTANT') manualJournal(@CurrentUser() u: AuthUser, @Body() dto: ManualJournalDto) { return this.svc.manualJournal(u, dto); }
  @Post('auto-post') @Roles('ACCOUNTANT') autoPost(@CurrentUser() u: AuthUser) { return this.accounting.autoPost(u.tenantId); }
  @Post('post/:sourceType/:id') @Roles('ACCOUNTANT')
  postSource(@CurrentUser() u: AuthUser, @Param('sourceType') t: string, @Param('id') id: string) {
    if (t.toUpperCase() === 'BILL') return this.accounting.postBill(u.tenantId, id);
    if (t.toUpperCase() === 'PAYMENT') return this.accounting.postPayment(u.tenantId, id);
    throw new BadRequestException('sourceType must be BILL or PAYMENT');
  }

  @Get('reports/trial-balance') trialBalance(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.trialBalance(u.tenantId, d(from), endOf(to));
  }
  @Get('reports/income-statement') incomeStatement(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.incomeStatement(u, from, to);
  }
  @Get('reports/balance-sheet') balanceSheet(@CurrentUser() u: AuthUser, @Query('asOf') asOf?: string) { return this.svc.balanceSheet(u, asOf); }
  @Get('reports/debtors-ageing') @Roles('ACCOUNTANT', 'MANAGER', 'CLAIMS_OFFICER')
  debtorsAgeing(@CurrentUser() u: AuthUser, @Query('asOf') asOf?: string) { return this.svc.debtorsAgeing(u, asOf); }
}

@Global()
@Module({
  providers: [AccountingService, FinanceService, AutoPostingJob],
  controllers: [FinanceController],
  exports: [AccountingService, FinanceService],
})
export class FinanceModule {}
