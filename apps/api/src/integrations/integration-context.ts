import { AsyncLocalStorage } from 'async_hooks';

/**
 * Ports are tenant-agnostic by design, but every outbound call must be logged against a tenant.
 * Services wrap port calls in withTenant(tenantId, () => port.x(...)) so adapters can read it.
 */
export interface IntegrationCtx { tenantId?: string; countryCode?: string }
export const integrationContext = new AsyncLocalStorage<IntegrationCtx>();
export const withTenant = <T>(tenantId: string | undefined, fn: () => Promise<T>, countryCode?: string): Promise<T> =>
  integrationContext.run({ tenantId, countryCode }, fn);
export const currentTenantId = () => integrationContext.getStore()?.tenantId;
