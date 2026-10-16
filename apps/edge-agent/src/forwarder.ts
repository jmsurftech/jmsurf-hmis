import { FileQueue } from './queue';

/** Forwards queued messages to the API. Network errors / 5xx / 429 / 401 keep the message for retry; other 4xx go to dead/. */
export class Forwarder {
  private busy = false;
  constructor(private queue: FileQueue, private apiUrl: string, private deviceKey: string, private log = console) {}

  async flush(): Promise<{ sent: number; pending: number }> {
    if (this.busy) return { sent: 0, pending: -1 };
    this.busy = true;
    let sent = 0;
    try {
      for (const file of await this.queue.list()) {
        const item = await this.queue.read(file);
        let res: Response;
        try {
          res = await fetch(this.apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Key': this.deviceKey },
            body: JSON.stringify({ protocol: item.protocol, message: item.message }), signal: AbortSignal.timeout(15_000),
          });
        } catch (e: any) {
          this.log.warn(`[edge] API unreachable (${e?.message ?? e}); ${file} stays queued`);
          break; // offline: stop and retry the whole queue later, preserving order
        }
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          this.log.info(`[edge] forwarded ${item.protocol} ${file}: ${JSON.stringify((body as any).specimens ?? body)}`);
          await this.queue.remove(file); sent++;
        } else if (res.status >= 500 || res.status === 429 || res.status === 401) {
          await this.queue.save(file, { ...item, attempts: item.attempts + 1 });
          this.log.warn(`[edge] API ${res.status} for ${file}; will retry`);
          break;
        } else {
          await this.queue.deadLetter(file, `HTTP ${res.status}: ${await res.text()}`);
          this.log.error(`[edge] API rejected ${file} (${res.status}); moved to dead/`);
        }
      }
      return { sent, pending: (await this.queue.list()).length };
    } finally { this.busy = false; }
  }
}
