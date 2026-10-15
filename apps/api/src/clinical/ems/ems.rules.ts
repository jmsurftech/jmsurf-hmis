/** Trip mileage from odometer readings. */
export function tripMileage(start?: number | null, end?: number | null): number {
  if (start == null || end == null) return 0;
  if (end < start) throw new Error('Odometer end is below start');
  return end - start;
}
