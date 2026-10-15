/** South African Triage Scale colour → queue priority (1 = most urgent) and target time to be seen. */
export const SATS: Record<string, { priority: number; targetMins: number }> = {
  RED: { priority: 1, targetMins: 0 },
  ORANGE: { priority: 2, targetMins: 10 },
  YELLOW: { priority: 3, targetMins: 60 },
  GREEN: { priority: 4, targetMins: 240 },
  BLUE: { priority: 5, targetMins: 0 }, // deceased
};
export const satsPriority = (category: string) => SATS[category?.toUpperCase()]?.priority ?? 3;

/** Adult TEWS (Triage Early Warning Score) → SATS category, before discriminators. */
export function tewsToCategory(tews: number): 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' {
  return tews >= 7 ? 'RED' : tews >= 5 ? 'ORANGE' : tews >= 3 ? 'YELLOW' : 'GREEN';
}
