/** ASTM E1381 and HL7 MLLP framing helpers (kept dependency-free; mirrors apps/api/src/integrations/lab-analyzers). */
export const ENQ = 0x05, ACK = 0x06, NAK = 0x15, EOT = 0x04, STX = 0x02, ETX = 0x03, ETB = 0x17, CR = 0x0d, LF = 0x0a;
export const VT = 0x0b, FS = 0x1c;

export function astmChecksum(body: string): string {
  let sum = 0;
  for (const ch of body) sum = (sum + ch.charCodeAt(0)) % 256;
  return sum.toString(16).toUpperCase().padStart(2, '0');
}

/** Validate one received frame "<STX>FN text <ETX|ETB> CS CS <CR><LF>"; returns its text or null if the checksum fails. */
export function readFrame(frame: string): { text: string; final: boolean } | null {
  const m = /^\x02([0-7])([\s\S]*?)([\x03\x17])([0-9A-Fa-f]{2})\r?\n?$/.exec(frame);
  if (!m) return null;
  if (astmChecksum(`${m[1]}${m[2]}${m[3]}`) !== m[4].toUpperCase()) return null;
  return { text: m[2], final: m[3] === '\x03' };
}

export function astmFrames(records: string[], maxText = 240): string[] {
  const text = records.map((r) => `${r}\r`).join('');
  const frames: string[] = [];
  for (let i = 0, fn = 1; i < text.length; i += maxText, fn = (fn + 1) % 8) {
    const last = i + maxText >= text.length;
    const body = `${fn}${text.slice(i, i + maxText)}${last ? '\x03' : '\x17'}`;
    frames.push(`\x02${body}${astmChecksum(body)}\r\n`);
  }
  return frames;
}

export const mllpWrap = (msg: string) => `\x0b${msg}\x1c\r`;
export function mllpExtract(buf: string): { messages: string[]; rest: string } {
  const messages: string[] = [];
  let rest = buf;
  for (;;) {
    const s = rest.indexOf('\x0b');
    const e = rest.indexOf('\x1c', s + 1);
    if (s < 0 || e < 0) break;
    messages.push(rest.slice(s + 1, e));
    rest = rest.slice(e + 1).replace(/^\r/, '');
  }
  return { messages, rest };
}

export function hl7Ack(msg: string, code: 'AA' | 'AE' = 'AA'): string {
  const msh = (msg.split(/\r|\n/)[0] ?? '').split('|');
  const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `MSH|^~\\&|${msh[4] ?? ''}|${msh[5] ?? ''}|${msh[2] ?? ''}|${msh[3] ?? ''}|${ts}||ACK^R01|ACK${msh[9] ?? ''}|P|${msh[11] || '2.5.1'}\rMSA|${code}|${msh[9] ?? ''}`;
}
