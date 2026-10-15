/** Bookable slot computation from weekly availability. Times are facility-local (fixed UTC offset; East Africa has no DST). */
export interface AvailabilityRule { weekday: number; startTime: string; endTime: string; slotMinutes: number; modes?: string[] }
export interface Interval { startAt: Date; endAt: Date }

/** Default when a practitioner has no rules: Mon–Fri 08:00–17:00, Sat 09:00–13:00, 30-minute slots. */
export const DEFAULT_AVAILABILITY: AvailabilityRule[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '08:00', endTime: '17:00', slotMinutes: 30 })),
  { weekday: 6, startTime: '09:00', endTime: '13:00', slotMinutes: 30 },
];

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** @param date YYYY-MM-DD in facility-local time. @param offsetMinutes local = UTC + offset (Nairobi: 180). */
export function computeSlots(rules: AvailabilityRule[], date: string, booked: Interval[], now: Date, offsetMinutes = 180, mode?: string): Interval[] {
  const [y, mo, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const dayStartUtc = Date.UTC(y, mo - 1, d) - offsetMinutes * 60_000;
  const out: Interval[] = [];
  for (const r of rules.filter((x) => x.weekday === weekday && (!mode || !x.modes?.length || x.modes.includes(mode)))) {
    const step = Math.max(5, r.slotMinutes);
    for (let m = toMin(r.startTime); m + step <= toMin(r.endTime); m += step) {
      const startAt = new Date(dayStartUtc + m * 60_000), endAt = new Date(startAt.getTime() + step * 60_000);
      if (startAt.getTime() <= now.getTime()) continue;
      if (booked.some((b) => b.startAt < endAt && b.endAt > startAt)) continue;
      if (out.some((o) => o.startAt.getTime() === startAt.getTime())) continue;
      out.push({ startAt, endAt });
    }
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
