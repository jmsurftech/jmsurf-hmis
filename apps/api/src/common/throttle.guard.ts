import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Client address behind the Coolify/Traefik proxy: leftmost X-Forwarded-For entry, else the socket address. */
export function clientIp(req: Record<string, any>): string {
  const xff = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}

/**
 * Per-tenant API rate limit (API_RATE_LIMIT_PER_MIN, default 1200): signed-in requests are tracked by tenant,
 * anonymous ones (login, signup, refresh, webhooks) by client IP. Brute force on one account is stopped by the login lockout.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.tenantId ? `tenant:${req.user.tenantId}` : `ip:${clientIp(req)}`;
  }
}
