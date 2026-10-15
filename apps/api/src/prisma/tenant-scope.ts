import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Models with a tenantId column that are NOT required to filter on it (identity/platform tables, or keyed by unique ids). */
const EXEMPT = new Set(['Tenant', 'User', 'AuditEvent', 'RefreshToken', 'SubscriptionInvoice']);
const CHECKED_ACTIONS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']);

export const TENANT_MODELS: Set<string> = new Set(
  Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === 'tenantId') && !EXEMPT.has(m.name)).map((m) => m.name),
);

/** True when a where-clause (incl. nested AND arrays) constrains tenantId. */
export function whereHasTenant(where: any): boolean {
  if (!where || typeof where !== 'object') return false;
  if ('tenantId' in where && where.tenantId !== undefined) return true;
  const and = where.AND;
  if (Array.isArray(and)) return and.some(whereHasTenant);
  return whereHasTenant(and);
}

/**
 * Dev/test safety net (second tenancy layer until Postgres RLS lands — see docs/security/RLS.md):
 * warns when a bulk query on a tenant-owned model has no tenantId filter. Never blocks.
 */
export function tenantScopeMiddleware(log = new Logger('TenantScope')): Prisma.Middleware {
  const seen = new Set<string>();
  return async (params, next) => {
    if (params.model && TENANT_MODELS.has(params.model) && CHECKED_ACTIONS.has(params.action) && !whereHasTenant(params.args?.where)) {
      const key = `${params.model}.${params.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        const site = new Error().stack?.split('\n').find((l) => l.includes('/src/') && !l.includes('tenant-scope')) ?? '';
        log.warn(`${key} without tenantId filter ${site.trim()}`);
      }
    }
    return next(params);
  };
}
