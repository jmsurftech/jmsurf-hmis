import { AnalyzerMessage, AnalyzerSpecimen, normaliseFlag, parseTs } from './types';

/** ASTM E1381 low-level control characters. */
export const ASTM = { ENQ: '\x05', ACK: '\x06', NAK: '\x15', EOT: '\x04', STX: '\x02', ETX: '\x03', ETB: '\x17', CR: '\r', LF: '\n' } as const;

/** Modulo-256 checksum of frame number + text + ETX/ETB, as two uppercase hex chars. */
export function astmChecksum(body: string): string {
  let sum = 0;
  for (const ch of body) sum = (sum + ch.charCodeAt(0)) % 256;
  return sum.toString(16).toUpperCase().padStart(2, '0');
}

/** Wrap record text into E1381 frames (max 240 chars of text each). */
export function astmFrames(records: string[], maxText = 240): string[] {
  const text = records.map((r) => `${r}\r`).join('');
  const frames: string[] = [];
  for (let i = 0, fn = 1; i < text.length; i += maxText, fn = (fn + 1) % 8) {
    const chunk = text.slice(i, i + maxText);
    const last = i + maxText >= text.length;
    const body = `${fn}${chunk}${last ? ASTM.ETX : ASTM.ETB}`;
    frames.push(`${ASTM.STX}${body}${astmChecksum(body)}\r\n`);
  }
  return frames;
}

/**
 * Remove E1381 framing (STX, frame number, ETB/ETX + checksum + CRLF) and validate checksums.
 * Text without STX is returned unchanged (already-deframed E1394 content).
 */
export function astmDeframe(raw: string): { text: string; checksumErrors: number } {
  if (!raw.includes(ASTM.STX)) return { text: raw, checksumErrors: 0 };
  let text = '';
  let checksumErrors = 0;
  const re = /\x02([0-7])([\s\S]*?)([\x03\x17])([0-9A-Fa-f]{2})\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (astmChecksum(`${m[1]}${m[2]}${m[3]}`) !== m[4].toUpperCase()) checksumErrors++;
    text += m[2];
  }
  return { text, checksumErrors };
}

/** Parse ASTM E1394 records (H, P, O, R, C, L) into specimens and results. Pure. */
export function parseAstm(raw: string): AnalyzerMessage & { checksumErrors: number } {
  const { text, checksumErrors } = astmDeframe(raw);
  const records = text.split(/\r\n|\r|\n/).map((r) => r.replace(/^[\x02\x03\x04\x05\x06]+/, '')).filter((r) => /^[A-Z]\|/i.test(r) || /^[A-Z]./.test(r));
  let fd = '|', rd = '\\', cd = '^';
  const msg: AnalyzerMessage & { checksumErrors: number } = { protocol: 'ASTM', specimens: [], checksumErrors };
  let patientId: string | undefined;
  let current: AnalyzerSpecimen | undefined;
  for (const rec of records) {
    const type = rec[0].toUpperCase();
    if (type === 'H') {
      fd = rec[1]; rd = rec[2] ?? rd; cd = rec[3] ?? cd;
      const f = rec.split(fd);
      msg.sender = f[4]?.split(cd)[0] || undefined;
      continue;
    }
    const f = rec.split(fd);
    const comp = (i: number) => (f[i] ?? '').split(rd)[0].split(cd);
    if (type === 'P') { patientId = f[3] || f[2] || undefined; current = undefined; }
    else if (type === 'O') {
      // O.3 specimen ID (sample/accession), O.4 instrument specimen ID
      const accession = comp(2)[0] || comp(3)[0];
      current = msg.specimens.find((s) => s.accession === accession) ?? { accession, patientId, results: [] };
      if (!msg.specimens.includes(current)) msg.specimens.push(current);
    } else if (type === 'R' && current) {
      // R.3 universal test ID ^^^code^name, R.4 value, R.5 units, R.6 ref range, R.7 flags, R.9 status, R.13 completed
      const tid = comp(2);
      const testCode = tid[3] || tid.find(Boolean) || '';
      current.results.push({
        testCode, testName: tid[4] || undefined, value: (f[3] ?? '').split(cd)[0], unit: f[4] || undefined,
        refRange: f[5] || undefined, flag: normaliseFlag(f[6]), status: f[8] || undefined, completedAt: parseTs(f[12]),
      });
    }
  }
  return msg;
}
