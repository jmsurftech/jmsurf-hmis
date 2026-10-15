import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingCoreService } from '../../billing/billing-core.service';
import { AuditService } from '../../common/audit.service';
import { FISCAL_INVOICE, FiscalInvoicePort } from '../../integrations/ports';
import { withTenant } from '../../integrations/integration-context';
import { ListQuery, pageArgs, paged } from '../list-query';
import { BillListQuery, DiscountDto, FinalizeDto, ManualLineDto } from './billing.dto';

const BILL_INCLUDE = { lines: { orderBy: { createdAt: 'asc' as const } }, payments: { orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class BillingService {
  private log = new Logger('Billing');
  constructor(
    private prisma: PrismaService, private core: BillingCoreService, private audit: AuditService,
    @Inject(FISCAL_INVOICE) private fiscal: FiscalInvoicePort,
  ) {}

  async list(tenantId: string, q: BillListQuery) {
    const where: any = { tenantId };
    if (q.status) where.status = q.status;
    if (q.visitId) where.visitId = q.visitId;
    if (q.q) where.OR = [
      { billNumber: { contains: q.q, mode: 'insensitive' } },
      { visit: { patient: { OR: [{ lastName: { contains: q.q, mode: 'insensitive' } }, { firstName: { contains: q.q, mode: 'insensitive' } }, { mrn: q.q }] } } },
    ];
    const [data, total] = await Promise.all([
      this.prisma.bill.findMany({
        where, orderBy: { createdAt: 'desc' }, ...pageArgs(q as ListQuery),
        include: { visit: { select: { visitNumber: true, payerType: true, patient: { select: { id: true, mrn: true, firstName: true, lastName: true } } } } },
      }),
      this.prisma.bill.count({ where }),
    ]);
    return paged(data, total, q);
  }

  async get(tenantId: string, id: string) {
    const b = await this.prisma.bill.findFirst({ where: { id, tenantId }, include: BILL_INCLUDE });
    if (!b) throw new NotFoundException('Bill not found');
    return b;
  }

  async forVisit(tenantId: string, visitId: string) {
    const existing = await this.prisma.bill.findFirst({ where: { tenantId, visitId, status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' } });
    const bill = existing ?? (await this.core.getOrOpenBill(tenantId, visitId));
    return this.get(tenantId, bill.id);
  }

  private assertEditable(b: { status: string }) {
    if (['FINAL', 'PAID', 'VOID'].includes(b.status)) throw new BadRequestException(`Bill is ${b.status}; it can no longer be changed`);
  }

  async addManualLine(tenantId: string, userId: string, billId: string, dto: ManualLineDto) {
    const bill = await this.get(tenantId, billId);
    this.assertEditable(bill);
    if (!dto.serviceItemId && (!dto.description || dto.unitPriceMinor == null)) throw new BadRequestException('Provide serviceItemId, or description + unitPriceMinor');
    if (dto.serviceItemId && !(await this.prisma.serviceItem.findFirst({ where: { id: dto.serviceItemId, tenantId } }))) throw new NotFoundException('Service item not found');
    const line = await this.core.charge({ tenantId, visitId: bill.visitId, sourceType: 'MANUAL', ...dto });
    await this.audit.log({ tenantId, userId, action: 'CREATE', entity: 'BillLine', entityId: line.id, data: dto });
    return line;
  }

  async voidLine(tenantId: string, userId: string, lineId: string, reason: string) {
    const line = await this.prisma.billLine.findFirst({ where: { id: lineId, tenantId }, include: { bill: true } });
    if (!line) throw new NotFoundException('Bill line not found');
    if (line.voided) throw new BadRequestException('Line already voided');
    this.assertEditable(line.bill);
    const res = await this.core.voidLine(tenantId, lineId);
    await this.audit.log({ tenantId, userId, action: 'VOID', entity: 'BillLine', entityId: lineId, data: { reason, totalMinor: line.totalMinor } });
    return res;
  }

  async discount(tenantId: string, userId: string, billId: string, dto: DiscountDto) {
    const bill = await this.get(tenantId, billId);
    this.assertEditable(bill);
    const gross = bill.lines.filter((l) => !l.voided).reduce((a, l) => a + l.totalMinor, 0);
    const amount = dto.amountMinor ?? (dto.percent != null ? Math.round((gross * dto.percent) / 100) : undefined);
    if (amount == null) throw new BadRequestException('amountMinor or percent required');
    const newDiscount = dto.type === 'WAIVER' ? amount : bill.discountMinor + amount;
    if (newDiscount > gross) throw new BadRequestException('Discount exceeds bill total');
    await this.prisma.bill.update({ where: { id: billId }, data: { discountMinor: newDiscount } });
    await this.audit.log({ tenantId, userId, action: dto.type, entity: 'Bill', entityId: billId, data: { amountMinor: amount, reason: dto.reason, newDiscount } });
    await this.core.recalculate(billId);
    return this.get(tenantId, billId);
  }

  async finalize(tenantId: string, userId: string, billId: string, dto: FinalizeDto) {
    const bill = await this.get(tenantId, billId);
    this.assertEditable(bill);
    await this.prisma.bill.update({ where: { id: billId }, data: { status: dto.type } });
    await this.core.recalculate(billId);
    let fiscal: { signed: boolean; error?: string } | undefined;
    if (dto.type === 'FINAL' && !bill.etimsInvoiceNo) fiscal = await this.signFiscal(tenantId, billId, dto.buyerPin);
    await this.audit.log({ tenantId, userId, action: `FINALIZE_${dto.type}`, entity: 'Bill', entityId: billId, data: { fiscal } });
    return { ...(await this.get(tenantId, billId)), fiscal };
  }

  /** Sign the final invoice with the tenant's tax authority (KRA eTIMS in KE). Failure does not block finalisation; it can be retried. */
  async signFiscal(tenantId: string, billId: string, buyerPin?: string) {
    const bill = await this.get(tenantId, billId);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const serviceIds = bill.lines.map((l) => l.serviceItemId).filter(Boolean) as string[];
    const stockIds = bill.lines.map((l) => l.stockItemId).filter(Boolean) as string[];
    const [services, stock] = await Promise.all([
      this.prisma.serviceItem.findMany({ where: { id: { in: serviceIds } } }),
      this.prisma.stockItem.findMany({ where: { id: { in: stockIds } } }),
    ]);
    const meta = (l: (typeof bill.lines)[number]) => {
      const s = services.find((x) => x.id === l.serviceItemId);
      const st = stock.find((x) => x.id === l.stockItemId) as any;
      return { code: s?.etimsItemCode ?? s?.code ?? st?.code ?? undefined, vatRate: s?.vatRate ?? st?.vatRate ?? 0 };
    };
    try {
      const res = await withTenant(tenantId, () => this.fiscal.signInvoice({
        invoiceNumber: bill.billNumber, buyerPin,
        lines: bill.lines.filter((l) => !l.voided).map((l) => ({ ...meta(l), description: l.description, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor })),
        totalMinor: bill.totalMinor,
      }), tenant.countryCode);
      if (res.signed) await this.prisma.bill.update({ where: { id: billId }, data: { etimsInvoiceNo: res.receiptNo, etimsQr: res.qr } });
      return { signed: res.signed, receiptNo: res.receiptNo };
    } catch (e: any) {
      this.log.warn(`Fiscal signing failed for ${bill.billNumber}: ${e?.message}`);
      return { signed: false, error: e?.message ?? String(e) };
    }
  }

  async printData(tenantId: string, billId: string) {
    const bill = await this.get(tenantId, billId);
    const [tenant, facility, visit] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.prisma.facility.findFirst({ where: { id: bill.facilityId, tenantId } }),
      this.prisma.visit.findFirstOrThrow({ where: { id: bill.visitId, tenantId }, include: { patient: true } }),
    ]);
    const lines = bill.lines.filter((l) => !l.voided);
    return {
      header: { tenantName: tenant.name, logoUrl: tenant.logoUrl, kraPin: tenant.kraPin, facility: facility && { name: facility.name, kmhflCode: facility.kmhflCode } },
      document: { type: bill.status === 'FINAL' || bill.status === 'PAID' ? 'FINAL INVOICE' : 'INTERIM INVOICE', number: bill.billNumber, date: bill.updatedAt, currency: bill.currency },
      patient: { name: [visit.patient.firstName, visit.patient.middleName, visit.patient.lastName].filter(Boolean).join(' '), mrn: visit.patient.mrn, visitNumber: visit.visitNumber, payerType: visit.payerType },
      lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, totalMinor: l.totalMinor, vatMinor: l.vatMinor, payer: l.payer })),
      totals: {
        grossMinor: lines.reduce((a, l) => a + l.totalMinor, 0), discountMinor: bill.discountMinor, totalMinor: bill.totalMinor,
        vatMinor: lines.reduce((a, l) => a + l.vatMinor, 0), payerAmountMinor: bill.payerAmountMinor, patientAmountMinor: bill.patientAmountMinor,
        paidMinor: bill.paidMinor, balanceMinor: Math.max(bill.patientAmountMinor - bill.paidMinor, 0),
      },
      payments: bill.payments.filter((p) => p.status === 'COMPLETED').map((p) => ({ receiptNumber: p.receiptNumber, method: p.method, amountMinor: p.amountMinor, reference: p.reference, at: p.createdAt })),
      fiscal: { invoiceNo: bill.etimsInvoiceNo, qr: bill.etimsQr },
    };
  }
}
