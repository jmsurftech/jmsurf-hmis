/** Great-circle distance in metres. */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Escrow can be released only for a completed visit with check-in/out and a minimum duration. */
export function escrowReleasable(v: { status: string; escrowStatus: string; checkInAt: Date | null; checkOutAt: Date | null }, minMinutes = 15): { ok: boolean; reason?: string } {
  if (v.escrowStatus !== 'HELD') return { ok: false, reason: `Escrow is ${v.escrowStatus}` };
  if (v.status !== 'COMPLETED') return { ok: false, reason: 'Visit not completed' };
  if (!v.checkInAt || !v.checkOutAt) return { ok: false, reason: 'Missing check-in or check-out' };
  const mins = (v.checkOutAt.getTime() - v.checkInAt.getTime()) / 60000;
  if (mins < minMinutes) return { ok: false, reason: `Visit lasted ${Math.round(mins)} min (< ${minMinutes})` };
  return { ok: true };
}
