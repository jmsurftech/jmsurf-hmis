import { escrowReleasable, haversineMetres } from './homecare-rules';

describe('home care rules', () => {
  it('haversine Nairobi CBD to Westlands ≈ 3-4 km', () => {
    const d = haversineMetres(-1.2864, 36.8172, -1.2676, 36.8108);
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(4000);
  });
  const base = { status: 'COMPLETED', escrowStatus: 'HELD', checkInAt: new Date('2026-10-10T10:00:00Z'), checkOutAt: new Date('2026-10-10T11:00:00Z') };
  it('releases completed visit', () => expect(escrowReleasable(base).ok).toBe(true));
  it('blocks short visit', () => expect(escrowReleasable({ ...base, checkOutAt: new Date('2026-10-10T10:05:00Z') }).ok).toBe(false));
  it('blocks incomplete or already released', () => {
    expect(escrowReleasable({ ...base, status: 'IN_PROGRESS' }).ok).toBe(false);
    expect(escrowReleasable({ ...base, escrowStatus: 'RELEASED' }).ok).toBe(false);
  });
});
