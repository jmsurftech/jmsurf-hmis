import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const run = promisify(execFile);
const DEMO_SLUG = 'demo';

/**
 * Public demo: every night (02:00 Nairobi) everything visitors changed in the demo tenant is removed
 * and the neutral seed is loaded again. Only runs when SEED_DEMO=true. Other tenants are never touched.
 */
@Injectable()
export class DemoResetService {
  private log = new Logger('DemoReset');
  private running = false;
  constructor(private prisma: PrismaService) {}

  @Cron('0 0 2 * * *', { timeZone: 'Africa/Nairobi' })
  async nightly() {
    if (process.env.SEED_DEMO !== 'true') return;
    await this.reset();
  }

  async reset() {
    if (this.running) return { ok: false, reason: 'already running' };
    this.running = true;
    const t0 = Date.now();
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
      if (tenant) {
        const tables = await this.prisma.$queryRaw<{ table_name: string }[]>`
          SELECT c.table_name FROM information_schema.columns c
          JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema AND t.table_type = 'BASE TABLE'
          WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND c.table_name <> 'Tenant'`;
        // Foreign keys are skipped for this transaction only, so tables can be emptied in any order.
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
          for (const { table_name } of tables) await tx.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, tenant.id);
        }, { timeout: 120_000 });
        this.log.log(`Cleared ${tables.length} tables of the demo tenant`);
      }
      const { stdout } = await run('npx', ['ts-node', 'prisma/seed.ts'], { cwd: process.cwd(), timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024 });
      this.log.log(`Demo reloaded in ${Math.round((Date.now() - t0) / 1000)} s: ${stdout.split('\n').slice(-3).join(' ').slice(0, 200)}`);
      return { ok: true };
    } catch (e) {
      this.log.error(`Demo reset failed: ${(e as Error).message}`);
      return { ok: false, reason: (e as Error).message };
    } finally { this.running = false; }
  }
}
