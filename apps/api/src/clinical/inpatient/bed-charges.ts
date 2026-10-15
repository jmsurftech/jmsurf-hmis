/** Number of bed-days to charge now (catch-up safe). Day boundaries use the provided tz offset in minutes (EAT = +180). */
export function bedDaysDue(admittedAt: Date, lastChargedAt: Date | null, now: Date, tzOffsetMins = 180): number {
  const dayIndex = (d: Date) => Math.floor((d.getTime() + tzOffsetMins * 60000) / 86400000);
  const today = dayIndex(now);
  if (!lastChargedAt) return today - dayIndex(admittedAt) + 1; // admission day counts
  return Math.max(today - dayIndex(lastChargedAt), 0);
}

/** eMAR schedule times from a frequency: evenly spaced doses starting at `start`. */
export function marTimes(start: Date, perDay: number, days: number): Date[] {
  if (perDay <= 0) return [];
  const step = 24 / perDay;
  const out: Date[] = [];
  for (let i = 0; i < perDay * days; i++) out.push(new Date(start.getTime() + i * step * 3600000));
  return out;
}
