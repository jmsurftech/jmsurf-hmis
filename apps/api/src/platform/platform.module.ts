import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException,
  OnApplicationBootstrap, Param, Patch, Query, UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { ListQuery, pageArgs, paged } from '../revenue/list-query';

const STATUSES = ['TRIAL', 'ACTIVE', 'GRACE', 'READ_ONLY', 'CANCELLED'] as const;
const PLANS = ['CLINIC', 'HOSPITAL', 'ENTERPRISE'] as const;

class TenantListQuery extends ListQuery {
  @IsOptional() @IsString() status?: string; // a SubscriptionStatus, SUSPENDED or TRIAL_ENDING
  @IsOptional() @IsString() plan?: string;
}
class PlatformAuditQuery extends ListQuery {
  @IsOptional() @IsString() tenantId?: string; // a tenant id, or PLATFORM for super-admin actions
  @IsOptional() @IsString() action?: string;
}
class UpdateTenantDto {
  @IsOptional() @IsIn(PLANS as unknown as string[]) plan?: string;
  @IsOptional() @IsIn(STATUSES as unknown as string[]) subscriptionStatus?: string;
  @IsOptional() @IsISO8601() trialEndsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) extendTrialDays?: number;
  @IsOptional() @IsBoolean() suspended?: boolean;
  @IsOptional() @IsString() reason?: string;
}

/** Super-admin only. Checks the database, not the token, so a revoked flag takes effect at once. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const u: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!u?.sub) return false;
    const row = await this.prisma.user.findUnique({ where: { id: u.sub }, select: { isSuperAdmin: true, active: true } });
    if (!row?.active || !row.isSuperAdmin) throw new ForbiddenException('Platform console is for JMSURF super admins only');
    return true;
  }
}

@Injectable()
export class PlatformService implements OnApplicationBootstrap {
  private log = new Logger('Platform');
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Owners listed in SUPER_ADMIN_EMAILS are flagged as super admins at start-up. No accounts are created. */
  async onApplicationBootstrap() {
    const emails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!emails.length) return;
    const r = await this.prisma.user.updateMany({ where: { email: { in: emails }, isSuperAdmin: false }, data: { isSuperAdmin: true } });
    if (r.count) this.log.log(`Flagged ${r.count} super admin account(s) from SUPER_ADMIN_EMAILS`);
  }

  private since(days: number) { return new Date(Date.now() - days * 86400000); }

  private async usage(tenantIds: string[]) {
    if (!tenantIds.length) return new Map<string, any>();
    const where = { tenantId: { in: tenantIds } };
    const [users, visits30, visits, patients, beds, facilities, logins] = await Promise.all([
      this.prisma.user.groupBy({ by: ['tenantId'], where: { ...where, active: true }, _count: { _all: true } }),
      this.prisma.visit.groupBy({ by: ['tenantId'], where: { ...where, startedAt: { gte: this.since(30) } }, _count: { _all: true } }),
      this.prisma.visit.groupBy({ by: ['tenantId'], where, _count: { _all: true } }),
      this.prisma.patient.groupBy({ by: ['tenantId'], where, _count: { _all: true } }),
      this.prisma.bed.groupBy({ by: ['tenantId'], where, _count: { _all: true } }),
      this.prisma.facility.groupBy({ by: ['tenantId'], where, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['tenantId'], where, _max: { lastLoginAt: true } }),
    ]);
    const m = new Map<string, any>(tenantIds.map((id) => [id, { users: 0, visits30d: 0, visits: 0, patients: 0, beds: 0, facilities: 0, lastLoginAt: null }]));
    const put = (rows: any[], key: string, pick: (r: any) => unknown) => rows.forEach((r) => { if (r.tenantId && m.has(r.tenantId)) m.get(r.tenantId)[key] = pick(r); });
    put(users, 'users', (r) => r._count._all); put(visits30, 'visits30d', (r) => r._count._all); put(visits, 'visits', (r) => r._count._all);
    put(patients, 'patients', (r) => r._count._all); put(beds, 'beds', (r) => r._count._all); put(facilities, 'facilities', (r) => r._count._all);
    put(logins, 'lastLoginAt', (r) => r._max.lastLoginAt);
    return m;
  }

  async overview() {
    const in7 = new Date(Date.now() + 7 * 86400000);
    const [byStatus, byPlan, suspended, trialEnding, users, visits30, patients, newTenants30, recent] = await Promise.all([
      this.prisma.tenant.groupBy({ by: ['subscriptionStatus'], _count: { _all: true } }),
      this.prisma.tenant.groupBy({ by: ['plan'], _count: { _all: true } }),
      this.prisma.tenant.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.tenant.findMany({ where: { subscriptionStatus: 'TRIAL', suspendedAt: null, trialEndsAt: { lte: in7 } }, orderBy: { trialEndsAt: 'asc' }, take: 8, select: { id: true, name: true, trialEndsAt: true, plan: true } }),
      this.prisma.user.count({ where: { active: true, tenantId: { not: null } } }),
      this.prisma.visit.count({ where: { startedAt: { gte: this.since(30) } } }),
      this.prisma.patient.count(),
      this.prisma.tenant.count({ where: { createdAt: { gte: this.since(30) } } }),
      this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, createdAt: true, plan: true, subscriptionStatus: true } }),
    ]);
    // Daily sign-ups for the last 30 days.
    const signups = await this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS d, count(*) AS n FROM "Tenant" WHERE "createdAt" >= ${this.since(30)} GROUP BY 1 ORDER BY 1`;
    return {
      tenants: byStatus.reduce((a, r) => a + r._count._all, 0),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.subscriptionStatus, r._count._all])),
      byPlan: Object.fromEntries(byPlan.map((r) => [r.plan, r._count._all])),
      suspended, trialEnding, users, visits30d: visits30, patients, newTenants30d: newTenants30, recent,
      signups: signups.map((r) => ({ day: r.d.toISOString().slice(0, 10), count: Number(r.n) })),
    };
  }

  async tenants(q: TenantListQuery) {
    const where: any = {};
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q, mode: 'insensitive' } }, { users: { some: { email: { contains: q.q, mode: 'insensitive' } } } }];
    if (q.plan) where.plan = q.plan;
    if (q.status === 'SUSPENDED') where.suspendedAt = { not: null };
    else if (q.status === 'TRIAL_ENDING') Object.assign(where, { subscriptionStatus: 'TRIAL', suspendedAt: null, trialEndsAt: { lte: new Date(Date.now() + 7 * 86400000) } });
    else if (q.status) where.subscriptionStatus = q.status;
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q),
        select: { id: true, name: true, slug: true, countryCode: true, plan: true, subscriptionStatus: true, trialEndsAt: true, suspendedAt: true, suspendReason: true, createdAt: true, settings: true } }),
      this.prisma.tenant.count({ where }),
    ]);
    const u = await this.usage(rows.map((r) => r.id));
    const owners = await this.prisma.user.findMany({ where: { tenantId: { in: rows.map((r) => r.id) }, roles: { has: 'ADMIN' } }, orderBy: { createdAt: 'asc' }, select: { tenantId: true, email: true, firstName: true, lastName: true, phone: true } });
    return paged(rows.map((r) => ({ ...r, billingModel: (r.settings as any)?.billingModel ?? 'SUBSCRIPTION', settings: undefined, usage: u.get(r.id), owner: owners.find((o) => o.tenantId === r.id) ?? null })), total, q);
  }

  async tenant(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id }, include: { facilities: { select: { id: true, name: true, code: true, kmhflCode: true, county: true, level: true } } } });
    if (!t) throw new NotFoundException('Tenant not found');
    const [users, usage, audit, revenue] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'asc' }, select: { id: true, email: true, firstName: true, lastName: true, roles: true, active: true, lastLoginAt: true, createdAt: true } }),
      this.usage([id]),
      this.prisma.auditEvent.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, action: true, entity: true, entityId: true, userId: true, createdAt: true } }),
      this.prisma.payment.aggregate({ where: { tenantId: id, status: 'COMPLETED', createdAt: { gte: this.since(30) } }, _sum: { amountMinor: true }, _count: { _all: true } }),
    ]);
    const { settings, ...rest } = t;
    return { ...rest, billingModel: (settings as any)?.billingModel ?? 'SUBSCRIPTION', users, usage: usage.get(id), audit,
      payments30d: { count: revenue._count._all, amountMinor: revenue._sum.amountMinor ?? 0 } };
  }

  async update(admin: AuthUser, id: string, dto: UpdateTenantDto) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tenant not found');
    const data: any = {};
    if (dto.plan) data.plan = dto.plan;
    if (dto.subscriptionStatus) data.subscriptionStatus = dto.subscriptionStatus;
    if (dto.trialEndsAt) data.trialEndsAt = new Date(dto.trialEndsAt);
    if (dto.extendTrialDays) {
      const base = t.trialEndsAt && t.trialEndsAt > new Date() ? t.trialEndsAt : new Date();
      data.trialEndsAt = new Date(base.getTime() + dto.extendTrialDays * 86400000);
      if (!dto.subscriptionStatus && ['READ_ONLY', 'GRACE', 'CANCELLED'].includes(t.subscriptionStatus)) data.subscriptionStatus = 'TRIAL';
    }
    if (dto.suspended === true) {
      if (!dto.reason?.trim()) throw new BadRequestException('Give a reason for suspending this tenant');
      data.suspendedAt = new Date(); data.suspendReason = dto.reason.trim();
    } else if (dto.suspended === false) { data.suspendedAt = null; data.suspendReason = null; }
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to change');
    const updated = await this.prisma.tenant.update({ where: { id }, data });
    TenantStatusCache.drop(id);
    const before = Object.fromEntries(Object.keys(data).map((k) => [k, (t as any)[k]]));
    // Logged twice: in the platform chain (tenantId null) and in the tenant's own audit trail.
    await this.audit.log({ userId: admin.sub, action: 'PLATFORM_TENANT_UPDATE', entity: 'Tenant', entityId: id, data: { tenant: t.name, before, after: data, reason: dto.reason } });
    await this.audit.log({ tenantId: id, userId: admin.sub, action: 'PLATFORM_TENANT_UPDATE', entity: 'Tenant', entityId: id, data: { after: data, reason: dto.reason } });
    return updated;
  }

  async auditLog(q: PlatformAuditQuery) {
    const where: any = {};
    if (q.tenantId === 'PLATFORM') where.tenantId = null; else if (q.tenantId) where.tenantId = q.tenantId;
    if (q.action) where.action = q.action;
    if (q.q) where.OR = [{ action: { contains: q.q, mode: 'insensitive' } }, { entity: { contains: q.q, mode: 'insensitive' } }, { entityId: q.q }];
    const [rows, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q), select: { id: true, tenantId: true, userId: true, action: true, entity: true, entityId: true, data: true, ip: true, createdAt: true } }),
      this.prisma.auditEvent.count({ where }),
    ]);
    const [tenants, users] = await Promise.all([
      this.prisma.tenant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tenantId).filter(Boolean) as string[])] } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])] } }, select: { id: true, email: true, firstName: true, lastName: true } }),
    ]);
    return paged(rows.map((r) => ({ ...r, tenant: tenants.find((t) => t.id === r.tenantId) ?? null, user: users.find((u) => u.id === r.userId) ?? null })), total, q);
  }
}

/** Short in-memory cache of each tenant's access state, used on every staff request. */
export class TenantStatusCache {
  private static m = new Map<string, { at: number; v: { suspended: boolean; status: string } }>();
  static drop(id: string) { this.m.delete(id); }
  static async get(prisma: PrismaService, id: string) {
    const hit = this.m.get(id);
    if (hit && Date.now() - hit.at < 30_000) return hit.v;
    const t = await prisma.tenant.findUnique({ where: { id }, select: { suspendedAt: true, subscriptionStatus: true } });
    const v = { suspended: !!t?.suspendedAt, status: t?.subscriptionStatus ?? 'ACTIVE' };
    this.m.set(id, { at: Date.now(), v });
    return v;
  }
}

/** Suspended tenants are locked out; READ_ONLY and CANCELLED tenants can read but not change anything. Super admins pass. */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const u: AuthUser | undefined = req.user;
    if (!u?.tenantId || u.isSuperAdmin) return true;
    const s = await TenantStatusCache.get(this.prisma, u.tenantId);
    if (s.suspended) throw new ForbiddenException('This facility account is suspended. Contact JMSURF support.');
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const allowed = /^\/api\/(auth|platform)\//.test(req.path ?? req.url ?? '');
    if (write && !allowed && ['READ_ONLY', 'CANCELLED'].includes(s.status)) throw new ForbiddenException('The subscription has lapsed, so the system is read-only. Renew to continue.');
    return true;
  }
}

@Controller('platform')
@UseGuards(SuperAdminGuard)
export class PlatformController {
  constructor(private svc: PlatformService) {}
  @Get('overview') overview() { return this.svc.overview(); }
  @Get('tenants') tenants(@Query() q: TenantListQuery) { return this.svc.tenants(q); }
  @Get('tenants/:id') tenant(@Param('id') id: string) { return this.svc.tenant(id); }
  @Patch('tenants/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTenantDto) { return this.svc.update(u, id, dto); }
  @Get('audit') audit(@Query() q: PlatformAuditQuery) { return this.svc.auditLog(q); }
}

@Module({ controllers: [PlatformController], providers: [PlatformService, SuperAdminGuard, TenantStatusGuard], exports: [TenantStatusGuard] })
export class PlatformModule {}
