import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { ICD11_CODES } from '../clinical/emr/icd11-codes';
import { deidentify, identifiersOf, KnownIdentifiers } from './deidentify';
import { LlmClient } from './llm.client';
import { offlineClaimRisk, offlineDischarge, offlineIcd, offlineSoap, SoapDraft } from './offline';
import { forecastDemand, weeklySeries } from './forecast';
import { decryptNoteFields } from '../common/field-crypto';

export const AI_DISCLAIMER = 'AI-generated draft. Must be reviewed, edited and signed off by a qualified clinician/officer before use.';

const SYSTEM_BASE = 'You assist clinicians and claims officers at a hospital in East Africa. Input text may be English, Kiswahili or a mix. '
  + 'Patient identifiers have been replaced with placeholders like [NAME] or [ID]; keep placeholders as-is and never invent identifiers. '
  + 'Your output is a draft for a human to review. Do not invent findings that are not supported by the input.';

const str = { type: 'string' } as const;

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService, private llm: LlmClient) {}

  // ───────── settings & logging ─────────
  async settings(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
    const s = (t.settings ?? {}) as Record<string, any>;
    return { aiEnabled: !!s.aiEnabled, llmConfigured: this.llm.enabled, model: this.llm.enabled ? this.llm.model : 'offline-rules' };
  }

  async setEnabled(user: AuthUser, aiEnabled: boolean) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { settings: true } });
    await this.prisma.tenant.update({ where: { id: user.tenantId }, data: { settings: { ...((t.settings ?? {}) as object), aiEnabled } } });
    return this.settings(user.tenantId);
  }

  private async assertEnabled(tenantId: string) {
    if (!(await this.settings(tenantId)).aiEnabled) throw new ForbiddenException('AI assistance is not enabled for this facility (Admin → AI settings).');
  }

  usage(tenantId: string) {
    return this.prisma.aiCallLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** Run LLM if configured, else offline fallback; always logs the call. */
  private async run<T>(user: AuthUser, feature: string, entity: { type?: string; id?: string }, llmCall: () => Promise<{ data: T; model: string; inputTokens: number; outputTokens: number } | null>, offline: () => T) {
    await this.assertEnabled(user.tenantId);
    const started = Date.now();
    let result: { data: T; model: string; inputTokens: number; outputTokens: number } | null = null;
    let status = 'OK', error: string | undefined;
    try { result = await llmCall(); } catch (e: any) { status = 'ERROR'; error = String(e?.message ?? e).slice(0, 500); }
    if (!result) { if (status === 'OK') status = 'FALLBACK'; result = { data: offline(), model: 'offline-rules', inputTokens: 0, outputTokens: 0 }; }
    await this.prisma.aiCallLog.create({ data: {
      tenantId: user.tenantId, userId: user.sub, feature, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      latencyMs: Date.now() - started, status, error, entityType: entity.type, entityId: entity.id,
    } });
    return { draft: true, requiresSignOff: true, disclaimer: AI_DISCLAIMER, model: result.model, source: result.model === 'offline-rules' ? 'OFFLINE' : 'LLM', ...result.data };
  }

  private async patientIds(tenantId: string, visitId?: string): Promise<KnownIdentifiers> {
    if (!visitId) return {};
    const v = await this.prisma.visit.findFirst({ where: { id: visitId, tenantId }, include: { patient: true } });
    return v ? identifiersOf(v.patient, [v.visitNumber]) : {};
  }

  // ───────── (1) SOAP from dictation ─────────
  async soap(user: AuthUser, text: string, visitId?: string) {
    if (!text?.trim()) throw new BadRequestException('text is required');
    const clean = deidentify(text, await this.patientIds(user.tenantId, visitId)).text;
    return this.run<SoapDraft & { language?: string }>(user, 'SOAP_DRAFT', { type: 'Visit', id: visitId },
      () => this.llm.json(`${SYSTEM_BASE} Convert the clinician's dictation into a concise SOAP note in English (translate Kiswahili). Leave a section empty if nothing supports it.`,
        clean, { type: 'object', additionalProperties: false, required: ['subjective', 'objective', 'assessment', 'plan', 'language'],
          properties: { subjective: str, objective: str, assessment: str, plan: str, language: { type: 'string', enum: ['en', 'sw', 'mixed'] } } }),
      () => offlineSoap(clean));
  }

  // ───────── (2) ICD-11 suggestions ─────────
  async icd(user: AuthUser, text: string, visitId?: string) {
    if (!text?.trim()) throw new BadRequestException('text is required');
    const clean = deidentify(text, await this.patientIds(user.tenantId, visitId)).text;
    const valid = new Map(ICD11_CODES.map((c) => [c.code, c]));
    const r = await this.run<{ suggestions: { code: string; title: string; confidence: number; rationale: string }[] }>(user, 'ICD_SUGGEST', { type: 'Visit', id: visitId },
      async () => {
        const res = await this.llm.json<{ suggestions: { code: string; confidence: number; rationale: string }[] }>(
          `${SYSTEM_BASE} Suggest up to 5 ICD-11 MMS diagnosis codes supported by the note. Choose ONLY from this list (code|title):\n${ICD11_CODES.map((c) => `${c.code}|${c.title}`).join('\n')}`,
          clean, { type: 'object', additionalProperties: false, required: ['suggestions'], properties: { suggestions: { type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['code', 'confidence', 'rationale'], properties: { code: str, confidence: { type: 'number' }, rationale: str } } } } });
        if (!res) return null;
        return { ...res, data: { suggestions: res.data.suggestions.map((s) => ({ ...s, title: valid.get(s.code)?.title ?? '' })) } };
      },
      () => ({ suggestions: offlineIcd(clean) }));
    // Validate against the local ICD-11 list: anything not in it is dropped.
    const suggestions = r.suggestions.filter((s) => valid.has(s.code)).map((s) => ({ ...s, title: valid.get(s.code)!.title, icd10: valid.get(s.code)!.icd10 }));
    return { ...r, suggestions, rejected: r.suggestions.length - suggestions.length };
  }

  // ───────── (3) discharge summary ─────────
  async discharge(user: AuthUser, admissionId: string, includeSensitive = false) {
    const a = await this.prisma.admission.findFirst({ where: { id: admissionId, tenantId: user.tenantId }, include: { visit: { include: {
      patient: true, diagnoses: true, notes: { orderBy: { createdAt: 'asc' } }, prescriptions: true, orders: { include: { labResults: true } } } } } });
    if (!a) throw new NotFoundException('Admission not found');
    // Sensitive notes are encrypted at rest; decrypt, and exclude them from AI input unless explicitly requested.
    const notes = a.visit.notes.filter((n) => includeSensitive || !n.sensitive).map((n) => decryptNoteFields(n));
    const ward = await this.prisma.ward.findFirst({ where: { id: a.wardId, tenantId: user.tenantId }, select: { name: true } });
    const surgeries = await this.prisma.surgery.findMany({ where: { tenantId: user.tenantId, visitId: a.visitId }, select: { procedure: true } });
    const input = {
      reason: a.reason, admittedAt: a.admittedAt, dischargedAt: a.dischargedAt, ward: ward?.name,
      diagnoses: a.visit.diagnoses.map((d) => ({ code: d.code, display: d.display })),
      notes: notes.map((n) => ({ type: n.type, assessment: n.assessment, plan: n.plan })),
      procedures: surgeries.map((s) => s.procedure),
      medications: a.visit.prescriptions.map((p) => `${p.drugName} ${p.dose} ${p.frequency}`),
      labs: a.visit.orders.flatMap((o) => o.labResults.map((l) => ({ testCode: l.testCode, value: l.value, unit: l.unit, flag: l.flag }))),
    };
    const ids = identifiersOf(a.visit.patient, [a.visit.visitNumber]);
    const payload = deidentify(JSON.stringify({ ...input, notes: notes.map((n) => ({ type: n.type, s: n.subjective, o: n.objective, a: n.assessment, p: n.plan })) }), ids).text;
    return this.run<{ summary: string }>(user, 'DISCHARGE_DRAFT', { type: 'Admission', id: a.id },
      () => this.llm.json(`${SYSTEM_BASE} Write a discharge summary (plain text with headings: Admission, Diagnoses, Hospital course, Procedures, Significant results, Discharge medications, Follow-up plan) from this admission data.`,
        payload, { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: str } }),
      () => ({ summary: offlineDischarge(input) }));
  }

  // ───────── (4) claim denial risk ─────────
  async claimRisk(user: AuthUser, claimId: string) {
    const c = await this.prisma.claim.findFirst({ where: { id: claimId, tenantId: user.tenantId }, include: { lines: true } });
    if (!c) throw new NotFoundException('Claim not found');
    const issues = (Array.isArray(c.scrubIssues) ? c.scrubIssues : []) as { code: string; severity: string; message: string }[];
    const payload = JSON.stringify({ status: c.status, rejectionRisk: c.rejectionRisk, payerReason: c.rejectionReason, issues,
      lines: c.lines.map((l) => ({ code: l.code, description: l.description, quantity: l.quantity, amountMinor: l.amountMinor })) });
    return this.run<{ riskLevel: string; explanation: string; fixes: { issueCode: string; action: string }[] }>(user, 'CLAIM_RISK', { type: 'Claim', id: c.id },
      () => this.llm.json(`${SYSTEM_BASE} Explain to a claims officer why this insurance claim (SHA or private insurer) is at risk of denial, and list concrete fixes, one per issue.`,
        deidentify(payload).text, { type: 'object', additionalProperties: false, required: ['riskLevel', 'explanation', 'fixes'], properties: {
          riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, explanation: str,
          fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['issueCode', 'action'], properties: { issueCode: str, action: str } } } } }),
      () => offlineClaimRisk(issues, c.rejectionRisk, c.rejectionReason));
  }

  // ───────── (5) stock forecast (statistical; no LLM, no opt-in needed) ─────────
  async forecast(tenantId: string, opts: { storeId?: string; weeks?: number; horizonWeeks?: number; leadTimeWeeks?: number; onlyReorder?: boolean }) {
    const weeks = Math.min(Math.max(opts.weeks ?? 26, 4), 104);
    const asOf = new Date();
    const since = new Date(asOf.getTime() - weeks * 7 * 86400000);
    const [items, moves, stock] = await Promise.all([
      this.prisma.stockItem.findMany({ where: { tenantId, active: true }, select: { id: true, code: true, name: true, unit: true, reorderLevel: true } }),
      this.prisma.stockMovement.findMany({ where: { tenantId, createdAt: { gte: since }, ...(opts.storeId ? { fromStoreId: opts.storeId } : {}) }, select: { itemId: true, type: true, quantity: true, createdAt: true } }),
      this.prisma.stockBatch.groupBy({ by: ['itemId'], where: { tenantId, ...(opts.storeId ? { storeId: opts.storeId } : {}) }, _sum: { quantity: true } }),
    ]);
    const byItem = new Map<string, typeof moves>();
    for (const m of moves) (byItem.get(m.itemId) ?? byItem.set(m.itemId, []).get(m.itemId)!).push(m);
    const onHand = new Map(stock.map((s) => [s.itemId, s._sum.quantity ?? 0]));
    const rows = items.map((it) => {
      const series = weeklySeries(byItem.get(it.id) ?? [], weeks, asOf);
      const f = forecastDemand({ series, onHand: onHand.get(it.id) ?? 0, reorderLevel: it.reorderLevel, horizonWeeks: opts.horizonWeeks, leadTimeWeeks: opts.leadTimeWeeks });
      return { itemId: it.id, code: it.code, name: it.name, unit: it.unit, onHand: onHand.get(it.id) ?? 0, history: series.slice(-12), ...f };
    }).filter((r) => r.avgWeekly > 0 || r.shouldReorder);
    rows.sort((a, b) => Number(b.shouldReorder) - Number(a.shouldReorder) || (a.weeksOfCover ?? 1e9) - (b.weeksOfCover ?? 1e9));
    return { method: 'moving-average x seasonal index; safety stock z=1.65', asOf, weeks, data: opts.onlyReorder ? rows.filter((r) => r.shouldReorder) : rows };
  }
}
