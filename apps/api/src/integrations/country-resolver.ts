import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId, integrationContext } from './integration-context';

/**
 * Resolves the country for the current integration call: explicit countryCode in the integration context,
 * else the tenant's countryCode (cached 5 min), else undefined (routers then use their env default / KE).
 */
@Injectable()
export class CountryResolver {
  private cache = new Map<string, { cc: string; at: number }>();
  constructor(private prisma?: PrismaService) {}

  async current(): Promise<string | undefined> {
    const explicit = integrationContext.getStore()?.countryCode;
    if (explicit) return explicit.toUpperCase();
    const tenantId = currentTenantId();
    if (!tenantId || !this.prisma) return undefined;
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < 300_000) return hit.cc;
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { countryCode: true } }).catch(() => null);
    if (!t) return undefined;
    this.cache.set(tenantId, { cc: t.countryCode.toUpperCase(), at: Date.now() });
    return t.countryCode.toUpperCase();
  }
}
