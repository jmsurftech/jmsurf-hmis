import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { hashApiKey, newApiKey } from '../../common/api-keys';
import { flagResult, pickRange, RefRange } from '../../clinical/orders/lab-flags';
import { ageInDays } from '../../clinical/shared/pagination';
import { IntegrationHttpService } from '../http-client';
import { parseAstm } from './astm';
import { parseOruR01 } from './hl7';
import { AnalyzerMessage, AnalyzerSpecimen } from './types';

export interface IngestBody { protocol?: 'ASTM' | 'HL7' | 'JSON'; message?: string; specimens?: AnalyzerSpecimen[] }

/** Parse analyser payloads and map results by specimen accession → LabResult (source ANALYZER, pending verification). */
@Injectable()
export class AnalyzerService {
  constructor(private prisma: PrismaService, private audit: AuditService, private http: IntegrationHttpService) {}

  async authenticate(apiKey?: string) {
    if (!apiKey) throw new UnauthorizedException('X-Device-Key header required');
    const d = await this.prisma.analyzerDevice.findUnique({ where: { apiKeyHash: hashApiKey(apiKey) } });
    if (!d || !d.active) throw new UnauthorizedException('Unknown or inactive device');
    return d;
  }

  parse(body: IngestBody): AnalyzerMessage {
    if (body.specimens?.length) return { protocol: 'ASTM', specimens: body.specimens };
    if (!body.message) throw new BadRequestException('message or specimens required');
    const proto = body.protocol ?? (body.message.trimStart().replace(/^\x0b/, '').startsWith('MSH') ? 'HL7' : 'ASTM');
    try { return proto === 'HL7' ? parseOruR01(body.message) : parseAstm(body.message); } catch (e: any) { throw new BadRequestException(`Parse error: ${e.message}`); }
  }

  async ingest(apiKey: string | undefined, body: IngestBody) {
    const device = await this.authenticate(apiKey);
    const t = device.tenantId;
    const msg = this.parse(body);
    await this.http.logInbound('lab-analyzer', `${msg.protocol}.results`, { deviceId: device.id, sender: msg.sender, controlId: msg.controlId, specimens: msg.specimens.length }, t, msg.controlId ? `${device.id}:${msg.controlId}` : undefined);
    const testMap = (device.testMap ?? {}) as Record<string, string>;
    const outcome: { accession: string; status: string; created: number; unmatched?: string[] }[] = [];
    for (const s of msg.specimens) {
      const spec = await this.prisma.labSpecimen.findFirst({ where: { tenantId: t, accession: s.accession }, include: { order: { include: { visit: { include: { patient: true } } } } } });
      if (!spec) { outcome.push({ accession: s.accession, status: 'UNKNOWN_ACCESSION', created: 0 }); continue; }
      if (spec.rejectedReason || ['CANCELLED', 'VERIFIED'].includes(spec.order.status)) { outcome.push({ accession: s.accession, status: `SKIPPED_${spec.order.status}`, created: 0 }); continue; }
      const p = spec.order.visit.patient;
      const codes = s.results.map((r) => testMap[r.testCode] ?? r.testCode);
      const tests = new Map((await this.prisma.labTest.findMany({ where: { tenantId: t, code: { in: codes } } })).map((x) => [x.code, x]));
      let created = 0;
      const unmatched: string[] = [];
      for (const r of s.results) {
        if (r.status && ['X', 'D', 'W'].includes(r.status.toUpperCase())) continue; // cancelled / deleted / wrong
        const code = testMap[r.testCode] ?? r.testCode;
        const test = tests.get(code);
        if (!test) unmatched.push(r.testCode);
        const computed = flagResult(r.value, pickRange((test?.refRanges as RefRange[] | null) ?? undefined, p.sex, ageInDays(p.dateOfBirth)));
        const flag = computed.flag ?? r.flag;
        await this.prisma.labResult.deleteMany({ where: { tenantId: t, orderId: spec.orderId, testCode: code, verifiedAt: null } });
        await this.prisma.labResult.create({ data: {
          tenantId: t, orderId: spec.orderId, testCode: code, value: r.value, unit: r.unit ?? test?.unit, flag,
          isCritical: computed.isCritical || flag === 'LL' || flag === 'HH', enteredBy: `device:${device.id}`, source: 'ANALYZER',
        } });
        created++;
      }
      if (created) await this.prisma.order.update({ where: { id: spec.orderId }, data: { status: 'COMPLETED' } });
      outcome.push({ accession: s.accession, status: 'PENDING_VERIFICATION', created, ...(unmatched.length ? { unmatched } : {}) });
    }
    await this.prisma.analyzerDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return { accepted: true, protocol: msg.protocol, controlId: msg.controlId, specimens: outcome };
  }

  // ───────── device admin ─────────
  listDevices(tenantId: string) {
    return this.prisma.analyzerDevice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, protocol: true, model: true, keyPrefix: true, active: true, lastSeenAt: true, testMap: true, createdAt: true } });
  }

  async createDevice(tenantId: string, userId: string, dto: { name: string; protocol?: string; model?: string; testMap?: Record<string, string> }) {
    const k = newApiKey('jmd');
    const d = await this.prisma.analyzerDevice.create({ data: { tenantId, name: dto.name, protocol: dto.protocol ?? 'ASTM', model: dto.model, testMap: dto.testMap ?? {}, apiKeyHash: k.hash, keyPrefix: k.keyPrefix } });
    await this.audit.log({ tenantId, userId, action: 'CREATE', entity: 'AnalyzerDevice', entityId: d.id });
    return { id: d.id, name: d.name, apiKey: k.key, note: 'Store this key in the edge agent config now; it is not shown again.' };
  }

  async deactivate(tenantId: string, id: string) {
    await this.prisma.analyzerDevice.updateMany({ where: { id, tenantId }, data: { active: false } });
    return { ok: true };
  }
}
