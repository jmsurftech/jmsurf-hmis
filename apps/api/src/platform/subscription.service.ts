import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Injectable, Logger, NotFoundException, Param, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IsString, Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth-user';
import { MOBILE_MONEY, MobileMoneyPort } from '../integrations/ports';
import { parseStkCallback } from '../integrations/ke/mpesa/mpesa.util';
import { calcInvoice, INVOICE_DUE_DAYS, nextStatus, PER_VISIT_MINOR, PLAN_BASE_MINOR, previousPeriod } from './subscription.rules';
import { invalidateTenantCache } from './guards';

class PayDto { @IsString() @Matches(/^(\+?254|0)?[17]\d{8}$/, { message: 'Enter a valid Kenyan mobile number' }) phone: string }

/** Settles a subscription invoice from an M-Pesa STK callback. Returns false if the CheckoutRequestID isn't a subscription. */
export async function settleSubscriptionStk(prisma: PrismaService, cb: { checkoutRequestId: string; success: boolean; mpesaReceiptNumber?: string }) {
  const inv = await prisma.subscriptionInvoice.findFirst({ where: { checkoutRequestId: cb.checkoutRequestId } });
  if (!inv) return false;
  if (inv.status === 'PAID') return true;
  await prisma.subscriptionInvoice.update({
    where: { id: inv.id },
    data: cb.success ? { status: 'PAID', paidAt: new Date(), paymentRef: cb.mpesaReceiptNumber ?? cb.checkoutRequestId } : { status: 'UNPAID' },
  });
  if (cb.success) await applyDunning(prisma, inv.tenantId);
  return true;
}

/** Re-evaluates one tenant's subscription status. */
export async function applyDunning(prisma: PrismaService, tenantId: string, now = new Date()) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!t) return null;
  const oldest = await prisma.subscriptionInvoice.findFirst({ where: { tenantId, status: { in: ['UNPAID', 'PENDING'] } }, orderBy: { dueDate: 'asc' } });
  const hasPaid = (await prisma.subscriptionInvoice.count({ where: { tenantId, status: 'PAID' } })) > 0;
  const next = nextStatus({ status: t.subscriptionStatus, trialEndsAt: t.trialEndsAt, oldestUnpaidDue: oldest?.dueDate ?? null, hasPaid, now });
  if (next !== t.subscriptionStatus) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: next as any } });
    invalidateTenantCache(tenantId);
    return { from: t.subscriptionStatus, to: next };
  }
  return null;
}

@Injectable()
export class SubscriptionService {
  private log = new Logger('Subscription');
  constructor(private prisma: PrismaService, private audit: AuditService, @Inject(MOBILE_MONEY) private mobileMoney: MobileMoneyPort) {}

  /** Generates invoices for every billable tenant for `period` (default: last month). Idempotent per (tenant, period). */
  async generate(periodArg?: string, now = new Date()) {
    let { period, start, end } = previousPeriod(now);
    if (periodArg) {
      if (!/^\d{4}-\d{2}$/.test(periodArg)) throw new BadRequestException('period must be YYYY-MM');
      const [y, m] = periodArg.split('-').map(Number);
      period = periodArg; start = new Date(Date.UTC(y, m - 1, 1)); end = new Date(Date.UTC(y, m, 1));
    }
    const tenants = await this.prisma.tenant.findMany({ where: { subscriptionStatus: { notIn: ['CANCELLED'] } } });
    const created: string[] = [];
    for (const t of tenants) {
      // trials are free until trialEndsAt; skip periods that ended inside the trial
      if (t.subscriptionStatus === 'TRIAL' && (!t.trialEndsAt || t.trialEndsAt >= end)) continue;
      if (await this.prisma.subscriptionInvoice.findUnique({ where: { tenantId_period: { tenantId: t.id, period } } })) continue;
      const visits = await this.prisma.visit.count({ where: { tenantId: t.id, startedAt: { gte: start, lt: end } } });
      const calc = calcInvoice(t.plan, visits, (t.settings ?? {}) as any);
      const inv = await this.prisma.subscriptionInvoice.create({
        data: {
          tenantId: t.id, number: `SUB-${period.replace('-', '')}-${t.slug.slice(0, 12).toUpperCase()}-${t.id.slice(0, 4).toUpperCase()}`,
          period, plan: t.plan, ...calc, currency: 'KES', dueDate: new Date(now.getTime() + INVOICE_DUE_DAYS * 86400000),
          status: calc.amountMinor === 0 ? 'PAID' : 'UNPAID', paidAt: calc.amountMinor === 0 ? now : null,
        },
      });
      created.push(inv.id);
    }
    this.log.log(`Generated ${created.length} subscription invoices for ${period}`);
    return { period, created: created.length };
  }

  async runDunning(now = new Date()) {
    const tenants = await this.prisma.tenant.findMany({ where: { subscriptionStatus: { not: 'CANCELLED' } }, select: { id: true } });
    const changes: any[] = [];
    for (const t of tenants) {
      const c = await applyDunning(this.prisma, t.id, now);
      if (c) {
        changes.push({ tenantId: t.id, ...c });
        await this.audit.log({ tenantId: t.id, action: 'SUBSCRIPTION_STATUS', entity: 'Tenant', entityId: t.id, data: c });
      }
    }
    return { checked: tenants.length, changes };
  }

  @Cron('5 0 1 * *', { name: 'subscription-invoices', timeZone: 'Africa/Nairobi' })
  async monthly() { await this.generate(); }

  @Cron('15 1 * * *', { name: 'subscription-dunning', timeZone: 'Africa/Nairobi' })
  async daily() { await this.runDunning(); }

  async summary(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, plan: true, subscriptionStatus: true, trialEndsAt: true, enabledModules: true, settings: true } });
    const invoices = await this.prisma.subscriptionInvoice.findMany({ where: { tenantId }, orderBy: { period: 'desc' }, take: 24 });
    const { start } = previousPeriod(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)));
    const visitsThisMonth = await this.prisma.visit.count({ where: { tenantId, startedAt: { gte: start } } });
    const s = (t.settings ?? {}) as any;
    return {
      ...t, settings: undefined, invoices, visitsThisMonth,
      estimate: calcInvoice(t.plan, visitsThisMonth, s),
      pricing: { plans: PLAN_BASE_MINOR, perVisitMinor: PER_VISIT_MINOR },
      outstandingMinor: invoices.filter((i) => i.status !== 'PAID' && i.status !== 'VOID').reduce((a, i) => a + i.amountMinor, 0),
    };
  }

  async pay(u: AuthUser, id: string, phone: string) {
    const inv = await this.prisma.subscriptionInvoice.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'PAID' || inv.status === 'VOID') throw new BadRequestException(`Invoice is ${inv.status}`);
    // Paid into the platform's own Paybill (platform M-Pesa config), not the hospital's.
    const r = await this.mobileMoney.stkPush({ phone, amountMinor: inv.amountMinor, accountRef: inv.number.slice(0, 12), description: `JMSURF subscription ${inv.period}` });
    await this.prisma.subscriptionInvoice.update({ where: { id }, data: { status: 'PENDING', checkoutRequestId: r.checkoutRequestId } });
    await this.audit.log({ tenantId: u.tenantId, userId: u.sub, action: 'SUBSCRIPTION_PAY_INIT', entity: 'SubscriptionInvoice', entityId: id, data: { checkoutRequestId: r.checkoutRequestId } });
    return { checkoutRequestId: r.checkoutRequestId, status: 'PENDING' };
  }

  async markPaid(adminId: string, id: string, ref?: string) {
    const inv = await this.prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const r = await this.prisma.subscriptionInvoice.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), paymentRef: ref ?? `MANUAL-${adminId.slice(0, 8)}` } });
    await applyDunning(this.prisma, inv.tenantId);
    await this.audit.log({ tenantId: inv.tenantId, userId: adminId, action: 'SUBSCRIPTION_MARK_PAID', entity: 'SubscriptionInvoice', entityId: id, data: { ref } });
    return r;
  }

  async callback(payload: any) {
    try { await settleSubscriptionStk(this.prisma, parseStkCallback(payload)); } catch (e) { this.log.warn(`Bad subscription STK callback: ${(e as Error).message}`); }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}

@Controller('subscription')
export class SubscriptionController {
  constructor(private svc: SubscriptionService) {}
  @Get() @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT') summary(@CurrentUser() u: AuthUser) { return this.svc.summary(u.tenantId); }
  @Post('invoices/:id/pay') @Roles('ADMIN', 'ACCOUNTANT') pay(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PayDto) { return this.svc.pay(u, id, dto.phone); }
  @Get('invoices/:id') @Roles('ADMIN', 'ACCOUNTANT') async one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.svc.summary(u.tenantId);
    const inv = s.invoices.find((i) => i.id === id);
    if (!inv) throw new NotFoundException();
    return inv;
  }
  @Public() @Post('mpesa/callback') @HttpCode(200) callback(@Body() body: any) { return this.svc.callback(body); }
}
