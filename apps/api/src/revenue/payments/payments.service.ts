import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { AuditService } from '../../common/audit.service';
import { BillingCoreService } from '../../billing/billing-core.service';
import { MOBILE_MONEY, MobileMoneyPort } from '../../integrations/ports';
import { withTenant } from '../../integrations/integration-context';
import { IntegrationHttpService } from '../../integrations/http-client';
import { c2bAccept, c2bReject, parseC2B, parseStkCallback } from '../../integrations/ke/mpesa/mpesa.util';
import { pageArgs, paged } from '../list-query';
import { settleSubscriptionStk } from '../../platform/subscription.service';
import { PaymentListQuery, ReceiptDto, RefundDto, StkDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');
  constructor(
    private prisma: PrismaService, private seq: SequenceService, private audit: AuditService, private core: BillingCoreService,
    private http: IntegrationHttpService, @Inject(MOBILE_MONEY) private mobileMoney: MobileMoneyPort,
  ) {}

  private async bill(tenantId: string, billId: string) {
    const b = await this.prisma.bill.findFirst({ where: { id: billId, tenantId } });
    if (!b) throw new NotFoundException('Bill not found');
    if (b.status === 'VOID') throw new BadRequestException('Bill is void');
    return b;
  }
  private openShift(tenantId: string, userId: string) {
    return this.prisma.cashierShift.findFirst({ where: { tenantId, userId, closedAt: null }, orderBy: { openedAt: 'desc' } });
  }

  async list(tenantId: string, q: PaymentListQuery) {
    const where: any = { tenantId };
    for (const k of ['billId', 'method', 'status', 'shiftId'] as const) if (q[k]) where[k] = q[k];
    if (q.q) where.OR = [{ receiptNumber: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }];
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.payment.count({ where }),
    ]);
    return paged(data, total, q);
  }
  async get(tenantId: string, id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  /** Counter receipt: cash / card / bank / cheque (or a manually keyed M-Pesa code). */
  async receipt(tenantId: string, userId: string, dto: ReceiptDto) {
    const bill = await this.bill(tenantId, dto.billId);
    const shift = await this.openShift(tenantId, userId);
    if (dto.method === 'CASH' && !shift) throw new BadRequestException('Open a cashier shift before receiving cash');
    if (dto.method !== 'CASH' && !dto.reference) throw new BadRequestException('reference is required for non-cash receipts');
    if (dto.reference && (await this.prisma.payment.findFirst({ where: { tenantId, reference: dto.reference, method: dto.method, status: 'COMPLETED' } })))
      throw new BadRequestException(`Reference ${dto.reference} already receipted`);
    const p = await this.prisma.payment.create({
      data: {
        tenantId, billId: bill.id, receiptNumber: await this.seq.next(tenantId, 'RECEIPT', 'RCT'), method: dto.method,
        amountMinor: dto.amountMinor, currency: bill.currency, reference: dto.reference, phone: dto.phone, status: 'COMPLETED',
        cashierId: userId, shiftId: shift?.id,
      },
    });
    await this.core.recalculate(bill.id);
    await this.audit.log({ tenantId, userId, action: 'RECEIPT', entity: 'Payment', entityId: p.id, data: { amountMinor: p.amountMinor, method: p.method } });
    return p;
  }

  async initiateStk(tenantId: string, userId: string, dto: StkDto) {
    const bill = await this.bill(tenantId, dto.billId);
    const amount = dto.amountMinor ?? Math.max(bill.patientAmountMinor - bill.paidMinor, 0);
    if (amount < 100) throw new BadRequestException('Nothing to pay on this bill');
    const shift = await this.openShift(tenantId, userId);
    const res = await withTenant(tenantId, () => this.mobileMoney.stkPush({ phone: dto.phone, amountMinor: amount, accountRef: bill.billNumber, description: 'Hospital bill' }));
    return this.prisma.payment.create({
      data: {
        tenantId, billId: bill.id, receiptNumber: await this.seq.next(tenantId, 'RECEIPT', 'RCT'), method: 'MPESA', amountMinor: Math.ceil(amount / 100) * 100,
        currency: bill.currency, reference: res.checkoutRequestId, status: 'PENDING', phone: dto.phone, cashierId: userId, shiftId: shift?.id,
        providerData: { checkoutRequestId: res.checkoutRequestId, initiate: res.raw as any },
      },
    });
  }

  /** Public Daraja STK result callback. Idempotent: only PENDING payments are updated. */
  async handleStkCallback(payload: any) {
    let cb;
    try { cb = parseStkCallback(payload); } catch (e: any) {
      await this.http.logInbound('mpesa', 'stk.callback.invalid', payload);
      return { ResultCode: 0, ResultDesc: 'Ignored' };
    }
    const payment = await this.prisma.payment.findFirst({ where: { method: 'MPESA', reference: cb.checkoutRequestId } });
    await this.http.logInbound('mpesa', 'stk.callback', payload, payment?.tenantId, cb.checkoutRequestId);
    if (!payment && (await settleSubscriptionStk(this.prisma, cb))) return { ResultCode: 0, ResultDesc: 'Accepted' };
    if (!payment) { this.log.warn(`STK callback for unknown CheckoutRequestID ${cb.checkoutRequestId}`); return { ResultCode: 0, ResultDesc: 'Accepted' }; }
    if (payment.status !== 'PENDING') return { ResultCode: 0, ResultDesc: 'Already processed' };
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: cb.success
        ? { status: 'COMPLETED', reference: cb.mpesaReceiptNumber ?? payment.reference, amountMinor: cb.amountMinor ?? payment.amountMinor,
            providerData: { ...((payment.providerData as any) ?? {}), callback: payload } }
        : { status: 'FAILED', providerData: { ...((payment.providerData as any) ?? {}), callback: payload, failure: cb.resultDesc } },
    });
    if (payment.billId) await this.core.recalculate(payment.billId);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  private tenantForShortcode(shortCode: string) {
    return this.prisma.tenant.findFirst({ where: { settings: { path: ['mpesaShortcode'], equals: shortCode } } });
  }

  /** C2B validation: accept only if BillRefNumber matches an open bill for the paybill's tenant. */
  async c2bValidate(payload: any) {
    try {
      const n = parseC2B(payload);
      const tenant = await this.tenantForShortcode(n.shortCode);
      if (!tenant) return c2bAccept(); // unknown mapping: accept, reconcile manually from confirmation
      const bill = await this.prisma.bill.findFirst({ where: { tenantId: tenant.id, billNumber: n.billRef, status: { not: 'VOID' } } });
      return bill ? c2bAccept() : c2bReject('C2B00012', 'Invalid account number');
    } catch { return c2bReject('C2B00016', 'Invalid request'); }
  }

  /** C2B confirmation: record payment and match it to the bill by BillRefNumber; unmatched payments are kept unallocated. */
  async c2bConfirm(payload: any) {
    let n;
    try { n = parseC2B(payload); } catch { return { ResultCode: 0, ResultDesc: 'Ignored' }; }
    const tenant = await this.tenantForShortcode(n.shortCode);
    await this.http.logInbound('mpesa', 'c2b.confirmation', payload, tenant?.id, n.transId);
    if (!tenant) return { ResultCode: 0, ResultDesc: 'Accepted' };
    if (await this.prisma.payment.findFirst({ where: { tenantId: tenant.id, reference: n.transId } })) return { ResultCode: 0, ResultDesc: 'Duplicate' };
    const bill = await this.prisma.bill.findFirst({ where: { tenantId: tenant.id, billNumber: n.billRef, status: { not: 'VOID' } } });
    await this.prisma.payment.create({
      data: {
        tenantId: tenant.id, billId: bill?.id, receiptNumber: await this.seq.next(tenant.id, 'RECEIPT', 'RCT'), method: 'MPESA',
        amountMinor: n.amountMinor, currency: tenant.currency, reference: n.transId, status: 'COMPLETED', phone: n.msisdn,
        providerData: { c2b: payload, unallocated: !bill },
      },
    });
    if (bill) await this.core.recalculate(bill.id);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  /** Refund (full or partial) as a negative COMPLETED payment linked to the original. */
  async refund(tenantId: string, userId: string, paymentId: string, dto: RefundDto) {
    const p = await this.get(tenantId, paymentId);
    if (p.status !== 'COMPLETED' || p.amountMinor <= 0) throw new BadRequestException('Only completed receipts can be refunded');
    const prior = await this.prisma.payment.findMany({ where: { tenantId, status: 'COMPLETED', amountMinor: { lt: 0 }, providerData: { path: ['refundOf'], equals: p.id } } });
    const refunded = -prior.reduce((a, r) => a + r.amountMinor, 0);
    const amount = dto.amountMinor ?? p.amountMinor - refunded;
    if (amount <= 0 || amount + refunded > p.amountMinor) throw new BadRequestException('Refund exceeds amount paid');
    const shift = await this.openShift(tenantId, userId);
    const r = await this.prisma.payment.create({
      data: {
        tenantId, billId: p.billId, receiptNumber: await this.seq.next(tenantId, 'REFUND', 'RFD'), method: p.method, amountMinor: -amount,
        currency: p.currency, reference: p.reference ? `REFUND:${p.reference}` : undefined, status: 'COMPLETED', cashierId: userId, shiftId: shift?.id,
        providerData: { refundOf: p.id, reason: dto.reason },
      },
    });
    if (amount + refunded === p.amountMinor) {
      // mark the original as refunded but keep the ledger balanced: original + refunds net to zero
      await this.prisma.payment.update({ where: { id: p.id }, data: { providerData: { ...((p.providerData as any) ?? {}), fullyRefunded: true } } });
    }
    if (p.billId) {
      const bill = await this.prisma.bill.findUnique({ where: { id: p.billId } });
      if (bill?.status === 'PAID') await this.prisma.bill.update({ where: { id: bill.id }, data: { status: 'FINAL' } });
      await this.core.recalculate(p.billId);
    }
    await this.audit.log({ tenantId, userId, action: 'REFUND', entity: 'Payment', entityId: p.id, data: { amountMinor: amount, reason: dto.reason, refundId: r.id } });
    return r;
  }

  // ── cashier shifts
  async openShiftFor(tenantId: string, userId: string, openingFloat = 0) {
    if (await this.openShift(tenantId, userId)) throw new BadRequestException('You already have an open shift');
    return this.prisma.cashierShift.create({ data: { tenantId, userId, openingFloat } });
  }
  async currentShift(tenantId: string, userId: string) {
    const s = await this.openShift(tenantId, userId);
    return s ? { ...s, ...(await this.shiftTotals(s.id, s.openingFloat)) } : null;
  }
  private async shiftTotals(shiftId: string, openingFloat: number) {
    const pays = await this.prisma.payment.findMany({ where: { shiftId, status: 'COMPLETED' } });
    const byMethod: Record<string, number> = {};
    for (const p of pays) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountMinor;
    return { byMethod, expectedCash: openingFloat + (byMethod.CASH ?? 0), receiptCount: pays.length };
  }
  async closeShift(tenantId: string, userId: string, shiftId: string, declaredCash: number, note?: string, isManager = false) {
    const s = await this.prisma.cashierShift.findFirst({ where: { id: shiftId, tenantId } });
    if (!s) throw new NotFoundException('Shift not found');
    if (s.closedAt) throw new BadRequestException('Shift already closed');
    if (s.userId !== userId && !isManager) throw new BadRequestException('Only the shift owner or a manager can close this shift');
    const t = await this.shiftTotals(s.id, s.openingFloat);
    const closed = await this.prisma.cashierShift.update({ where: { id: s.id }, data: { closedAt: new Date(), declaredCash, expectedCash: t.expectedCash } });
    const variance = declaredCash - t.expectedCash;
    await this.audit.log({ tenantId, userId, action: 'SHIFT_CLOSE', entity: 'CashierShift', entityId: s.id, data: { declaredCash, expectedCash: t.expectedCash, variance, note } });
    return { ...closed, ...t, variance };
  }
  async listShifts(tenantId: string, q: { page?: number; pageSize?: number; userId?: string }) {
    const where: any = { tenantId };
    if (q.userId) where.userId = q.userId;
    const qq = { page: q.page ?? 1, pageSize: q.pageSize ?? 25 };
    const [data, total] = await Promise.all([
      this.prisma.cashierShift.findMany({ where, orderBy: { openedAt: 'desc' }, ...pageArgs(qq) }),
      this.prisma.cashierShift.count({ where }),
    ]);
    return paged(data.map((s) => ({ ...s, variance: s.declaredCash != null && s.expectedCash != null ? s.declaredCash - s.expectedCash : null })), total, qq);
  }
}
