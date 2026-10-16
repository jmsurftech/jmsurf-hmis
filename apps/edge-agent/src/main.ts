import { config } from './config';
import { FileQueue } from './queue';
import { Forwarder } from './forwarder';
import { astmServer, mllpServer } from './servers';

async function main() {
  if (!config.deviceKey) console.warn('[edge] EDGE_DEVICE_KEY is not set; the API will reject forwarded results (401). Messages stay queued.');
  const queue = new FileQueue(config.queueDir);
  await queue.init();
  const fwd = new Forwarder(queue, config.apiUrl, config.deviceKey);
  const kick = () => { void fwd.flush(); };
  astmServer(queue, kick).listen(config.astmPort, () => console.log(`[edge] ASTM (E1381) listening on :${config.astmPort}`));
  mllpServer(queue, kick).listen(config.hl7Port, () => console.log(`[edge] HL7 MLLP listening on :${config.hl7Port}`));
  setInterval(kick, config.flushIntervalMs);
  kick();
  console.log(`[edge] forwarding to ${config.apiUrl}; queue at ${config.queueDir}`);
}
void main();
