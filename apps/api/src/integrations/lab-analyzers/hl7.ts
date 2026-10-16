import { AnalyzerMessage, AnalyzerSpecimen, normaliseFlag, parseTs } from './types';

/** HL7 MLLP framing: <VT> message <FS><CR>. */
export const MLLP = { START: '\x0b', END: '\x1c', CR: '\r' } as const;
export const mllpWrap = (msg: string) => `${MLLP.START}${msg}${MLLP.END}${MLLP.CR}`;
/** Extract complete MLLP-framed messages from a buffer; returns messages and the unconsumed remainder. */
export function mllpExtract(buf: string): { messages: string[]; rest: string } {
  const messages: string[] = [];
  let rest = buf;
  for (;;) {
    const s = rest.indexOf(MLLP.START);
    const e = rest.indexOf(MLLP.END, s + 1);
    if (s < 0 || e < 0) break;
    messages.push(rest.slice(s + 1, e));
    rest = rest.slice(e + 1).replace(/^\r/, '');
  }
  return { messages, rest };
}

export interface Hl7Segment { name: string; fields: string[] }

export function hl7Segments(raw: string): { segments: Hl7Segment[]; fs: string; cs: string; rs: string } {
  const text = raw.replace(/^\x0b/, '').replace(/\x1c\r?$/, '');
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (!lines[0]?.startsWith('MSH')) throw new Error('HL7 message must start with MSH');
  const fs = lines[0][3], cs = lines[0][4] ?? '^', rs = lines[0][5] ?? '~';
  const segments = lines.map((l) => {
    const parts = l.split(fs);
    // MSH-1 is the field separator itself, so MSH fields are shifted by one.
    const fields = parts[0] === 'MSH' ? ['MSH', fs, ...parts.slice(1)] : parts;
    return { name: parts[0], fields };
  });
  return { segments, fs, cs, rs };
}

/** Parse an ORU^R01 observation result message (v2.3–2.5.1). Pure. */
export function parseOruR01(raw: string): AnalyzerMessage & { messageType: string } {
  const { segments, cs, rs } = hl7Segments(raw);
  const msh = segments[0].fields;
  const messageType = (msh[9] ?? '').split(cs).slice(0, 2).join('^');
  if (!/^ORU\^R01/.test(messageType)) throw new Error(`Unsupported HL7 message type ${messageType || '(none)'}; expected ORU^R01`);
  const c = (v: string | undefined, i = 0) => (v ?? '').split(rs)[0].split(cs)[i] ?? '';
  const out: AnalyzerMessage & { messageType: string } = { protocol: 'HL7', sender: c(msh[3]) || c(msh[4]) || undefined, controlId: msh[10], messageType, specimens: [] };
  let patientId: string | undefined;
  let current: AnalyzerSpecimen | undefined;
  for (const seg of segments) {
    const f = seg.fields;
    if (seg.name === 'PID') { patientId = c(f[3]) || c(f[2]) || undefined; }
    else if (seg.name === 'OBR') {
      // OBR-3 filler order number (analyser), OBR-2 placer order number (LIS accession)
      const accession = c(f[2]) || c(f[3]);
      current = { accession, patientId, results: [] };
      out.specimens.push(current);
    } else if (seg.name === 'SPM' && current) {
      const spmId = c(f[2]);
      if (spmId && !current.accession) current.accession = spmId;
    } else if (seg.name === 'OBX' && current) {
      current.results.push({
        testCode: c(f[3], 0), testName: c(f[3], 1) || undefined, value: (f[5] ?? '').split(cs)[0], unit: c(f[6]) || undefined,
        refRange: f[7] || undefined, flag: normaliseFlag(c(f[8])), status: f[11] || undefined, completedAt: parseTs(f[14]),
      });
    }
  }
  return out;
}

/** Build an HL7 ACK (AA accept / AE error / AR reject) for a received message. */
export function hl7Ack(raw: string, code: 'AA' | 'AE' | 'AR' = 'AA', text = '', now = new Date()): string {
  let ctrl = '', sendApp = '', sendFac = '', recvApp = '', recvFac = '', version = '2.5.1';
  try {
    const msh = hl7Segments(raw).segments[0].fields;
    sendApp = msh[3] ?? ''; sendFac = msh[4] ?? ''; recvApp = msh[5] ?? ''; recvFac = msh[6] ?? ''; ctrl = msh[10] ?? ''; version = msh[12] || version;
  } catch { /* malformed: ACK with empty control id */ }
  const ts = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return [`MSH|^~\\&|${recvApp}|${recvFac}|${sendApp}|${sendFac}|${ts}||ACK^R01|ACK${ctrl}|P|${version}`, `MSA|${code}|${ctrl}${text ? `|${text}` : ''}`].join('\r');
}
