import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toMinor } from '../../common/money';
import { ListQuery, pageArgs, paged } from '../list-query';
import { BulkImportDto, PriceListDto, PriceListItemDto, ServiceItemDto, UpdatePriceListDto, UpdateServiceItemDto } from './pricing.dto';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async listServiceItems(tenantId: string, q: ListQuery & { category?: string }) {
    const where: any = { tenantId };
    if (q.category) where.category = q.category;
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      this.prisma.serviceItem.findMany({ where, orderBy: { name: 'asc' }, ...pageArgs(q) }),
      this.prisma.serviceItem.count({ where }),
    ]);
    return paged(data, total, q);
  }
  async getServiceItem(tenantId: string, id: string) {
    const s = await this.prisma.serviceItem.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Service item not found');
    return s;
  }
  async createServiceItem(tenantId: string, dto: ServiceItemDto) {
    const exists = await this.prisma.serviceItem.findFirst({ where: { tenantId, code: dto.code } });
    if (exists) throw new BadRequestException(`Code ${dto.code} already exists`);
    return this.prisma.serviceItem.create({ data: { ...dto, tenantId } });
  }
  async updateServiceItem(tenantId: string, id: string, dto: UpdateServiceItemDto) {
    await this.getServiceItem(tenantId, id);
    return this.prisma.serviceItem.update({ where: { id }, data: dto });
  }
  async deactivateServiceItem(tenantId: string, id: string) {
    await this.getServiceItem(tenantId, id);
    return this.prisma.serviceItem.update({ where: { id }, data: { active: false } });
  }

  /** Upsert service items by code from spreadsheet-style rows (prices in major units). */
  async bulkImport(tenantId: string, dto: BulkImportDto) {
    if (dto.priceListId) await this.getPriceList(tenantId, dto.priceListId);
    let created = 0, updated = 0;
    const errors: { row: number; error: string }[] = [];
    for (const [i, r] of dto.rows.entries()) {
      try {
        const data = {
          name: r.name.trim(), category: r.category ?? 'OTHER', basePriceMinor: toMinor(r.price), vatRate: r.vatRate ?? 0,
          shaInterventionCode: r.shaInterventionCode || null, etimsItemCode: r.etimsItemCode || null, departmentType: r.departmentType || null,
        };
        const code = r.code.trim();
        const existing = await this.prisma.serviceItem.findFirst({ where: { tenantId, code } });
        const item = existing
          ? await this.prisma.serviceItem.update({ where: { id: existing.id }, data })
          : await this.prisma.serviceItem.create({ data: { ...data, code, tenantId } });
        existing ? updated++ : created++;
        if (dto.priceListId) await this.upsertItem(dto.priceListId, { serviceItemId: item.id, priceMinor: data.basePriceMinor });
      } catch (e: any) {
        errors.push({ row: i + 1, error: e?.message ?? String(e) });
      }
    }
    return { created, updated, failed: errors.length, errors };
  }

  // ── price lists
  listPriceLists(tenantId: string) {
    return this.prisma.priceList.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, include: { _count: { select: { items: true } } } });
  }
  async getPriceList(tenantId: string, id: string) {
    const p = await this.prisma.priceList.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!p) throw new NotFoundException('Price list not found');
    return p;
  }
  async createPriceList(tenantId: string, dto: PriceListDto) {
    if (dto.isDefault) await this.prisma.priceList.updateMany({ where: { tenantId }, data: { isDefault: false } });
    return this.prisma.priceList.create({ data: { ...dto, tenantId } });
  }
  async updatePriceList(tenantId: string, id: string, dto: UpdatePriceListDto) {
    await this.getPriceList(tenantId, id);
    if (dto.isDefault) await this.prisma.priceList.updateMany({ where: { tenantId, NOT: { id } }, data: { isDefault: false } });
    return this.prisma.priceList.update({ where: { id }, data: dto });
  }
  async deletePriceList(tenantId: string, id: string) {
    await this.getPriceList(tenantId, id);
    await this.prisma.priceListItem.deleteMany({ where: { priceListId: id } });
    await this.prisma.priceList.delete({ where: { id } });
    return { deleted: true };
  }
  async setItems(tenantId: string, priceListId: string, items: PriceListItemDto[]) {
    await this.getPriceList(tenantId, priceListId);
    for (const it of items) {
      if (!it.serviceItemId && !it.stockItemId) throw new BadRequestException('serviceItemId or stockItemId required');
      if (it.serviceItemId) await this.getServiceItem(tenantId, it.serviceItemId);
      if (it.stockItemId && !(await this.prisma.stockItem.findFirst({ where: { id: it.stockItemId, tenantId } })))
        throw new NotFoundException('Stock item not found');
      await this.upsertItem(priceListId, it);
    }
    return this.getPriceList(tenantId, priceListId);
  }
  async removeItem(tenantId: string, priceListId: string, itemId: string) {
    await this.getPriceList(tenantId, priceListId);
    await this.prisma.priceListItem.deleteMany({ where: { id: itemId, priceListId } });
    return { deleted: true };
  }
  private async upsertItem(priceListId: string, it: PriceListItemDto) {
    const where = { priceListId, serviceItemId: it.serviceItemId ?? null, stockItemId: it.stockItemId ?? null };
    const existing = await this.prisma.priceListItem.findFirst({ where });
    return existing
      ? this.prisma.priceListItem.update({ where: { id: existing.id }, data: { priceMinor: it.priceMinor } })
      : this.prisma.priceListItem.create({ data: { ...where, priceMinor: it.priceMinor } });
  }
}
