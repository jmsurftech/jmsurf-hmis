/** Pure selection rules for scheduled reminders. Keeps the cron service thin and testable. */
export type ReminderKind = 'APPT_24H' | 'APPT_2H' | 'IMMUNIZATION_DUE' | 'RESULTS_READY' | 'BILL_BALANCE';

const H = 3_600_000;

/** Window [from, to) of appointment start times that should get a reminder of this kind when the job runs at `now`.
 *  The job runs every 15 minutes, so each window is one hour wide and the ReminderLog dedupe key prevents repeats. */
export function appointmentWindow(kind: 'APPT_24H' | 'APPT_2H', now: Date): { from: Date; to: Date } {
  const lead = kind === 'APPT_24H' ? 24 * H : 2 * H;
  return { from: new Date(now.getTime() + lead - 0.5 * H), to: new Date(now.getTime() + lead + 0.5 * H) };
}

export interface ApptLike { id: string; startAt: Date; status: string; patientPhone?: string | null }
export function selectAppointments(kind: 'APPT_24H' | 'APPT_2H', appts: ApptLike[], now: Date, alreadySent: Set<string>): ApptLike[] {
  const w = appointmentWindow(kind, now);
  return appts.filter((a) => ['BOOKED', 'CONFIRMED'].includes(a.status) && !!a.patientPhone && a.startAt >= w.from && a.startAt < w.to && !alreadySent.has(a.id));
}

export interface ImmLike { id: string; dueDate: Date | null; status: string; givenAt: Date | null; phone?: string | null }
/** Immunizations due within the next `daysAhead` days (default 2) and not yet given. Overdue ones (up to 7 days) are included once. */
export function selectImmunizations(imms: ImmLike[], now: Date, alreadySent: Set<string>, daysAhead = 2): ImmLike[] {
  const from = now.getTime() - 7 * 24 * H, to = now.getTime() + daysAhead * 24 * H;
  return imms.filter((i) => i.status === 'DUE' && !i.givenAt && !!i.dueDate && i.dueDate.getTime() >= from && i.dueDate.getTime() < to && !!i.phone && !alreadySent.has(i.id));
}

export interface BillLike { id: string; status: string; patientAmountMinor: number; paidMinor: number; updatedAt: Date; phone?: string | null }
/** Bills with an outstanding patient balance ≥ minMinor, untouched for at least 2 days (so we don't nag at the counter). */
export function selectBillBalances(bills: BillLike[], now: Date, alreadySent: Set<string>, minMinor = 10_000): BillLike[] {
  return bills.filter((b) => ['FINAL', 'PARTIALLY_PAID', 'INTERIM'].includes(b.status) && b.patientAmountMinor - b.paidMinor >= minMinor
    && now.getTime() - b.updatedAt.getTime() >= 48 * H && !!b.phone && !alreadySent.has(b.id));
}

export interface OrderLike { id: string; verifiedAt: Date | null; phone?: string | null }
/** Orders whose results were verified in the last 24h. */
export function selectResultsReady(orders: OrderLike[], now: Date, alreadySent: Set<string>): OrderLike[] {
  return orders.filter((o) => !!o.verifiedAt && now.getTime() - o.verifiedAt.getTime() < 24 * H && !!o.phone && !alreadySent.has(o.id));
}
