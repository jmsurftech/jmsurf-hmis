import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { paginate, PageQueryDto } from '../shared/pagination';
import { resolveFacilityId } from '../shared/facility';
import { fefoPick } from '../pharmacy/fefo';
import { AdjustmentDto, ExpiryQueryDto, ItemQueryDto, LevelsQueryDto, MovementQueryDto, ReceiveStockDto, StockItemDto, StoreDto, TransferDto, UpdateStockItemDto } from './inventory.dto';

export interface IssueResult { batchId: string; batchNo: string; expiryDate: Date | null; quantity: number; unitCostMinor: number }

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ── Stores ──
  async createStore(user: AuthUser, dto: StoreDto) {
    const facilityId = await resolveFacilityId(this.prisma, user, dto.facilityId);
    return this.prisma.store.create({ data: { tenantId: user.tenantId, facilityId, name: dto.name, type: dto.type ?? 'MAIN' } });
  }
  listStores(tenantId: string) { return this.prisma.store.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }); }
  async mustStore(tenantId: string, id: string) {
    const s = await this.prisma.store.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Store not found');
    return s;
  }
  /** Find the pharmacy store for a facility (first PHARMACY store). */
  async pharmacyStore(tenantId: string, facilityId?: string) {
    const s = await this.prisma.store.findFirst({ where: { tenantId, type: 'PHARMACY', ...(facilityId ? { facilityId } : {}) } })
      ?? await this.prisma.store.findFirst({ where: { tenantId, type: 'PHARMACY' } });
    if (!s) throw new BadRequestException('No PHARMACY store configured');
    return s;
  }

  // ── Items ──
  async createItem(user: AuthUser, dto: StockItemDto) {
    if (await this.prisma.stockItem.findFirst({ where: { tenantId: user.tenantId, code: dto.code } })) throw new ConflictException('Item code already exists');
    return this.prisma.stockItem.create({ data: { ...dto, tenantId: user.tenantId } });
  }
  listItems(tenantId: string, q: ItemQueryDto) {
    const where: Prisma.StockItemWhereInput = {
      tenantId, ...(q.category ? { category: q.category } : {}), ...(q.barcode ? { barcode: q.barcode } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { genericName: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }, { barcode: q.q }] } : {}),
    };
    return paginate(q, (skip, take) => this.prisma.stockItem.findMany({ where, skip, take, orderBy: { name: 'asc' } }), () => this.prisma.stockItem.count({ where }));
  }
  async getItem(tenantId: string, id: string) {
    const i = await this.prisma.stockItem.findFirst({ where: { id, tenantId }, include: { batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: 'asc' } } } });
    if (!i) throw new NotFoundException('Stock item not found');
    return i;
  }
  async updateItem(user: AuthUser, id: string, dto: UpdateStockItemDto) {
    await this.getItem(user.tenantId, id);
    return this.prisma.stockItem.update({ where: { id }, data: dto });
  }
  async deactivateItem(user: AuthUser, id: string) {
    await this.getItem(user.tenantId, id);
    return this.prisma.stockItem.update({ where: { id }, data: { active: false } });
  }

  // ── Movements ──
  /** Receive stock into a store as new batches (GRN). Returns created batches. */
  async receiveLines(tenantId: string, userId: string, storeId: string, lines: ReceiveStockDto['lines'], reference: string) {
    const items = await this.prisma.stockItem.findMany({ where: { tenantId, id: { in: lines.map((l) => l.itemId) } } });
    if (items.length !== new Set(lines.map((l) => l.itemId)).size) throw new NotFoundException('One or more stock items not found');
    return this.prisma.$transaction(async (tx) => {
      const out = [];
      for (const l of lines) {
        if (l.expiryDate && new Date(l.expiryDate) <= new Date()) throw new BadRequestException(`Batch ${l.batchNo} is already expired`);
        const batch = await tx.stockBatch.create({
          data: { tenantId, itemId: l.itemId, storeId, batchNo: l.batchNo, expiryDate: l.expiryDate ? new Date(l.expiryDate) : null, quantity: l.quantity, unitCostMinor: l.unitCostMinor ?? 0 },
        });
        await tx.stockMovement.create({ data: { tenantId, itemId: l.itemId, batchId: batch.id, toStoreId: storeId, type: 'RECEIPT', quantity: l.quantity, reference, userId } });
        out.push(batch);
      }
      return out;
    });
  }

  async receive(user: AuthUser, dto: ReceiveStockDto) {
    await this.mustStore(user.tenantId, dto.storeId);
    if (dto.purchaseOrderId) throw new BadRequestException('Use POST /procurement/purchase-orders/:id/receive to receive against a PO');
    const batches = await this.receiveLines(user.tenantId, user.sub, dto.storeId, dto.lines, dto.reference ?? 'GRN');
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'GRN', entity: 'Store', entityId: dto.storeId, data: { lines: dto.lines.length, reference: dto.reference } });
    return { batches };
  }

  /**
   * Issue stock out of a store using FEFO (or a specific batch). Decrements batches atomically
   * and writes StockMovements. Used by dispensing, theatre consumables, transfers.
   */
  async issue(args: { tenantId: string; userId?: string; itemId: string; storeId: string; quantity: number; type: string; reference?: string; toStoreId?: string; batchId?: string }, txIn?: Prisma.TransactionClient): Promise<IssueResult[]> {
    const run = async (tx: Prisma.TransactionClient) => {
      const batches = await tx.stockBatch.findMany({ where: { tenantId: args.tenantId, itemId: args.itemId, storeId: args.storeId, quantity: { gt: 0 }, ...(args.batchId ? { id: args.batchId } : {}) } });
      let picks;
      try { picks = fefoPick(batches, args.quantity); } catch (e) {
        const item = await tx.stockItem.findUnique({ where: { id: args.itemId } });
        throw new BadRequestException(`${item?.name ?? 'Item'}: ${e.message}`);
      }
      const out: IssueResult[] = [];
      for (const p of picks) {
        const r = await tx.stockBatch.updateMany({ where: { id: p.batch.id, quantity: { gte: p.take } }, data: { quantity: { decrement: p.take } } });
        if (!r.count) throw new ConflictException('Stock changed concurrently; retry');
        await tx.stockMovement.create({ data: { tenantId: args.tenantId, itemId: args.itemId, batchId: p.batch.id, fromStoreId: args.storeId, toStoreId: args.toStoreId, type: args.type, quantity: p.take, reference: args.reference, userId: args.userId } });
        out.push({ batchId: p.batch.id, batchNo: p.batch.batchNo, expiryDate: p.batch.expiryDate, quantity: p.take, unitCostMinor: p.batch.unitCostMinor });
      }
      return out;
    };
    return txIn ? run(txIn) : this.prisma.$transaction(run);
  }

  async transfer(user: AuthUser, dto: TransferDto) {
    const t = user.tenantId;
    if (dto.fromStoreId === dto.toStoreId) throw new BadRequestException('Source and destination stores must differ');
    await this.mustStore(t, dto.fromStoreId);
    await this.mustStore(t, dto.toStoreId);
    const reference = dto.reference ?? `TRF-${Date.now()}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const moved = [];
      for (const l of dto.lines) {
        const issued = await this.issue({ tenantId: t, userId: user.sub, itemId: l.itemId, storeId: dto.fromStoreId, toStoreId: dto.toStoreId, quantity: l.quantity, type: 'TRANSFER', reference, batchId: l.batchId }, tx);
        for (const i of issued) {
          const existing = await tx.stockBatch.findFirst({ where: { tenantId: t, itemId: l.itemId, storeId: dto.toStoreId, batchNo: i.batchNo } });
          const dest = existing
            ? await tx.stockBatch.update({ where: { id: existing.id }, data: { quantity: { increment: i.quantity } } })
            : await tx.stockBatch.create({ data: { tenantId: t, itemId: l.itemId, storeId: dto.toStoreId, batchNo: i.batchNo, expiryDate: i.expiryDate, quantity: i.quantity, unitCostMinor: i.unitCostMinor } });
          moved.push({ itemId: l.itemId, fromBatchId: i.batchId, toBatchId: dest.id, batchNo: i.batchNo, quantity: i.quantity });
        }
      }
      return moved;
    });
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'TRANSFER', entity: 'Store', entityId: dto.fromStoreId, data: { to: dto.toStoreId, reference } });
    return { reference, moved: result };
  }

  async adjust(user: AuthUser, dto: AdjustmentDto) {
    const t = user.tenantId;
    const b = await this.prisma.stockBatch.findFirst({ where: { id: dto.batchId, tenantId: t } });
    if (!b) throw new NotFoundException('Batch not found');
    if (b.quantity + dto.delta < 0) throw new BadRequestException(`Adjustment would make stock negative (on hand ${b.quantity})`);
    const [batch] = await this.prisma.$transaction([
      this.prisma.stockBatch.update({ where: { id: b.id }, data: { quantity: { increment: dto.delta } } }),
      this.prisma.stockMovement.create({
        data: { tenantId: t, itemId: b.itemId, batchId: b.id, ...(dto.delta < 0 ? { fromStoreId: b.storeId } : { toStoreId: b.storeId }), type: dto.reason === 'EXPIRY' ? 'EXPIRY' : 'ADJUSTMENT', quantity: dto.delta, reference: `${dto.reason}${dto.note ? ': ' + dto.note : ''}`, userId: user.sub },
      }),
    ]);
    await this.audit.log({ tenantId: t, userId: user.sub, action: 'ADJUST', entity: 'StockBatch', entityId: b.id, data: dto });
    return batch;
  }

  // ── Reports ──
  async levels(tenantId: string, q: LevelsQueryDto) {
    const grouped = await this.prisma.stockBatch.groupBy({
      by: ['itemId', 'storeId'], where: { tenantId, ...(q.storeId ? { storeId: q.storeId } : {}), quantity: { gt: 0 } }, _sum: { quantity: true }, _min: { expiryDate: true },
    });
    const items = await this.prisma.stockItem.findMany({ where: { tenantId, id: { in: grouped.map((g) => g.itemId) }, ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}) } });
    const stores = await this.prisma.store.findMany({ where: { tenantId } });
    const im = new Map(items.map((i) => [i.id, i])), sm = new Map(stores.map((s) => [s.id, s]));
    const rows = grouped.filter((g) => im.has(g.itemId)).map((g) => {
      const item = im.get(g.itemId)!;
      const qty = g._sum.quantity ?? 0;
      return { itemId: g.itemId, code: item.code, name: item.name, unit: item.unit, storeId: g.storeId, store: sm.get(g.storeId)?.name, quantity: qty, nearestExpiry: g._min.expiryDate, reorderLevel: item.reorderLevel, belowReorder: qty <= item.reorderLevel };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const page = q.page ?? 1, pageSize = q.pageSize ?? 50;
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
  }

  /** Items whose total on-hand (across all stores) is at or below reorder level. */
  async reorderAlerts(tenantId: string) {
    const items = await this.prisma.stockItem.findMany({ where: { tenantId, active: true, reorderLevel: { gt: 0 } } });
    const sums = await this.prisma.stockBatch.groupBy({ by: ['itemId'], where: { tenantId, itemId: { in: items.map((i) => i.id) }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] }, _sum: { quantity: true } });
    const sm = new Map(sums.map((s) => [s.itemId, s._sum.quantity ?? 0]));
    return items
      .map((i) => ({ itemId: i.id, code: i.code, name: i.name, onHand: sm.get(i.id) ?? 0, reorderLevel: i.reorderLevel, suggestedOrder: Math.max(i.reorderLevel * 2 - (sm.get(i.id) ?? 0), 0) }))
      .filter((r) => r.onHand <= r.reorderLevel)
      .sort((a, b) => a.onHand / a.reorderLevel - b.onHand / b.reorderLevel);
  }

  async expiryReport(tenantId: string, q: ExpiryQueryDto) {
    const horizon = new Date(Date.now() + (q.days ?? 90) * 86400000);
    const batches = await this.prisma.stockBatch.findMany({
      where: { tenantId, quantity: { gt: 0 }, expiryDate: { not: null, lte: horizon }, ...(q.storeId ? { storeId: q.storeId } : {}) },
      include: { item: { select: { code: true, name: true, unit: true } } }, orderBy: { expiryDate: 'asc' },
    });
    const now = Date.now();
    const data = batches.map((b) => ({ ...b, expired: b.expiryDate!.getTime() <= now, daysToExpiry: Math.ceil((b.expiryDate!.getTime() - now) / 86400000), valueMinor: b.quantity * b.unitCostMinor }));
    return { data, expiredValueMinor: data.filter((d) => d.expired).reduce((a, d) => a + d.valueMinor, 0), atRiskValueMinor: data.filter((d) => !d.expired).reduce((a, d) => a + d.valueMinor, 0) };
  }

  movements(tenantId: string, q: MovementQueryDto) {
    const where: Prisma.StockMovementWhereInput = {
      tenantId, ...(q.itemId ? { itemId: q.itemId } : {}), ...(q.type ? { type: q.type } : {}),
      ...(q.storeId ? { OR: [{ fromStoreId: q.storeId }, { toStoreId: q.storeId }] } : {}),
    };
    return paginate(q as PageQueryDto, (skip, take) => this.prisma.stockMovement.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), () => this.prisma.stockMovement.count({ where }));
  }
}
