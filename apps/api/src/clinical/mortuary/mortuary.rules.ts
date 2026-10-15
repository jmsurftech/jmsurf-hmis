/** Mortuary storage-day rules. Day boundaries in local time (EAT = +180 min). */
const dayIndex = (d: Date, tz: number) => Math.floor((d.getTime() + tz * 60000) / 86400000);

/** Storage days to charge now: admission day counts; afterwards one per calendar day since the last charge (catch-up safe). */
export function storageDaysDue(admittedAt: Date, lastChargedAt: Date | null, now: Date, tzOffsetMins = 180): number {
  if (now < admittedAt) return 0;
  if (!lastChargedAt) return dayIndex(now, tzOffsetMins) - dayIndex(admittedAt, tzOffsetMins) + 1;
  return Math.max(dayIndex(now, tzOffsetMins) - dayIndex(lastChargedAt, tzOffsetMins), 0);
}

/** Total calendar days in storage (inclusive of admission and release days, minimum 1). */
export function totalStorageDays(admittedAt: Date, until: Date, tzOffsetMins = 180): number {
  return Math.max(dayIndex(until, tzOffsetMins) - dayIndex(admittedAt, tzOffsetMins) + 1, 1);
}
