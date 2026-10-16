/**
 * Deterministic, rule-based fallbacks used when no ANTHROPIC_API_KEY is configured (demo / air-gapped sites).
 * They are intentionally simple and always marked as drafts.
 */
import { ICD11_CODES } from '../clinical/emr/icd11-codes';

export interface SoapDraft { subjective: string; objective: string; assessment: string; plan: string }

const SECTION_HINTS: [keyof SoapDraft, RegExp][] = [
  ['objective', /\b(bp|pulse|temp|temperature|spo2|sat|rr|resp|hr|o\/e|on exam|examination|weight|hb|rbs|mrdt|bs for mps|tender|auscultation|chest clear|joto|shinikizo|uchunguzi)\b/i],
  ['assessment', /\b(impression|diagnosis|dx|assessment|likely|suspect|r\/o|rule out|differential|utambuzi|inawezekana)\b/i],
  ['plan', /\b(plan|start|give|prescribe|rx|review|refer|admit|tabs?|mg|follow[- ]?up|counsel|request|order|mpango|dawa|rudi|apewe)\b/i],
];
const LABELS = /^\s*(s|o|a|p|subjective|objective|assessment|plan|history|hpi|complaints?|exam(ination)?|impression|malalamiko|uchunguzi|utambuzi|mpango)\s*[:\-]\s*/i;
const LABEL_MAP: Record<string, keyof SoapDraft> = {
  s: 'subjective', subjective: 'subjective', history: 'subjective', hpi: 'subjective', complaint: 'subjective', complaints: 'subjective', malalamiko: 'subjective',
  o: 'objective', objective: 'objective', exam: 'objective', examination: 'objective', uchunguzi: 'objective',
  a: 'assessment', assessment: 'assessment', impression: 'assessment', utambuzi: 'assessment',
  p: 'plan', plan: 'plan', mpango: 'plan',
};

/** Split dictation into SOAP sections by explicit labels, else by sentence keyword heuristics. */
export function offlineSoap(text: string): SoapDraft {
  const out: Record<keyof SoapDraft, string[]> = { subjective: [], objective: [], assessment: [], plan: [] };
  const sentences = text.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  let current: keyof SoapDraft | null = null;
  for (const s of sentences) {
    const m = LABELS.exec(s);
    if (m) { current = LABEL_MAP[m[1].toLowerCase()] ?? current; const rest = s.slice(m[0].length).trim(); if (rest && current) out[current].push(rest); continue; }
    const hinted = SECTION_HINTS.find(([, re]) => re.test(s))?.[0];
    out[current ?? hinted ?? 'subjective'].push(s);
  }
  return { subjective: out.subjective.join(' '), objective: out.objective.join(' '), assessment: out.assessment.join(' '), plan: out.plan.join(' ') };
}

const SYNONYMS: Record<string, string[]> = {
  malaria: ['malaria', 'mrdt positive', 'bs for mps positive', 'homa ya malaria'],
  pneumonia: ['pneumonia', 'nimonia'],
  hypertension: ['hypertension', 'htn', 'high blood pressure', 'shinikizo la damu'],
  diabetes: ['diabetes', 'dm', 'kisukari', 'hyperglycaemia'],
  'urinary tract infection': ['uti', 'urinary tract infection'],
  gastroenteritis: ['gastroenteritis', 'diarrhoea and vomiting', 'kuhara'],
  diarrhoea: ['diarrhoea', 'diarrhea', 'kuhara'],
  typhoid: ['typhoid'],
  tuberculosis: ['tb', 'tuberculosis', 'kifua kikuu'],
  asthma: ['asthma', 'pumu'],
  anaemia: ['anaemia', 'anemia', 'upungufu wa damu'],
  'upper respiratory': ['urti', 'common cold', 'mafua'],
};

/** Keyword match of note text against the local ICD-11 list. */
export function offlineIcd(text: string, limit = 5) {
  const t = ` ${text.toLowerCase()} `;
  const hits = new Map<string, { code: string; title: string; confidence: number; rationale: string }>();
  for (const [concept, words] of Object.entries(SYNONYMS)) {
    const w = words.find((x) => t.includes(` ${x} `) || t.includes(` ${x},`) || t.includes(` ${x}.`) || t.includes(`${x} `));
    if (!w) continue;
    for (const c of ICD11_CODES.filter((c) => c.title.toLowerCase().split(/[,(]| due to | without | with /)[0].includes(concept)).slice(0, 2)) {
      if (!hits.has(c.code)) hits.set(c.code, { code: c.code, title: c.title, confidence: 0.6, rationale: `Note mentions "${w}"` });
    }
  }
  if (hits.size < limit) {
    for (const c of ICD11_CODES) {
      const title = c.title.toLowerCase();
      if (title.length > 5 && t.includes(title.split(/[,(]/)[0].trim())) hits.set(c.code, { code: c.code, title: c.title, confidence: 0.75, rationale: 'Title appears in note' });
    }
  }
  return [...hits.values()].sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

export interface DischargeInput {
  reason?: string | null; admittedAt: Date; dischargedAt?: Date | null; ward?: string | null;
  diagnoses: { code: string; display: string }[]; notes: { type: string; assessment?: string | null; plan?: string | null }[];
  procedures: string[]; medications: string[]; labs: { testCode: string; value: string; unit?: string | null; flag?: string | null }[];
}
export function offlineDischarge(d: DischargeInput): string {
  const days = Math.max(1, Math.round(((d.dischargedAt ?? new Date()).getTime() - d.admittedAt.getTime()) / 86400000));
  const abnormal = d.labs.filter((l) => l.flag && l.flag !== 'N');
  const lastPlan = [...d.notes].reverse().find((n) => n.plan)?.plan;
  return [
    `DISCHARGE SUMMARY (AI draft – requires clinician review)`,
    `Admission: ${d.admittedAt.toISOString().slice(0, 10)}${d.ward ? ` to ${d.ward}` : ''}; length of stay ${days} day(s).`,
    `Reason for admission: ${d.reason ?? 'not recorded'}.`,
    `Diagnoses: ${d.diagnoses.map((x) => `${x.display} (${x.code})`).join('; ') || 'none coded'}.`,
    d.procedures.length ? `Procedures: ${d.procedures.join('; ')}.` : '',
    abnormal.length ? `Significant results: ${abnormal.map((l) => `${l.testCode} ${l.value}${l.unit ? ` ${l.unit}` : ''} (${l.flag})`).join('; ')}.` : 'No significantly abnormal results recorded.',
    d.medications.length ? `Medications during stay: ${d.medications.join('; ')}.` : '',
    `Hospital course: ${d.notes.map((n) => n.assessment).filter(Boolean).slice(-3).join(' ') || 'see progress notes'}.`,
    `Plan on discharge: ${lastPlan ?? 'review in clinic in 2 weeks; return if symptoms recur'}.`,
  ].filter(Boolean).join('\n');
}

const FIXES: Record<string, string> = {
  MISSING_DIAGNOSIS: 'Add at least one ICD-11 coded diagnosis on the visit.',
  NON_ICD11_DIAGNOSIS: 'Re-code diagnoses using ICD-11 (MMS) codes.',
  MISSING_CR_ID: 'Look the patient up in the Client Registry and save the CR ID.',
  PREAUTH_REQUIRED: 'Request and obtain pre-authorisation for the intervention before submitting.',
  AMOUNT_ABOVE_TARIFF: 'Reduce the claimed amount to the package tariff; bill the difference to the patient if allowed.',
  PACKAGE_NOT_ALLOWED_FOR_LEVEL: 'Refer, or use an intervention allowed at this facility level.',
  FREQUENCY_LIMIT_EXCEEDED: 'Check prior usage; attach clinical justification or remove the extra line.',
  DUPLICATE_CLAIM: 'Cancel the duplicate claim for the same visit/bill.',
  UNMAPPED_INTERVENTION: 'Map the service item to an SHA intervention code in the price list.',
  MISSING_PRACTITIONER: 'Assign the treating practitioner to the visit.',
  PRACTITIONER_NO_LICENCE: 'Record the practitioner licence number.',
  PRACTITIONER_LICENCE_EXPIRED: 'Renew/record the current practitioner licence before submission.',
  NO_LINES: 'Add billable lines to the claim.',
};
export function offlineClaimRisk(issues: { code: string; severity: string; message: string }[], risk?: number | null, rejectionReason?: string | null) {
  const level = (risk ?? 0) >= 0.6 || issues.some((i) => i.severity === 'ERROR') ? 'HIGH' : (risk ?? 0) >= 0.3 || issues.length ? 'MEDIUM' : 'LOW';
  return {
    riskLevel: level,
    explanation: issues.length
      ? `${issues.length} scrubber issue(s): ${issues.map((i) => i.message).join(' ')}${rejectionReason ? ` Payer reason: ${rejectionReason}.` : ''}`
      : rejectionReason ? `Payer reason: ${rejectionReason}.` : 'No scrubber issues found; the claim looks ready.',
    fixes: [
      ...issues.map((i) => ({ issueCode: i.code, action: FIXES[i.code] ?? `Resolve: ${i.message}` })),
      ...(rejectionReason && /discharge summary/i.test(rejectionReason) ? [{ issueCode: 'PAYER_QUERY', action: 'Attach the signed discharge summary and resubmit.' }] : []),
    ],
  };
}
