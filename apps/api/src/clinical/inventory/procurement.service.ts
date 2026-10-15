import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { paginate, PageQueryDto } from '../shared/pagination';
import { resolveFacilityId } from '../shared/facility';
import { InventoryService } from './inventory.service';
import { applyReceipt, assertTransition, PoLine, PoStatus, poTotal } from './po-workflow';
import { CreatePoDto, PoQueryDto, ReceiveStockDto, SupplierDto, UpdatePoDto, UpdateSupplierDto } from './inventory.dto';

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService, private seq: SequenceService, private audit: AuditService, private inventory: InventoryService) {}

  // ── Suppliers ──
  createSupplier(user: AuthUser, dto: SupplierDto) { return this.prisma.supplier.create({ data: { ...dto, tenantId: user.tenantId } }); }
  listSuppliers(tenantId: string, q: PageQueryDto) {
    const where: Prisma.SupplierWhereInput = { tenantId, ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}) };
    return paginate(q, (skip, take) => this.prisma.supplier.findMany({ where, skip, take, orderBy: { name: 'asc' } }), () => this.prisma.supplier.count({ where }));
  }
  async updateSupplier(user: AuthUser, id: string, dto: UpdateSupplierDto) {
    if (!(await this.prisma.supplier.findFirst({ where: { id, tenantId: user.tenantId } }))) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  // ── Purchase orders ──
  private async po(tenantId: string, id: string) {
    const p = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Purchase order not found');
    return p;
  }
  private move(from: string, to: PoStatus) {
    try { assertTransition(from, to); } catch (e) { throw new BadRequestException(e.message); }
  }
  private async validateLines(tenantId: string, lines: PoLine[]) {
    const n = await this.prisma.stockItem.count({ where: { tenantId, id: { in: lines.map((l) => l.itemId) } } });
    if (n !== new Set(lines.map((l) => l.itemId)).size) throw new NotFoundException('One or more stock items not found');
  }

  async create(user: AuthUser, dto: CreatePoDto) {
    const t = user.tenantId;
    if (!(await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, tenantId: t } }))) throw new NotFoundException('Supplier not found');
    await this.validateLines(t, dto.lines);
    const facilityId = await resolveFacilityId(this.prisma, user, dto.facilityId);
    const lines = dto.lines.map((l) => ({ ...l, received: 0 }));
    return this.prisma.purchaseOrder.create({
      data: { tenantId: t, facilityId, supplierId: dto.supplierId, number: await this.seq.next(t, 'PO', 'LPO'), lines: lines as any, totalMinor: poTotal(lines), createdBy: user.sub },
    });
  }

  list(tenantId: string, q: PoQueryDto) {
    const where: Prisma.PurchaseOrderWhereInput = { tenantId, ...(q.status ? { status: q.status } : {}), ...(q.q ? { number: { contains: q.q, mode: 'insensitive' } } : {}) };
    return paginate(q, (skip, take) => this.prisma.purchaseOrder.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), () => this.prisma.purchaseOrder.count({ where }));
  }
  get(tenantId: string, id: string) { return this.po(tenantId, id); }

  async update(user: AuthUser, id: string, dto: UpdatePoDto) {
    const p = await this.po(user.tenantId, id);
    if (p.status !== 'DRAFT') throw new BadRequestException('Only DRAFT purchase orders can be edited');
    const data: Prisma.PurchaseOrderUpdateInput = {};
    if (dto.supplierId) data.supplierId = dto.supplierId;
    if (dto.lines) {
      await this.validateLines(user.tenantId, dto.lines);
      const lines = dto.lines.map((l) => ({ ...l, received: 0 }));
      data.lines = lines as any;
      data.totalMinor = poTotal(lines);
    }
    return this.prisma.purchaseOrder.update({ where: { id }, data });
  }

  private async decide(user: AuthUser, id: string, to: PoStatus, action: string, comment?: string) {
    const p = await this.po(user.tenantId, id);
    this.move(p.status, to);
    if (to === 'APPROVED' && p.createdBy === user.sub && !user.isSuperAdmin) throw new ForbiddenException('Segregation of duties: the creator cannot approve their own purchase order');
    const approvals = [...((p.approvals as any[]) ?? []), { action, by: user.sub, at: new Date().toISOString(), comment }];
    const r = await this.prisma.purchaseOrder.update({ where: { id }, data: { status: to, approvals } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: `PO_${action}`, entity: 'PurchaseOrder', entityId: id, data: { comment } });
    return r;
  }
  submit(user: AuthUser, id: string) { return this.decide(user, id, 'PENDING_APPROVAL', 'SUBMIT'); }
  approve(user: AuthUser, id: string, comment?: string) { return this.decide(user, id, 'APPROVED', 'APPROVE', comment); }
  reject(user: AuthUser, id: string, comment?: string) { return this.decide(user, id, 'DRAFT', 'REJECT', comment); }
  cancel(user: AuthUser, id: string, comment?: string) { return this.decide(user, id, 'CANCELLED', 'CANCEL', comment); }

  /** Goods received against a PO (partial receipts allowed). Creates batches and updates PO status. */
  async receive(user: AuthUser, id: string, dto: ReceiveStockDto) {
    const t = user.tenantId;
    const p = await this.po(t, id);
    await this.inventory.mustStore(t, dto.storeId);
    const agg = new Map<string, number>();
    for (const l of dto.lines) agg.set(l.itemId, (agg.get(l.itemId) ?? 0) + l.quantity);
    let next;
    try { next = applyReceipt(p.status, p.lines as unknown as PoLine[], [...agg].map(([itemId, quantity]) => ({ itemId, quantity }))); } catch (e) { throw new BadRequestException(e.message); }
    const poLines = p.lines as unknown as PoLine[];
    const lines = dto.lines.map((l) => ({ ...l, unitCostMinor: l.unitCostMinor ?? poLines.find((x) => x.itemId === l.itemId)?.unitCostMinor ?? 0 }));
    const batches = await this.inventory.receiveLines(t, user.sub, dto.storeId, lines, `${p.number}${dto.reference ? ' / ' + dto.reference : ''}`);
    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { lines: next.lines as any, status: next.status } });
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'GRN', entity: 'PurchaseOrder', entityId: id, data: { status: next.status } });
    return { purchaseOrder: updated, batches };
  }
}
