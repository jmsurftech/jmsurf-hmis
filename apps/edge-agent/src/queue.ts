import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface QueuedMessage { id: string; protocol: 'ASTM' | 'HL7'; message: string; receivedAt: string; attempts: number }

/** Durable store-and-forward queue: one JSON file per message, processed oldest first. Survives restarts and outages. */
export class FileQueue {
  constructor(private dir: string) {}
  async init() { await fs.mkdir(path.join(this.dir, 'dead'), { recursive: true }); }

  async enqueue(protocol: QueuedMessage['protocol'], message: string) {
    const item: QueuedMessage = { id: `${Date.now()}-${randomUUID()}`, protocol, message, receivedAt: new Date().toISOString(), attempts: 0 };
    const tmp = path.join(this.dir, `${item.id}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(item));
    await fs.rename(tmp, path.join(this.dir, `${item.id}.json`)); // atomic publish
    return item;
  }

  async list(): Promise<string[]> {
    return (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json')).sort();
  }
  async read(file: string): Promise<QueuedMessage> { return JSON.parse(await fs.readFile(path.join(this.dir, file), 'utf8')); }
  async save(file: string, item: QueuedMessage) { await fs.writeFile(path.join(this.dir, file), JSON.stringify(item)); }
  async remove(file: string) { await fs.unlink(path.join(this.dir, file)); }
  async deadLetter(file: string, reason: string) {
    const item = await this.read(file);
    await fs.writeFile(path.join(this.dir, 'dead', file), JSON.stringify({ ...item, reason }));
    await this.remove(file);
  }
}
