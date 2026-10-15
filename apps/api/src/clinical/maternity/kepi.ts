/** Kenya Expanded Programme on Immunization (KEPI) schedule, age offsets in days from birth. */
export const KEPI_SCHEDULE: { vaccine: string; dose: number; ageDays: number }[] = [
  { vaccine: 'BCG', dose: 1, ageDays: 0 },
  { vaccine: 'OPV', dose: 0, ageDays: 0 },
  { vaccine: 'OPV', dose: 1, ageDays: 42 },
  { vaccine: 'DPT-HepB-Hib', dose: 1, ageDays: 42 },
  { vaccine: 'PCV10', dose: 1, ageDays: 42 },
  { vaccine: 'Rotavirus', dose: 1, ageDays: 42 },
  { vaccine: 'OPV', dose: 2, ageDays: 70 },
  { vaccine: 'DPT-HepB-Hib', dose: 2, ageDays: 70 },
  { vaccine: 'PCV10', dose: 2, ageDays: 70 },
  { vaccine: 'Rotavirus', dose: 2, ageDays: 70 },
  { vaccine: 'OPV', dose: 3, ageDays: 98 },
  { vaccine: 'DPT-HepB-Hib', dose: 3, ageDays: 98 },
  { vaccine: 'PCV10', dose: 3, ageDays: 98 },
  { vaccine: 'IPV', dose: 1, ageDays: 98 },
  { vaccine: 'Rotavirus', dose: 3, ageDays: 98 },
  { vaccine: 'Vitamin A', dose: 1, ageDays: 182 },
  { vaccine: 'Malaria (RTS,S)', dose: 1, ageDays: 182 },
  { vaccine: 'Malaria (RTS,S)', dose: 2, ageDays: 213 },
  { vaccine: 'Malaria (RTS,S)', dose: 3, ageDays: 243 },
  { vaccine: 'Measles-Rubella', dose: 1, ageDays: 274 },
  { vaccine: 'Yellow Fever', dose: 1, ageDays: 274 },
  { vaccine: 'Vitamin A', dose: 2, ageDays: 365 },
  { vaccine: 'Measles-Rubella', dose: 2, ageDays: 548 },
  { vaccine: 'Malaria (RTS,S)', dose: 4, ageDays: 730 },
];

export function immunizationSchedule(dob: Date) {
  return KEPI_SCHEDULE.map((s) => ({ ...s, dueDate: new Date(new Date(dob).getTime() + s.ageDays * 86400000) }));
}

/** Naegele's rule: EDD = LMP + 280 days. Gestational age in weeks at a date. */
export const eddFromLmp = (lmp: Date) => new Date(new Date(lmp).getTime() + 280 * 86400000);
export const gestationWeeks = (lmp: Date, at = new Date()) => Math.floor((at.getTime() - new Date(lmp).getTime()) / (7 * 86400000));
