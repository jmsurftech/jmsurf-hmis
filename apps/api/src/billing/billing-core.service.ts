import { Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { vatOf } from '../common/money';

export interface ChargeInput {
  tenantId: string;
  visitId: string;
  sourceType: 'ORDER' | 'PRESCRIPTION' | 'BED' | 'CONSULTATION' | 'MANUAL' | 'PACKAGE' | 'DISPENSE' | 'PROCEDURE';
  sourceId?: string;
  serviceItemId?: string;
  stockItemId?: string;
  description?: string;
  quantity?: number;
  unitPriceMinor?: number; // override; otherwise resolved from the visit payer's price list
}

/**
 * The single entry point every clinical module uses to post charges to a patient's bill.
 * Resolves price by payer price list → base price, opens the visit bill if needed, and recalculates totals.
 */
@Injectable()
export class BillingCoreService {
  constructor(private prisma: PrismaService, private seq: SequenceService) {}

  async getOrOpenBill(tenantId: string, visitId: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id: visitId, tenantId } });
    if (!visit) throw new NotFoundException('Visit not found');
    const open = await this.prisma.bill.findFirst({
      where: { tenantId, visitId, status: { in: ['OPEN', 'INTERIM', 'PARTIALLY_PAID'] } },
    });
    if (open) return open;
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return this.prisma.bill.create({
      data: {
        tenantId, facilityId: visit.facilityId, visitId, currency: tenant.currency,
        billNumber: await this.seq.next(tenantId, 'BILL', 'INV'),
      },
    });
  }

  async resolvePrice(tenantId: string, visitId: string, serviceItemId?: string, stockItemId?: string) {
    const visit = await this.prisma.visit.findFirstOrThrow({ where: { id: visitId, tenantId } });
    const priceList =
      (visit.schemeId && (await this.prisma.priceList.findFirst({ where: { tenantId, schemeId: visit.schemeId } }))) ||
      (await this.prisma.priceList.findFirst({ where: { tenantId, payerType: visit.payerType } })) ||
      (await this.prisma.priceList.findFirst({ where: { tenantId, isDefault: true } }));
    if (priceList) {
      const item = await this.prisma.priceListItem.findFirst({
        where: { priceListId: priceList.id, serviceItemId: serviceItemId ?? null, stockItemId: stockItemId ?? null },
      });
      if (item) return item.priceMinor;
    }
    if (serviceItemId) return (await this.prisma.serviceItem.findUniqueOrThrow({ where: { id: serviceItemId } })).basePriceMinor;
    if (stockItemId) return (await this.prisma.stockItem.findUniqueOrThrow({ where: { id: stockItemId } })).sellPriceMinor;
    return 0;
  }

  async charge(input: ChargeInput) {
    const bill = await this.getOrOpenBill(input.tenantId, input.visitId);
    const visit = await this.prisma.visit.findUniqueOrThrow({ where: { id: input.visitId } });
    const qty = input.quantity ?? 1;
    const unit = input.unitPriceMinor ?? (await this.resolvePrice(input.tenantId, input.visitId, input.serviceItemId, input.stockItemId));
    let description = input.description;
    let vatRate = 0;
    let shaCode: string | undefined;
    if (input.serviceItemId) {
      const s = await this.prisma.serviceItem.findUnique({ where: { id: input.serviceItemId } });
      description ??= s?.name;
      vatRate = s?.vatRate ?? 0;
      shaCode = s?.shaInterventionCode ?? undefined;
    } else if (input.stockItemId) {
      const s = await this.prisma.stockItem.findUnique({ where: { id: input.stockItemId } });
      description ??= s?.name;
      vatRate = s?.vatRate ?? 0;
    }
    const total = Math.round(unit * qty);
    const line = await this.prisma.billLine.create({
      data: {
        tenantId: input.tenantId, billId: bill.id, sourceType: input.sourceType, sourceId: input.sourceId,
        serviceItemId: input.serviceItemId, stockItemId: input.stockItemId, description: description ?? 'Charge',
        quantity: qty, unitPriceMinor: unit, totalMinor: total, vatMinor: vatOf(total, vatRate),
        payer: visit.payerType === 'CASH' ? 'PATIENT' : 'SCHEME', shaInterventionCode: shaCode,
      },
    });
    await this.recalculate(bill.id);
    return line;
  }

  async voidLine(tenantId: string, lineId: string) {
    const line = await this.prisma.billLine.update({ where: { id: lineId }, data: { voided: true } });
    await this.recalculate(line.billId);
    return line;
  }

  /** Recompute bill totals and the payer / patient split (scheme co-pay applied). */
  async recalculate(billId: string) {
    const bill = await this.prisma.bill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true, payments: true, visit: true } });
    const lines = bill.lines.filter((l) => !l.voided);
    const total = lines.reduce((a, l) => a + l.totalMinor, 0) - bill.discountMinor;
    let schemePortion = lines.filter((l) => l.payer === 'SCHEME').reduce((a, l) => a + l.totalMinor, 0);
    if (bill.visit.schemeId && schemePortion > 0) {
      const scheme = await this.prisma.scheme.findUnique({ where: { id: bill.visit.schemeId } });
      if (scheme?.copayPercent) schemePortion = Math.round(schemePortion * (1 - scheme.copayPercent / 100));
    }
    const paid = bill.payments.filter((p) => p.status === 'COMPLETED').reduce((a, p) => a + p.amountMinor, 0);
    const patientAmount = Math.max(total - schemePortion, 0);
    const status =
      bill.status === 'VOID' ? 'VOID'
      : patientAmount > 0 && paid >= patientAmount ? (bill.status === 'FINAL' ? 'PAID' : bill.status === 'OPEN' ? 'OPEN' : bill.status)
      : paid > 0 ? 'PARTIALLY_PAID' : bill.status;
    return this.prisma.bill.update({
      where: { id: billId },
      data: { totalMinor: total, payerAmountMinor: schemePortion, patientAmountMinor: patientAmount, paidMinor: paid, status: status as any },
    });
  }
}

@Global()
@Module({ providers: [BillingCoreService], exports: [BillingCoreService] })
export class BillingCoreModule {}
