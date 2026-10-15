import * as net from 'net';
import { ACK, ENQ, EOT, hl7Ack, mllpExtract, mllpWrap, NAK, readFrame } from './framing';
import { FileQueue } from './queue';

/**
 * ASTM E1381 receiver: ENQ → ACK, each frame validated (ACK / NAK), EOT ends the transmission
 * and the assembled E1394 records are queued.
 */
export function astmServer(queue: FileQueue, onMessage: () => void, log = console) {
  return net.createServer((sock) => {
    let frameBuf = '';
    let records = '';
    let inTransfer = false;
    sock.setEncoding('latin1');
    sock.on('data', async (chunk: string) => {
      for (const ch of chunk) {
        const c = ch.charCodeAt(0);
        if (!inTransfer) {
          if (c === ENQ) { inTransfer = true; records = ''; sock.write(Buffer.from([ACK])); }
          continue;
        }
        if (c === EOT && !frameBuf) {
          inTransfer = false;
          if (records) { await queue.enqueue('ASTM', records); log.info(`[edge] ASTM message queued (${records.split('\r').filter(Boolean).length} records)`); onMessage(); }
          continue;
        }
        frameBuf += ch;
        if (c === 0x0a && frameBuf.startsWith('\x02')) {
          const f = readFrame(frameBuf);
          frameBuf = '';
          if (f) { records += f.text; sock.write(Buffer.from([ACK])); } else { sock.write(Buffer.from([NAK])); }
        }
      }
    });
    sock.on('error', (e) => log.warn(`[edge] ASTM socket error: ${e.message}`));
  });
}

/** HL7 v2 MLLP receiver: queue each message, then ACK (AA) — store-and-forward semantics. */
export function mllpServer(queue: FileQueue, onMessage: () => void, log = console) {
  return net.createServer((sock) => {
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', async (chunk: string) => {
      const { messages, rest } = mllpExtract(buf + chunk);
      buf = rest;
      for (const m of messages) {
        try { await queue.enqueue('HL7', m); sock.write(mllpWrap(hl7Ack(m, 'AA'))); log.info('[edge] HL7 message queued'); onMessage(); }
        catch (e: any) { sock.write(mllpWrap(hl7Ack(m, 'AE'))); log.error(`[edge] queue error: ${e.message}`); }
      }
    });
    sock.on('error', (e) => log.warn(`[edge] MLLP socket error: ${e.message}`));
  });
}
