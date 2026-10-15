/** Normalised analyser output shared by the ASTM and HL7 parsers and the edge agent. */
export interface AnalyzerResult {
  testCode: string; testName?: string; value: string; unit?: string; refRange?: string;
  flag?: string; status?: string; completedAt?: string;
}
export interface AnalyzerSpecimen { accession: string; patientId?: string; results: AnalyzerResult[] }
export interface AnalyzerMessage { protocol: 'ASTM' | 'HL7'; sender?: string; controlId?: string; specimens: AnalyzerSpecimen[] }

/** Map analyser abnormal flags (ASTM / HL7 table 0078) to the HMIS flag set. */
export const normaliseFlag = (f?: string): string | undefined => {
  const v = (f ?? '').trim().toUpperCase();
  if (!v) return undefined;
  if (['N', 'NORMAL'].includes(v)) return 'N';
  if (['L', '<'].includes(v)) return 'L';
  if (['H', '>'].includes(v)) return 'H';
  if (v === 'LL') return 'LL';
  if (v === 'HH') return 'HH';
  if (v === 'A' || v === 'AA') return v === 'AA' ? 'HH' : 'H';
  return undefined;
};

/** YYYYMMDD[HHMM[SS]] → ISO string. */
export const parseTs = (s?: string): string | undefined => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec((s ?? '').trim());
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))).toISOString();
};
