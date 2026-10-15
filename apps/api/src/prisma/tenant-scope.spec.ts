import { TENANT_MODELS, whereHasTenant } from './tenant-scope';

describe('tenant scope assertion', () => {
  it('detects tenantId filters including nested AND', () => {
    expect(whereHasTenant({ tenantId: 't' })).toBe(true);
    expect(whereHasTenant({ AND: [{ id: 'x' }, { tenantId: 't' }] })).toBe(true);
    expect(whereHasTenant({ id: 'x' })).toBe(false);
    expect(whereHasTenant(undefined)).toBe(false);
  });
  it('knows tenant-owned models', () => {
    expect(TENANT_MODELS.has('Patient')).toBe(true);
    expect(TENANT_MODELS.has('User')).toBe(false);
  });
});
