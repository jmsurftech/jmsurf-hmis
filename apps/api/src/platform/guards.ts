import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../common/auth-user';
import { moduleForPath, readOnlyAllows } from './subscription.rules';

export const SUPER_ADMIN_KEY = 'superAdminOnly';
/** Restrict a controller/route to platform super-admins (User.isSuperAdmin). */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const need = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!need) return true;
    if (ctx.switchToHttp().getRequest().user?.isSuperAdmin) return true;
    throw new ForbiddenException('Super-admin only');
  }
}

/** Per-tenant API rate limit: authenticated requests are tracked by tenant, anonymous ones by IP. */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.tenantId ? `tenant:${req.user.tenantId}` : `ip:${req.ip}`;
  }
}

/** Short-lived cache of tenant status/modules so guards don't hit the DB on every request. */
const cache = new Map<string, { at: number; status: string; modules: string[] }>();
export function invalidateTenantCache(tenantId?: string) { if (tenantId) cache.delete(tenantId); else cache.clear(); }

/**
 * Plan enforcement + dunning:
 *  - route prefix → module key; blocked when tenant.enabledModules doesn't include it
 *  - READ_ONLY / CANCELLED tenants may only GET (plus auth and subscription payment)
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const tenantId: string | undefined = req.user?.tenantId;
    if (isPublic || !tenantId) return true;
    let t = cache.get(tenantId);
    if (!t || Date.now() - t.at > 30000) {
      const row = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { subscriptionStatus: true, enabledModules: true } });
      if (!row) throw new ForbiddenException('Tenant not found');
      t = { at: Date.now(), status: row.subscriptionStatus, modules: row.enabledModules };
      cache.set(tenantId, t);
    }
    const path: string = req.originalUrl ?? req.url ?? '';
    if ((t.status === 'READ_ONLY' || t.status === 'CANCELLED') && !readOnlyAllows(req.method, path)) {
      throw new ForbiddenException({ statusCode: 403, code: 'TENANT_READ_ONLY', message: 'Your subscription is read-only. Settle the outstanding invoice under Admin → Subscription to restore full access.' });
    }
    const mod = moduleForPath(path);
    if (mod && t.modules.length && !t.modules.includes(mod)) {
      throw new ForbiddenException({ statusCode: 403, code: 'MODULE_DISABLED', message: `The ${mod} module is not enabled on your plan` });
    }
    return true;
  }
}
