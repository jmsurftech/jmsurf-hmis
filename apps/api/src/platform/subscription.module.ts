import {
  BadRequestException, Body, Controller, Get, Injectable, Logger, Module, NotFoundException, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { MailService } from '../common/mail.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth-user';
import { ListQuery, pageArgs, paged } from '../revenue/list-query';
import { SuperAdminGuard, TenantStatusCache } from './platform.module';

export interface Pricing { CLINIC: number; HOSPITAL: number; PER_VISIT: number; discounts: Record<string, number>; graceDays: number }
/** Published prices (minor units, VAT exclusive). Super admins can change them in the console (PlatformSetting "pricing"). */
export const DEFAULT_PRICING: Pricing = { CLINIC: 499900, HOSPITAL: 1499900, PER_VISIT: 4900, discounts: { 1: 0, 3: 0, 6: 5, 12: 15 }, graceDays: 7 };
const DAY = 86400000;
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

class PayDto {
  @Matches(/^(\+?254|0)?[17]\d{8}$/, { message: 'Enter a Safaricom number starting with 07 or 01' }) phone: string;
  @IsOptional() @Type(() => Number) @IsIn([1, 3, 6, 12]) months?: number;
  @IsOptional() @IsIn(['CLINIC', 'HOSPITAL']) plan?: string;
}
class RecordPaymentDto {
  @IsIn(['BANK', 'MPESA', 'WAIVER']) method: string;
  @IsString() reference: string;
}
class InvoiceQuery extends ListQuery {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() status?: string;
}
class PricingDto {
  @Type(() => Number) @IsInt() @Min(0) CLINIC: number;
  @Type(() => Number) @IsInt() @Min(0) HOSPITAL: number;
  @Type(() => Number) @IsInt() @Min(0) PER_VISIT: number;
  @IsObject() discounts: Record<string, number>;
  @Type(() => Number) @IsInt() @Min(0) @Max(60) graceDays: number;
}

/** JMSURF PAY: the platform's own M-Pesa collection account (same API the eTIMS Hub and SMS use). */
const payBase = () => (process.env.JMSURFPAY_URL || 'https://jmsurfpay.co.ke').replace(/\/+$/, '');
const kePhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.startsWith('254') ? d : d.startsWith('0') ? `254${d.slice(1)}` : `254${d}`; };

@Injectable()
export class SubscriptionService {
  private log = new Logger('Subscription');
  private polled = new Map<string, number>();
  constructor(private prisma: PrismaService, private audit: AuditService, private mail: MailService) {}

  async pricing(): Promise<Pricing> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } });
    return { ...DEFAULT_PRICING, ...((row?.value as any) ?? {}) };
  }
  async setPricing(admin: AuthUser, dto: PricingDto) {
    const value = { CLINIC: dto.CLINIC, HOSPITAL: dto.HOSPITAL, PER_VISIT: dto.PER_VISIT, discounts: dto.discounts, graceDays: dto.graceDays };
    await this.prisma.platformSetting.upsert({ where: { key: 'pricing' }, update: { value }, create: { key: 'pricing', value } });
    await this.audit.log({ userId: admin.sub, action: 'PLATFORM_PRICING_UPDATE', entity: 'PlatformSetting', entityId: 'pricing', data: value });
    return value;
  }

  private perVisit(t: { settings: any }) { return (t.settings as any)?.billingModel === 'PER_VISIT'; }
  private async nextNumber() {
    const y = new Date().getFullYear();
    const n = await this.prisma.subscriptionInvoice.count({ where: { number: { startsWith: `SUB-${y}-` } } });
    return `SUB-${y}-${String(n + 1).padStart(5, '0')}`;
  }
  amountFor(p: Pricing, plan: string, months: number) {
    const monthly = plan === 'CLINIC' ? p.CLINIC : p.HOSPITAL;
    const off = Number(p.discounts?.[String(months)] ?? 0);
    return Math.round((monthly * months * (100 - off)) / 100 / 100) * 100; // whole shillings
  }

  /** Where the tenant stands, for the banner and the subscription page. */
  async status(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const p = await this.pricing();
    const open = await this.prisma.subscriptionInvoice.findMany({ where: { tenantId, status: { in: ['OPEN', 'PENDING'] } }, orderBy: { dueAt: 'asc' } });
    const now = Date.now();
    const lapse = this.lapseDate(t);
    return {
      plan: t.plan, status: t.subscriptionStatus, billingModel: this.perVisit(t) ? 'PER_VISIT' : 'SUBSCRIPTION', trialEndsAt: t.trialEndsAt, paidUntil: t.paidUntil,
      daysLeft: lapse ? Math.ceil((lapse.getTime() - now) / DAY) : null,
      readOnlyAt: lapse && ['GRACE'].includes(t.subscriptionStatus) ? new Date(lapse.getTime() + p.graceDays * DAY) : null,
      openInvoices: open, payConfigured: !!process.env.JMSURFPAY_API_KEY,
      prices: { CLINIC: p.CLINIC, HOSPITAL: p.HOSPITAL, PER_VISIT: p.PER_VISIT, discounts: p.discounts, graceDays: p.graceDays },
      managed: t.plan === 'ENTERPRISE' || !!(t.settings as any)?.billingManual,
    };
  }
  invoices(tenantId: string) { return this.prisma.subscriptionInvoice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }); }

  private lapseDate(t: { subscriptionStatus: string; trialEndsAt: Date | null; paidUntil: Date | null }) {
    const ends = [t.trialEndsAt, t.paidUntil].filter(Boolean) as Date[];
    return ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
  }

  /** Starts an M-Pesa prompt for the tenant's open invoice (or a new one for the months chosen). */
  async pay(u: AuthUser, dto: PayDto) {
    if (!process.env.JMSURFPAY_API_KEY) throw new BadRequestException('Online payment is not switched on yet. Pay by bank and send the slip to JMSURF support.');
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId } });
    const p = await this.pricing();
    let inv = await this.prisma.subscriptionInvoice.findFirst({ where: { tenantId: t.id, status: { in: ['OPEN', 'PENDING'] } }, orderBy: { dueAt: 'asc' } });
    if (inv?.status === 'PENDING' && inv.updatedAt.getTime() > Date.now() - 90_000) throw new BadRequestException('A prompt was just sent. Check the phone or wait a minute.');
    if (!this.perVisit(t) && (!inv || inv.kind === 'SUBSCRIPTION')) {
      const plan = dto.plan ?? (t.plan === 'CLINIC' ? 'CLINIC' : 'HOSPITAL');
      const months = dto.months ?? inv?.months ?? 1;
      const start = new Date(Math.max(Date.now(), this.lapseDate(t)?.getTime() ?? 0));
      const data = { plan, months, amountMinor: this.amountFor(p, plan, months), periodStart: start, periodEnd: addMonths(start, months) };
      inv = inv ? await this.prisma.subscriptionInvoice.update({ where: { id: inv.id }, data })
        : await this.prisma.subscriptionInvoice.create({ data: { tenantId: t.id, number: await this.nextNumber(), dueAt: start, ...data } });
    }
    if (!inv) throw new BadRequestException('There is nothing to pay right now.');
    const res = await fetch(`${payBase()}/api/payments/stkpush`, {
      method: 'POST', headers: { 'X-API-Key': process.env.JMSURFPAY_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: kePhone(dto.phone), amount: Math.ceil(inv.amountMinor / 100), accountReference: inv.number.replace(/-/g, '').slice(0, 12), transactionDesc: 'JMSURF HMIS',
        ...(process.env.JMSURFPAY_TENANT_CODE ? { tenantCode: process.env.JMSURFPAY_TENANT_CODE } : {}) }),
      signal: AbortSignal.timeout(30_000),
    }).catch((e) => { throw new BadRequestException(`M-Pesa could not be reached: ${e.message}`); });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || !j?.checkoutRequestId) throw new BadRequestException(j?.message ?? j?.error?.message ?? `M-Pesa request failed (HTTP ${res.status})`);
    inv = await this.prisma.subscriptionInvoice.update({ where: { id: inv.id }, data: { status: 'PENDING', checkoutRequestId: String(j.checkoutRequestId), phone: kePhone(dto.phone), failure: null } });
    await this.audit.log({ tenantId: t.id, userId: u.sub, action: 'SUBSCRIPTION_STK', entity: 'SubscriptionInvoice', entityId: inv.id, data: { amountMinor: inv.amountMinor, months: inv.months } });
    return inv;
  }

  /** Reads a pending prompt's result from JMSURF PAY (at most every 4 s per invoice) and settles it. */
  async refresh(tenantId: string | null, id: string) {
    const inv = await this.prisma.subscriptionInvoice.findFirst({ where: { id, ...(tenantId ? { tenantId } : {}) } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'PENDING' || !inv.checkoutRequestId || Date.now() - (this.polled.get(id) ?? 0) < 4000) return inv;
    this.polled.set(id, Date.now());
    try {
      const res = await fetch(`${payBase()}/api/payments/status/${encodeURIComponent(inv.checkoutRequestId)}`, { headers: { 'X-API-Key': process.env.JMSURFPAY_API_KEY ?? '' }, signal: AbortSignal.timeout(20_000) });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) return inv;
      const s = String(j.status ?? 'pending');
      if (s === 'completed') return this.settle(inv.id, 'MPESA', j.mpesaReceiptNumber ?? inv.checkoutRequestId, null);
      if (s === 'failed' || s === 'cancelled') return this.prisma.subscriptionInvoice.update({ where: { id }, data: { status: 'OPEN', failure: j.resultDesc ?? j.message ?? 'The payment was cancelled or failed' } });
      if (Date.now() - inv.updatedAt.getTime() > 10 * 60_000) return this.prisma.subscriptionInvoice.update({ where: { id }, data: { status: 'OPEN', failure: 'No answer from M-Pesa. If you paid, it will show here shortly.' } });
    } catch (e) { this.log.warn(`status check failed for ${inv.number}: ${(e as Error).message}`); }
    return inv;
  }

  /** Marks an invoice paid and moves the tenant's paid-up date forward. */
  async settle(id: string, method: string, reference: string, adminId: string | null) {
    const inv = await this.prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id } });
    if (inv.status === 'PAID') return inv;
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: inv.tenantId } });
    const paid = await this.prisma.subscriptionInvoice.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), method, reference, failure: null } });
    const data: any = {};
    if (inv.kind === 'SUBSCRIPTION') {
      const base = new Date(Math.max(Date.now(), this.lapseDate(t)?.getTime() ?? 0));
      data.paidUntil = addMonths(base, inv.months); data.plan = inv.plan;
    }
    await this.prisma.tenant.update({ where: { id: t.id }, data });
    await this.audit.log({ tenantId: t.id, userId: adminId ?? undefined, action: 'SUBSCRIPTION_PAID', entity: 'SubscriptionInvoice', entityId: id, data: { method, reference, amountMinor: inv.amountMinor } });
    await this.applyStatus(t.id);
    await this.notify(t.id, `Payment received: ${inv.number}`, `<p>Thank you. We received KES ${(inv.amountMinor / 100).toLocaleString('en-KE')} for invoice <b>${inv.number}</b> (${method} ${reference}).</p>${data.paidUntil ? `<p>Your subscription is paid up to <b>${data.paidUntil.toDateString()}</b>.</p>` : ''}`);
    return paid;
  }

  async record(admin: AuthUser, id: string, dto: RecordPaymentDto) {
    const inv = await this.prisma.subscriptionInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'PAID') throw new BadRequestException('This invoice is already paid');
    return this.settle(id, dto.method, dto.reference.trim(), admin.sub);
  }
  async voidInvoice(admin: AuthUser, id: string) {
    const inv = await this.prisma.subscriptionInvoice.update({ where: { id }, data: { status: 'VOID' } });
    await this.audit.log({ userId: admin.sub, action: 'SUBSCRIPTION_VOID', entity: 'SubscriptionInvoice', entityId: id });
    await this.applyStatus(inv.tenantId);
    return inv;
  }
  async allInvoices(q: InvoiceQuery) {
    const where: any = {};
    if (q.tenantId) where.tenantId = q.tenantId;
    if (q.status) where.status = { in: q.status.split(',') };
    if (q.q) where.number = { contains: q.q, mode: 'insensitive' };
    const [rows, total, paid30] = await Promise.all([
      this.prisma.subscriptionInvoice.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.subscriptionInvoice.count({ where }),
      this.prisma.subscriptionInvoice.aggregate({ where: { status: 'PAID', paidAt: { gte: new Date(Date.now() - 30 * DAY) } }, _sum: { amountMinor: true } }),
    ]);
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } }, select: { id: true, name: true } });
    return { ...paged(rows.map((r) => ({ ...r, tenant: tenants.find((t) => t.id === r.tenantId) ?? null })), total, q), paid30dMinor: paid30._sum.amountMinor ?? 0 };
  }

  /** Recomputes TRIAL / ACTIVE / GRACE / READ_ONLY from dates and unpaid invoices. Manual and enterprise tenants are left alone. */
  async applyStatus(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (t.plan === 'ENTERPRISE' || (t.settings as any)?.billingManual || t.subscriptionStatus === 'CANCELLED') return t.subscriptionStatus;
    const p = await this.pricing(); const now = Date.now(); const grace = p.graceDays * DAY;
    let next: string;
    if (this.perVisit(t)) {
      const overdue = await this.prisma.subscriptionInvoice.findFirst({ where: { tenantId, status: { in: ['OPEN', 'PENDING'] }, dueAt: { lt: new Date() } }, orderBy: { dueAt: 'asc' } });
      if (t.trialEndsAt && t.trialEndsAt.getTime() > now) next = 'TRIAL';
      else if (!overdue) next = 'ACTIVE';
      else next = now < overdue.dueAt.getTime() + grace ? 'GRACE' : 'READ_ONLY';
    } else {
      const lapse = this.lapseDate(t)?.getTime() ?? now;
      if (t.paidUntil && t.paidUntil.getTime() > now) next = 'ACTIVE';
      else if (t.trialEndsAt && t.trialEndsAt.getTime() > now) next = 'TRIAL';
      else next = now < lapse + grace ? 'GRACE' : 'READ_ONLY';
    }
    if (next !== t.subscriptionStatus) {
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: next as any } });
      TenantStatusCache.drop(tenantId);
      await this.audit.log({ tenantId, action: 'SUBSCRIPTION_STATUS', entity: 'Tenant', entityId: tenantId, data: { from: t.subscriptionStatus, to: next } });
      const url = `${(process.env.WEB_URL || 'https://hms.jmsurf.co.ke').replace(/\/$/, '')}/admin/subscription`;
      if (next === 'GRACE') await this.notify(tenantId, 'Your JMSURF HMIS subscription needs payment', `<p>${this.perVisit(t) ? 'Your usage invoice is overdue.' : 'Your trial or paid period has ended.'} Everything keeps working for ${p.graceDays} more days. After that the system becomes read-only until payment is made.</p>`, url);
      if (next === 'READ_ONLY') await this.notify(tenantId, 'JMSURF HMIS is now read-only', '<p>Your team can still view records, but nothing new can be saved until the subscription is paid. Paying with M-Pesa restores full access at once.</p>', url);
    }
    return next;
  }

  /** Renewal and usage invoices, then status for every tenant. Runs hourly; safe to repeat. */
  @Cron('0 15 * * * *')
  async run() {
    const p = await this.pricing(); const now = new Date();
    const tenants = await this.prisma.tenant.findMany({ where: { suspendedAt: null, plan: { not: 'ENTERPRISE' }, subscriptionStatus: { not: 'CANCELLED' } } });
    for (const t of tenants) {
      try {
        if ((t.settings as any)?.billingManual) continue;
        if (this.perVisit(t)) await this.usageInvoice(t, p);
        else {
          const lapse = this.lapseDate(t);
          const open = await this.prisma.subscriptionInvoice.findFirst({ where: { tenantId: t.id, kind: 'SUBSCRIPTION', status: { in: ['OPEN', 'PENDING'] } } });
          // Renewal invoice from 7 days before the paid or trial period ends.
          if (!open && lapse && lapse.getTime() - now.getTime() < 7 * DAY) {
            const plan = t.plan === 'CLINIC' ? 'CLINIC' : 'HOSPITAL';
            const start = new Date(Math.max(now.getTime(), lapse.getTime()));
            const inv = await this.prisma.subscriptionInvoice.create({ data: { tenantId: t.id, number: await this.nextNumber(), plan, months: 1, periodStart: start, periodEnd: addMonths(start, 1), amountMinor: this.amountFor(p, plan, 1), dueAt: lapse } });
            await this.notify(t.id, `Invoice ${inv.number}: JMSURF HMIS ${plan.toLowerCase()} plan`, `<p>Your ${t.subscriptionStatus === 'TRIAL' ? 'free trial' : 'subscription'} ends on <b>${lapse.toDateString()}</b>. Invoice <b>${inv.number}</b> for KES ${(inv.amountMinor / 100).toLocaleString('en-KE')} is ready. Pay with M-Pesa from Settings &gt; Subscription; longer periods get a discount.</p>`,
              `${(process.env.WEB_URL || 'https://hms.jmsurf.co.ke').replace(/\/$/, '')}/admin/subscription`);
          }
        }
        for (const inv of await this.prisma.subscriptionInvoice.findMany({ where: { tenantId: t.id, status: 'PENDING' } })) await this.refresh(null, inv.id);
        await this.applyStatus(t.id);
      } catch (e) { this.log.error(`billing run failed for ${t.name}: ${(e as Error).message}`); }
    }
  }

  /** Per-visit tenants: one invoice per calendar month, for visits after the trial. */
  private async usageInvoice(t: any, p: Pricing) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1); const end = new Date(now.getFullYear(), now.getMonth(), 1);
    if (t.createdAt >= end) return;
    if (await this.prisma.subscriptionInvoice.findFirst({ where: { tenantId: t.id, kind: 'USAGE', periodStart: start } })) return;
    const from = new Date(Math.max(start.getTime(), t.trialEndsAt?.getTime() ?? 0));
    const visits = from < end ? await this.prisma.visit.count({ where: { tenantId: t.id, startedAt: { gte: from, lt: end } } }) : 0;
    if (!visits) return;
    const inv = await this.prisma.subscriptionInvoice.create({ data: { tenantId: t.id, number: await this.nextNumber(), kind: 'USAGE', plan: 'PER_VISIT', months: 1, visits, periodStart: start, periodEnd: end, amountMinor: visits * p.PER_VISIT, dueAt: new Date(now.getTime() + 7 * DAY) } });
    await this.notify(t.id, `Invoice ${inv.number}: ${visits} patient visits`, `<p>${visits} visits in ${start.toLocaleString('en-KE', { month: 'long', year: 'numeric' })} at KES ${p.PER_VISIT / 100} each: <b>KES ${(inv.amountMinor / 100).toLocaleString('en-KE')}</b>, due within 7 days.</p>`);
  }

  private async notify(tenantId: string, subject: string, body: string, url?: string) {
    const admins = await this.prisma.user.findMany({ where: { tenantId, active: true, roles: { has: 'ADMIN' } }, select: { email: true, firstName: true } });
    for (const a of admins) if (!a.email.endsWith('@demo.jmsurf.health')) await this.mail.send(a.email, subject, this.mail.layout(subject, body, url ? { label: 'Open subscription', url } : undefined));
  }
}

@Controller('subscription')
export class SubscriptionController {
  constructor(private svc: SubscriptionService) {}
  @Get() status(@CurrentUser() u: AuthUser) { return this.svc.status(u.tenantId); }
  @Get('invoices') @Roles('ADMIN', 'ACCOUNTANT', 'MANAGER') invoices(@CurrentUser() u: AuthUser) { return this.svc.invoices(u.tenantId); }
  @Get('invoices/:id') @Roles('ADMIN', 'ACCOUNTANT', 'MANAGER') invoice(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.refresh(u.tenantId, id); }
  @Post('pay') @Roles('ADMIN', 'ACCOUNTANT') pay(@CurrentUser() u: AuthUser, @Body() dto: PayDto) { return this.svc.pay(u, dto); }
}

@Controller('platform/billing')
@UseGuards(SuperAdminGuard)
export class PlatformBillingController {
  constructor(private svc: SubscriptionService) {}
  @Get('invoices') invoices(@Query() q: InvoiceQuery) { return this.svc.allInvoices(q); }
  @Post('invoices/:id/record') record(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RecordPaymentDto) { return this.svc.record(u, id, dto); }
  @Post('invoices/:id/void') void(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.voidInvoice(u, id); }
  @Get('pricing') pricing() { return this.svc.pricing(); }
  @Put('pricing') setPricing(@CurrentUser() u: AuthUser, @Body() dto: PricingDto) { return this.svc.setPricing(u, dto); }
  @Post('run') run() { return this.svc.run().then(() => ({ ok: true })); }
}

@Module({ controllers: [SubscriptionController, PlatformBillingController], providers: [SubscriptionService, SuperAdminGuard], exports: [SubscriptionService] })
export class SubscriptionModule {}
