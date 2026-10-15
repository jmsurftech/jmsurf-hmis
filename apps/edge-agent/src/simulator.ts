/**
 * Analyser simulator: sends a sample ASTM transmission (ENQ, frames with ACK handshake, EOT) and an HL7 ORU^R01 over MLLP
 * to the edge agent. Usage: pnpm --filter @jmsurf-hmis/edge-agent simulate [accession] [astm|hl7|both]
 */
import * as net from 'net';
import { astmFrames, mllpExtract, mllpWrap } from './framing';
import { config } from './config';

const accession = process.argv[2] ?? 'LAB-2026-000001';
const mode = process.argv[3] ?? 'both';
const host = process.env.EDGE_HOST ?? '127.0.0.1';
const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const ASTM_RECORDS = [
  `H|\\^&|||Simulator^BC-5150^1.0|||||||P|E1394-97|${ts}`,
  'P|1||SIM001',
  `O|1|${accession}||^^^CBC|R|${ts}`,
  `R|1|^^^HB^Haemoglobin|11.2|g/dL|12.0-16.0|L||F||||${ts}`,
  `R|2|^^^WBC^White cells|8.4|10*9/L|4.0-11.0|N||F||||${ts}`,
  'L|1|N',
];
const ORU = [
  `MSH|^~\\&|SIMHL7|LAB|JMSURF|HOSP|${ts}||ORU^R01^ORU_R01|SIM${ts}|P|2.5.1`,
  'PID|1||SIM002',
  `OBR|1|${accession}|SIM-1|GLU^Glucose|||${ts}`,
  `OBX|1|NM|RBS^Random blood sugar||6.2|mmol/L|3.9-7.8|N|||F|||${ts}`,
].join('\r');

function sendAstm(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(config.astmPort, host);
    const frames = astmFrames(ASTM_RECORDS, 80);
    let i = -1;
    sock.on('data', (d) => {
      const c = d[0];
      if (c === 0x15) { console.log(`[sim] NAK on frame ${i}; resending`); sock.write(frames[i]); return; }
      if (c !== 0x06) return;
      i++;
      if (i < frames.length) sock.write(frames[i]);
      else { sock.write(Buffer.from([0x04])); console.log(`[sim] ASTM sent ${frames.length} frame(s) for ${accession}`); sock.end(); resolve(); }
    });
    sock.on('error', reject);
    sock.write(Buffer.from([0x05]));
  });
}

function sendHl7(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(config.hl7Port, host);
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (d: string) => {
      const { messages } = mllpExtract((buf += d));
      if (messages.length) { console.log(`[sim] HL7 ACK: ${messages[0].split('\r')[1]}`); sock.end(); resolve(); }
    });
    sock.on('error', reject);
    sock.write(mllpWrap(ORU));
  });
}

(async () => {
  if (mode === 'astm' || mode === 'both') await sendAstm();
  if (mode === 'hl7' || mode === 'both') await sendHl7();
})().catch((e) => { console.error(`[sim] ${e.message}`); process.exit(1); });
