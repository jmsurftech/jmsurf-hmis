/**
 * De-identification helper (pure). Strips direct patient identifiers before any text leaves the platform
 * for an LLM. Known identifiers (name parts, MRN, IDs, phone) are replaced with typed placeholders; generic
 * patterns (phone numbers, emails, national-ID-like numbers, dates of birth) are masked even when not known.
 */
export interface KnownIdentifiers {
  names?: (string | null | undefined)[];
  ids?: (string | null | undefined)[]; // MRN, national ID, CR ID, SHA number, visit numbers...
  phones?: (string | null | undefined)[];
  emails?: (string | null | undefined)[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function deidentify(text: string, known: KnownIdentifiers = {}): { text: string; replacements: number } {
  if (!text) return { text: '', replacements: 0 };
  let out = text;
  let n = 0;
  const sub = (re: RegExp, repl: string) => { out = out.replace(re, () => { n++; return repl; }); };

  for (const id of (known.ids ?? []).filter((x): x is string => !!x && x.trim().length >= 3)) sub(new RegExp(esc(id.trim()), 'gi'), '[ID]');
  for (const e of (known.emails ?? []).filter((x): x is string => !!x)) sub(new RegExp(esc(e), 'gi'), '[EMAIL]');
  for (const p of (known.phones ?? []).filter((x): x is string => !!x)) {
    const digits = p.replace(/\D/g, '').slice(-9);
    if (digits.length >= 7) sub(new RegExp(`(?:\\+?\\d{1,3}[\\s-]?|0)?${digits.split('').join('[\\s-]?')}`, 'g'), '[PHONE]');
  }
  const names = (known.names ?? []).filter((x): x is string => !!x && x.trim().length >= 2).map((x) => x.trim());
  names.sort((a, b) => b.length - a.length);
  for (const nm of names) sub(new RegExp(`\\b${esc(nm)}\\b`, 'gi'), '[NAME]');

  // Generic patterns
  sub(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]');
  sub(/(?:\+?\d{3}[\s-]?)?\b0?7\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, '[PHONE]'); // East-African mobile numbers
  sub(/\+\d{7,15}\b/g, '[PHONE]');
  sub(/\b(?:DOB|D\.O\.B\.?|born(?: on)?)[:\s]*\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/gi, 'DOB [DATE]');
  sub(/\b(?:MRN|ID|IP|OP|NHIF|SHA|CR)[\s#:-]*[A-Z0-9-]{4,}\b/g, '[ID]');
  sub(/\b\d{7,}\b/g, '[ID]'); // long numeric strings (national IDs, phone fragments, account numbers)
  return { text: out, replacements: n };
}

/** Collect known identifiers from a patient row. */
export function identifiersOf(p?: {
  firstName?: string | null; middleName?: string | null; lastName?: string | null; mrn?: string | null; idNumber?: string | null;
  crId?: string | null; shaNumber?: string | null; phone?: string | null; email?: string | null; nextOfKin?: unknown;
} | null, extraIds: (string | null | undefined)[] = []): KnownIdentifiers {
  if (!p) return { ids: extraIds };
  const kin = Array.isArray(p.nextOfKin) ? (p.nextOfKin as any[]) : [];
  return {
    names: [p.firstName, p.middleName, p.lastName, ...kin.flatMap((k) => String(k?.name ?? '').split(/\s+/))],
    ids: [p.mrn, p.idNumber, p.crId, p.shaNumber, ...extraIds],
    phones: [p.phone, ...kin.map((k) => k?.phone)],
    emails: [p.email],
  };
}
