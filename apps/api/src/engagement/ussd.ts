/**
 * USSD menu state machine (Africa's Talking format). AT sends the full input history in `text` joined by '*',
 * so the machine is stateless: state is derived from the path. Responses start with "CON " (continue) or "END ".
 */
export type Lang = 'en' | 'sw';
export type UssdAction = 'APPOINTMENT' | 'SHA' | 'BILL';

export interface UssdData {
  facility: string;
  patientName?: string; // undefined when the caller's phone is not registered
  appointment?: string; // e.g. "Mon 20 Oct 10:30 with Dr. Otieno" or undefined
  sha?: string; // e.g. "Active (SHIF)" — resolved lazily by the controller
  bill?: string; // e.g. "KES 1,250.00 on BL-00012"
}

export const USSD_TEXT = {
  en: {
    welcome: (f: string) => `Welcome to ${f}\n1. My next appointment\n2. SHA status\n3. Bill balance\n4. Kiswahili`,
    unknown: 'Your phone number is not registered with us. Please visit the facility.',
    noAppt: 'You have no upcoming appointments.',
    appt: (a: string) => `Your next appointment: ${a}`,
    sha: (s: string) => `SHA status: ${s}`,
    noBill: 'You have no outstanding bill balance.',
    bill: (b: string) => `Outstanding balance: ${b}`,
    invalid: 'Invalid choice. Please try again.',
  },
  sw: {
    welcome: (f: string) => `Karibu ${f}\n1. Miadi yangu ijayo\n2. Hali ya SHA\n3. Deni la bili\n4. English`,
    unknown: 'Nambari yako ya simu haijasajiliwa. Tafadhali tembelea kituo.',
    noAppt: 'Huna miadi yoyote ijayo.',
    appt: (a: string) => `Miadi yako ijayo: ${a}`,
    sha: (s: string) => `Hali ya SHA: ${s}`,
    noBill: 'Huna deni lolote.',
    bill: (b: string) => `Deni lako: ${b}`,
    invalid: 'Chaguo si sahihi. Jaribu tena.',
  },
};

/** Determine the next step from the raw input. Returns either a menu to show or an action to resolve. */
export function ussdRoute(text: string, defaultLang: Lang = 'en'): { lang: Lang; step: 'MENU' | 'ACTION' | 'INVALID'; action?: UssdAction } {
  const parts = (text ?? '').split('*').map((s) => s.trim()).filter((s) => s !== '');
  let lang: Lang = defaultLang;
  // Each "4" toggles the language and re-shows the menu.
  while (parts[0] === '4') { lang = lang === 'en' ? 'sw' : 'en'; parts.shift(); }
  if (parts.length === 0) return { lang, step: 'MENU' };
  const map: Record<string, UssdAction> = { '1': 'APPOINTMENT', '2': 'SHA', '3': 'BILL' };
  const action = map[parts[0]];
  if (!action || parts.length > 1) return { lang, step: 'INVALID' };
  return { lang, step: 'ACTION', action };
}

export function ussdRespond(text: string, data: UssdData, defaultLang: Lang = 'en'): string {
  const r = ussdRoute(text, defaultLang);
  const t = USSD_TEXT[r.lang];
  if (r.step === 'MENU') return `CON ${t.welcome(data.facility)}`;
  if (r.step === 'INVALID') return `END ${t.invalid}`;
  if (!data.patientName) return `END ${t.unknown}`;
  switch (r.action) {
    case 'APPOINTMENT': return `END ${data.appointment ? t.appt(data.appointment) : t.noAppt}`;
    case 'SHA': return `END ${t.sha(data.sha ?? '-')}`;
    case 'BILL': return `END ${data.bill ? t.bill(data.bill) : t.noBill}`;
  }
  return `END ${t.invalid}`;
}
