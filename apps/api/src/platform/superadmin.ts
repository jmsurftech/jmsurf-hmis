import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { AuthService, DEFAULT_MODULES } from '../auth/auth.module';
import { SuperAdminOnly, invalidateTenantCache } from './guards';
import { SubscriptionService } from './subscription.service';
import { calcInvoice } from './subscription.rules';

class UpdateTenantDto {
  @IsOptional() @IsIn(['CLINIC', 'HOSPITAL', 'ENTERPRISE']) plan?: 'CLINIC' | 'HOSPITAL' | 'ENTERPRISE';
  @IsOptional() @IsIn(['TRIAL', 'ACTIVE', 'GRACE', 'READ_ONLY', 'CANCELLED']) subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'CANCELLED';
  @IsOptional() @IsArray() @IsString({ each: true }) enabledModules?: string[];
  @IsOptional() @IsDateString() trialEndsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) customMonthlyMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) perVisitMinor?: number;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}
class ImpersonateDto { @IsString() @MinLength(10) reason: string; @IsOptional() @IsString() userId?: string }
class GenerateDto { @IsOptional() @IsString() period?: string }
class MarkPaidDto { @IsOptional() @IsString() reference?: string }

@Injectable()
export class SuperAdminService {
  constructor(private prisma: PrismaService, private audit: AuditService, private auth: AuthService, private subs: SubscriptionService) {}

  async tenants(q?: string, page = 1, pageSize = 20, status?: string) {
    const where: Prisma.TenantWhereInput = {
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(status ? { subscriptionStatus: status as any } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { users: true, facilities: true } } } }),
      this.prisma.tenant.count({ where }),
    ]);
    return { data: rows, total, page, pageSize };
  }

  async usage(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const w = { tenantId };
    const [patients, visitsThisMonth, visitsTotal, users, notes, orders, bills, payments, audit, stock] = await Promise.all([
      this.prisma.patient.count({ where: w }), this.prisma.visit.count({ where: { tenantId, startedAt: { gte: monthStart } } }), this.prisma.visit.count({ where: w }),
      this.prisma.user.count({ where: w }), this.prisma.clinicalNote.count({ where: w }), this.prisma.order.count({ where: w }),
      this.prisma.bill.count({ where: w }), this.prisma.payment.count({ where: w }), this.prisma.auditEvent.count({ where: w }), this.prisma.stockItem.count({ where: w }),
    ]);
    return { patients, visitsThisMonth, visitsTotal, users, storageRows: patients + visitsTotal + notes + orders + bills + payments + audit + stock, breakdown: { notes, orders, bills, payments, audit, stock } };
  }

  async tenant(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id }, include: { facilities: true } });
    if (!t) throw new NotFoundException('Tenant not found');
    const [usage, invoices, admins] = await Promise.all([
      this.usage(id),
      this.prisma.subscriptionInvoice.findMany({ where: { tenantId: id }, orderBy: { period: 'desc' }, take: 24 }),
      this.prisma.user.findMany({ where: { tenantId: id, roles: { has: 'ADMIN' } }, select: { id: true, email: true, firstName: true, lastName: true, active: true, mfaEnabled: true, lastLoginAt: true } }),
    ]);
    return { ...t, usage, invoices, admins, estimate: calcInvoice(t.plan, usage.visitsThisMonth, (t.settings ?? {}) as any), allModules: DEFAULT_MODULES };
  }

  async overview() {
    const byStatus = await this.prisma.tenant.groupBy({ by: ['subscriptionStatus'], _count: true });
    const byPlan = await this.prisma.tenant.groupBy({ by: ['plan'], _count: true });
    const unpaid = await this.prisma.subscriptionInvoice.aggregate({ where: { status: { in: ['UNPAID', 'PENDING'] } }, _sum: { amountMinor: true }, _count: true });
    const since = new Date(Date.now() - 30 * 86400000);
    const paid30 = await this.prisma.subscriptionInvoice.aggregate({ where: { status: 'PAID', paidAt: { gte: since } }, _sum: { amountMinor: true } });
    return {
      tenants: byStatus.reduce((a, r) => a + r._count, 0),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.subscriptionStatus, r._count])),
      byPlan: Object.fromEntries(byPlan.map((r) => [r.plan, r._count])),
      outstandingMinor: unpaid._sum.amountMinor ?? 0, outstandingInvoices: unpaid._count,
      collected30dMinor: paid30._sum.amountMinor ?? 0,
    };
  }

  async update(admin: AuthUser, id: string, dto: UpdateTenantDto) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tenant not found');
    const settings = { ...((t.settings ?? {}) as any), ...(dto.settings ?? {}) };
    if (dto.customMonthlyMinor !== undefined) settings.customMonthlyMinor = dto.customMonthlyMinor;
    if (dto.perVisitMinor !== undefined) settings.perVisitMinor = dto.perVisitMinor;
    const r = await this.prisma.tenant.update({
      where: { id },
      data: {
        plan: dto.plan, subscriptionStatus: dto.subscriptionStatus, enabledModules: dto.enabledModules,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined, settings,
      },
    });
    invalidateTenantCache(id);
    await this.audit.log({ tenantId: id, userId: admin.sub, action: 'SUPERADMIN_UPDATE_TENANT', entity: 'Tenant', entityId: id, data: dto as any });
    return r;
  }

  /** Issues a 30-minute access token for a tenant user (default: first active admin). No refresh token. Audited on both sides. */
  async impersonate(admin: AuthUser, id: string, dto: ImpersonateDto) {
    const user = await this.prisma.user.findFirst({
      where: { tenantId: id, active: true, ...(dto.userId ? { id: dto.userId } : { roles: { has: 'ADMIN' } }) }, orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new BadRequestException('No active user to impersonate in this tenant');
    await this.audit.log({ tenantId: id, userId: admin.sub, action: 'IMPERSONATE', entity: 'User', entityId: user.id, data: { reason: dto.reason, superAdmin: admin.email } });
    await this.audit.log({ userId: admin.sub, action: 'IMPERSONATE', entity: 'Tenant', entityId: id, data: { reason: dto.reason, userId: user.id } });
    const accessToken = this.auth.signAccess({ ...user, isSuperAdmin: false }, { impersonatedBy: admin.sub }, '30m');
    return { accessToken, user: this.auth.publicUser(user), expiresIn: '30m' };
  }

  async invoices(q: { tenantId?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Number(q.page) || 1, pageSize = Math.min(Number(q.pageSize) || 50, 200);
    const where: Prisma.SubscriptionInvoiceWhereInput = { ...(q.tenantId ? { tenantId: q.tenantId } : {}), ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.subscriptionInvoice.findMany({ where, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.subscriptionInvoice.count({ where }),
    ]);
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } }, select: { id: true, name: true, slug: true } });
    return { data: rows.map((r) => ({ ...r, tenant: tenants.find((t) => t.id === r.tenantId) })), total, page, pageSize };
  }
}

@Controller('superadmin')
@SuperAdminOnly()
export class SuperAdminController {
  constructor(private svc: SuperAdminService, private subs: SubscriptionService) {}
  @Get('overview') overview() { return this.svc.overview(); }
  @Get('tenants') tenants(@Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    return this.svc.tenants(q, Number(page) || 1, Math.min(Number(pageSize) || 20, 100), status);
  }
  @Get('tenants/:id') tenant(@Param('id') id: string) { return this.svc.tenant(id); }
  @Patch('tenants/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTenantDto) { return this.svc.update(u, id, dto); }
  @Post('tenants/:id/impersonate') impersonate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ImpersonateDto) { return this.svc.impersonate(u, id, dto); }
  @Get('invoices') invoices(@Query() q: any) { return this.svc.invoices(q); }
  @Post('invoices/generate') generate(@Body() dto: GenerateDto) { return this.subs.generate(dto.period); }
  @Post('invoices/:id/mark-paid') markPaid(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MarkPaidDto) { return this.subs.markPaid(u.sub, id, dto.reference); }
  @Post('dunning/run') dunning() { return this.subs.runDunning(); }
}
