import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth-user';
import { hashApiKey, newApiKey } from '../common/api-keys';
import { canTransition, eligibleForAdvance, receivablesSummary } from './receivables';

const CLAIM_SELECT = { id: true, payerId: true, status: true, approvedMinor: true, paidMinor: true, decidedAt: true, submittedAt: true, createdAt: true } as const;

@Injectable()
export class FinancingService {
  constructor(private prisma: PrismaService, private seq: SequenceService, private audit: AuditService) {}

  private async data(tenantId: string) {
    const [claims, payers] = await Promise.all([
      this.prisma.claim.findMany({ where: { tenantId, status: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'] } }, select: CLAIM_SELECT }),
      this.prisma.payer.findMany({ where: { tenantId }, select: { id: true, name: true, type: true } }),
    ]);
    return { claims, payers: Object.fromEntries(payers.map((p) => [p.id, { name: p.name, type: p.type }])) };
  }

  async receivables(tenantId: string) {
    const { claims, payers } = await this.data(tenantId);
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } });
    return { currency: t.currency, ...receivablesSummary(claims, payers), shaAdvance: eligibleForAdvance(claims, payers, { payerType: 'SHA' }) };
  }

  // ───────── tenant: financing requests ─────────
  listRequests(tenantId: string) {
    return this.prisma.financingRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async createRequest(user: AuthUser, dto: { requestedMinor: number; partnerId?: string; payerType?: string; notes?: string }) {
    const { claims, payers } = await this.data(user.tenantId);
    const e = eligibleForAdvance(claims, payers, { payerType: dto.payerType ?? 'SHA' });
    if (!e.receivablesMinor) throw new BadRequestException('No eligible approved-unpaid receivables to finance');
    if (dto.requestedMinor > e.maxAdvanceMinor) throw new BadRequestException(`Requested amount exceeds the maximum advance (${e.maxAdvanceMinor} minor units, 80% of eligible receivables)`);
    if (dto.partnerId) await this.assertConsent(user.tenantId, dto.partnerId);
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { currency: true } });
    const r = await this.prisma.financingRequest.create({ data: {
      tenantId: user.tenantId, requestNumber: await this.seq.next(user.tenantId, 'FINANCING', 'FIN'), partnerId: dto.partnerId, receivablesMinor: e.receivablesMinor,
      requestedMinor: dto.requestedMinor, currency: t.currency, claimIds: e.claimIds, notes: dto.notes, requestedBy: user.sub,
      history: [{ at: new Date().toISOString(), status: 'REQUESTED', by: user.sub }],
    } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'CREATE', entity: 'FinancingRequest', entityId: r.id, data: { requestedMinor: dto.requestedMinor } });
    return r;
  }

  async tenantTransition(user: AuthUser, id: string, to: 'ACCEPTED' | 'CANCELLED') {
    const r = await this.prisma.financingRequest.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!r) throw new NotFoundException('Financing request not found');
    return this.transition(r, to, `user:${user.sub}`, {});
  }

  private async transition(r: { id: string; status: string; history: unknown }, to: string, by: string, extra: { offeredMinor?: number; feeMinor?: number; partnerNote?: string }) {
    if (!canTransition(r.status, to)) throw new BadRequestException(`Cannot move from ${r.status} to ${to}`);
    const history = [...((r.history as any[]) ?? []), { at: new Date().toISOString(), status: to, by, ...(extra.partnerNote ? { note: extra.partnerNote } : {}) }];
    return this.prisma.financingRequest.update({ where: { id: r.id }, data: { status: to, history, ...extra } });
  }

  // ───────── tenant: partners & consent ─────────
  async partners(tenantId: string) {
    const [partners, consents] = await Promise.all([
      this.prisma.financePartner.findMany({ where: { active: true }, select: { id: true, name: true, keyPrefix: true } }),
      this.prisma.financeConsent.findMany({ where: { tenantId } }),
    ]);
    return partners.map((p) => { const c = consents.find((x) => x.partnerId === p.id && !x.revokedAt); return { ...p, consented: !!c, scopes: c?.scopes ?? [], grantedAt: c?.grantedAt }; });
  }

  async grantConsent(user: AuthUser, partnerId: string, scopes?: string[]) {
    const allowed = ['receivables:read', 'financing:read', 'financing:decide'];
    const s = (scopes?.length ? scopes : ['receivables:read', 'financing:read', 'financing:decide']).filter((x) => allowed.includes(x));
    const c = await this.prisma.financeConsent.upsert({
      where: { tenantId_partnerId: { tenantId: user.tenantId, partnerId } },
      create: { tenantId: user.tenantId, partnerId, scopes: s, grantedBy: user.sub },
      update: { scopes: s, grantedBy: user.sub, grantedAt: new Date(), revokedAt: null },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'GRANT_CONSENT', entity: 'FinancePartner', entityId: partnerId, data: { scopes: s } });
    return c;
  }

  async revokeConsent(user: AuthUser, partnerId: string) {
    await this.prisma.financeConsent.updateMany({ where: { tenantId: user.tenantId, partnerId }, data: { revokedAt: new Date() } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'REVOKE_CONSENT', entity: 'FinancePartner', entityId: partnerId });
    return { ok: true };
  }

  async createPartner(user: AuthUser, name: string) {
    if (!user.isSuperAdmin) throw new ForbiddenException('Only platform super-admins can register finance partners');
    const k = newApiKey('jmp');
    const p = await this.prisma.financePartner.create({ data: { name, apiKeyHash: k.hash, keyPrefix: k.keyPrefix } });
    return { id: p.id, name: p.name, apiKey: k.key, note: 'Give this key to the partner now; it is not shown again.' };
  }

  // ───────── partner API (X-Partner-Key) ─────────
  async partnerFromKey(key?: string) {
    if (!key) throw new UnauthorizedException('X-Partner-Key header required');
    const p = await this.prisma.financePartner.findUnique({ where: { apiKeyHash: hashApiKey(key) } });
    if (!p || !p.active) throw new UnauthorizedException('Unknown or inactive partner key');
    return p;
  }

  private async assertConsent(tenantId: string, partnerId: string, scope?: string) {
    const c = await this.prisma.financeConsent.findUnique({ where: { tenantId_partnerId: { tenantId, partnerId } } });
    if (!c || c.revokedAt) throw new ForbiddenException('Tenant has not granted consent to this partner');
    if (scope && !c.scopes.includes(scope)) throw new ForbiddenException(`Consent does not include scope ${scope}`);
  }

  async partnerTenants(key?: string) {
    const p = await this.partnerFromKey(key);
    const consents = await this.prisma.financeConsent.findMany({ where: { partnerId: p.id, revokedAt: null } });
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: consents.map((c) => c.tenantId) } }, select: { id: true, name: true, countryCode: true, currency: true } });
    return tenants.map((t) => ({ ...t, scopes: consents.find((c) => c.tenantId === t.id)?.scopes ?? [] }));
  }

  async partnerReceivables(key: string | undefined, tenantId: string) {
    const p = await this.partnerFromKey(key);
    await this.assertConsent(tenantId, p.id, 'receivables:read');
    return this.receivables(tenantId);
  }

  async partnerRequests(key: string | undefined, tenantId: string) {
    const p = await this.partnerFromKey(key);
    await this.assertConsent(tenantId, p.id, 'financing:read');
    return this.prisma.financingRequest.findMany({ where: { tenantId, OR: [{ partnerId: p.id }, { partnerId: null }] }, orderBy: { createdAt: 'desc' },
      select: { id: true, requestNumber: true, status: true, receivablesMinor: true, requestedMinor: true, offeredMinor: true, feeMinor: true, currency: true, createdAt: true, updatedAt: true, history: true } });
  }

  async partnerDecide(key: string | undefined, id: string, dto: { status: string; offeredMinor?: number; feeMinor?: number; note?: string }) {
    const p = await this.partnerFromKey(key);
    const r = await this.prisma.financingRequest.findUnique({ where: { id } });
    if (!r || (r.partnerId && r.partnerId !== p.id)) throw new NotFoundException('Financing request not found');
    await this.assertConsent(r.tenantId, p.id, 'financing:decide');
    if (!['UNDER_REVIEW', 'OFFERED', 'DECLINED', 'DISBURSED', 'REPAID'].includes(dto.status)) throw new BadRequestException('Partners may set UNDER_REVIEW, OFFERED, DECLINED, DISBURSED or REPAID');
    if (dto.status === 'OFFERED' && !dto.offeredMinor) throw new BadRequestException('offeredMinor is required for an offer');
    if (!r.partnerId) await this.prisma.financingRequest.update({ where: { id }, data: { partnerId: p.id } });
    return this.transition(r, dto.status, `partner:${p.id}`, { offeredMinor: dto.offeredMinor, feeMinor: dto.feeMinor, partnerNote: dto.note });
  }
}
