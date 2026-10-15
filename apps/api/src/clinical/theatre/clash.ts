export interface Booking { id?: string; theatre: string; surgeonId?: string | null; anaesthetistId?: string | null; scheduledStart: Date; scheduledEnd: Date; status?: string }

export const overlaps = (a: { scheduledStart: Date; scheduledEnd: Date }, b: { scheduledStart: Date; scheduledEnd: Date }) =>
  new Date(a.scheduledStart) < new Date(b.scheduledEnd) && new Date(b.scheduledStart) < new Date(a.scheduledEnd);

/** Return clashes for a proposed booking against existing ones (cancelled/done ignored; turnover buffer in minutes). */
export function findClashes(proposed: Booking, existing: Booking[], bufferMins = 0): { bookingId?: string; reason: 'THEATRE' | 'SURGEON' | 'ANAESTHETIST' }[] {
  if (new Date(proposed.scheduledEnd) <= new Date(proposed.scheduledStart)) throw new Error('End must be after start');
  const padded = { scheduledStart: new Date(new Date(proposed.scheduledStart).getTime() - bufferMins * 60000), scheduledEnd: new Date(new Date(proposed.scheduledEnd).getTime() + bufferMins * 60000) };
  const out: { bookingId?: string; reason: 'THEATRE' | 'SURGEON' | 'ANAESTHETIST' }[] = [];
  for (const e of existing) {
    if (e.id && e.id === proposed.id) continue;
    if (e.status === 'CANCELLED' || e.status === 'DONE') continue;
    if (!overlaps(padded, e)) continue;
    if (e.theatre === proposed.theatre) out.push({ bookingId: e.id, reason: 'THEATRE' });
    if (proposed.surgeonId && e.surgeonId === proposed.surgeonId) out.push({ bookingId: e.id, reason: 'SURGEON' });
    if (proposed.anaesthetistId && e.anaesthetistId === proposed.anaesthetistId) out.push({ bookingId: e.id, reason: 'ANAESTHETIST' });
  }
  return out;
}
