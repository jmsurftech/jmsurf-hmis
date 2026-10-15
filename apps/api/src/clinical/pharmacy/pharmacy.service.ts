import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { BillingCoreService } from '../../billing/billing-core.service';
import { VisitsService } from '../visits/visits.service';
import { PatientsService } from '../patients/patients.service';
import { InventoryService } from '../inventory/inventory.service';
import { paginate } from '../shared/pagination';
import { allergyWarnings, dosesPerDay, duplicateWarnings, RxWarning } from './rx-checks';
import { ControlledRegisterQuery, DispenseDto, OtcSaleDto, PrescriptionDto, RxQueryDto } from './pharmacy.dto';

@Injectable()
export class PharmacyService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private billing: BillingCoreService,
    private visits: VisitsService,
    private patients: PatientsService,
    private inventory: InventoryService,
  ) {}

  async check(tenantId: string, visitId: string, itemId: string): Promise<RxWarning[]> {
    const visit = await this.visits.mustGet(tenantId, visitId);
    const item = await this.prisma.stockItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) throw new NotFoundException('Drug not found');
    const allergies = await this.prisma.allergy.findMany({ where: { tenantId, patientId: visit.patientId } });
    const active = await this.prisma.prescription.findMany({ where: { tenantId, visitId, status: { in: ['PENDING', 'PARTIAL', 'DISPENSED'] } } });
    const activeItems = await this.prisma.stockItem.findMany({ where: { id: { in: active.map((a) => a.itemId) } }, select: { id: true, genericName: true } });
    const gm = new Map(activeItems.map((i) => [i.id, i.genericName]));
    return [
      ...allergyWarnings({ name: item.name, genericName: item.genericName }, allergies),
      ...duplicateWarnings({ itemId: item.id, name: item.name, genericName: item.genericName }, active.map((a) => ({ itemId: a.itemId, drugName: a.drugName, genericName: gm.get(a.itemId) }))),
    ];
  }

  async prescribe(user: AuthUser, dto: PrescriptionDto) {
    const t = user.tenantId;
    const visit = await this.visits.mustBeActive(t, dto.visitId);
    const item = await this.prisma.stockItem.findFirst({ where: { id: dto.itemId, tenantId: t, active: true } });
    if (!item) throw new NotFoundException('Drug not found or inactive');
    const warnings = await this.check(t, visit.id, item.id);
    if (warnings.some((w) => w.severity === 'HIGH' && w.type === 'ALLERGY') && !dto.overrideWarnings)
      throw new ConflictException({ message: 'Prescription blocked by clinical decision support; resend with overrideWarnings=true and a reason to proceed', warnings });
    const quantity = dto.quantity ?? (dto.durationDays ? Math.max(1, dosesPerDay(dto.frequency) * dto.durationDays) : undefined);
    if (!quantity) throw new BadRequestException('Provide quantity or durationDays');
    const rx = await this.prisma.prescription.create({
      data: {
        tenantId: t, visitId: visit.id, itemId: item.id, drugName: [item.name, item.strength].filter(Boolean).join(' '), dose: dto.dose, route: dto.route,
        frequency: dto.frequency, durationDays: dto.durationDays, quantity, instructions: dto.instructions, prescriberId: user.sub,
      },
    });
    if (warnings.length && dto.overrideWarnings)
      await this.audit.log({ tenantId: t, userId: user.sub, action: 'CDS_OVERRIDE', entity: 'Prescription', entityId: rx.id, data: { warnings, reason: dto.overrideReason } });
    return { ...rx, warnings };
  }

  list(tenantId: string, q: RxQueryDto) {
    const where: Prisma.PrescriptionWhereInput = {
      tenantId, ...(q.visitId ? { visitId: q.visitId } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ drugName: { contains: q.q, mode: 'insensitive' } }, { visit: { patient: { mrn: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    return paginate(q, (skip, take) => this.prisma.prescription.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
      include: { dispenses: true, visit: { select: { visitNumber: true, patient: { select: { id: true, mrn: true, firstName: true, lastName: true } } } } },
    }), () => this.prisma.prescription.count({ where }));
  }

  async cancel(user: AuthUser, id: string) {
    const rx = await this.prisma.prescription.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!rx) throw new NotFoundException('Prescription not found');
    if (rx.status !== 'PENDING') throw new BadRequestException(`Cannot cancel a ${rx.status} prescription`);
    return this.prisma.prescription.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** Dispense (fully or partially) using FEFO from the pharmacy store; posts the charge to the bill. */
  async dispense(user: AuthUser, id: string, dto: DispenseDto) {
    const t = user.tenantId;
    const rx = await this.prisma.prescription.findFirst({ where: { id, tenantId: t }, include: { dispenses: true, visit: true } });
    if (!rx) throw new NotFoundException('Prescription not found');
    if (!['PENDING', 'PARTIAL'].includes(rx.status)) throw new BadRequestException(`Prescription is ${rx.status}`);
    const already = rx.dispenses.reduce((a, d) => a + d.quantity, 0);
    const remaining = rx.quantity - already;
    const qty = dto.quantity ?? remaining;
    if (qty > remaining) throw new BadRequestException(`Only ${remaining} remaining to dispense`);
    const store = dto.storeId ? await this.inventory.mustStore(t, dto.storeId) : await this.inventory.pharmacyStore(t, rx.visit.facilityId);
    const item = await this.prisma.stockItem.findUniqueOrThrow({ where: { id: rx.itemId } });

    const dispenses = await this.prisma.$transaction(async (tx) => {
      const issued = await this.inventory.issue({ tenantId: t, userId: user.sub, itemId: rx.itemId, storeId: store.id, quantity: qty, type: 'DISPENSE', reference: `RX:${rx.id}` }, tx);
      const rows = [];
      for (const i of issued) rows.push(await tx.dispense.create({ data: { tenantId: t, prescriptionId: rx.id, itemId: rx.itemId, batchId: i.batchId, quantity: i.quantity, storeId: store.id, dispensedBy: user.sub } }));
      await tx.prescription.update({ where: { id: rx.id }, data: { status: already + qty >= rx.quantity ? 'DISPENSED' : 'PARTIAL' } });
      return rows.map((r, idx) => ({ ...r, batchNo: issued[idx].batchNo, expiryDate: issued[idx].expiryDate }));
    });
    const charge = await this.billing.charge({ tenantId: t, visitId: rx.visitId, sourceType: 'DISPENSE', sourceId: rx.id, stockItemId: rx.itemId, quantity: qty });
    if (item.isControlled) await this.audit.log({ tenantId: t, userId: user.sub, action: 'DISPENSE_CONTROLLED', entity: 'Prescription', entityId: rx.id, data: { qty, batches: dispenses.map((d) => d.batchNo) } });
    return { dispenses, charge, label: { drug: rx.drugName, dose: rx.dose, frequency: rx.frequency, durationDays: rx.durationDays, instructions: rx.instructions, quantity: qty } };
  }

  /** Over-the-counter sale: creates a WALK_IN visit then dispenses each line directly and bills it. */
  async otcSale(user: AuthUser, dto: OtcSaleDto) {
    const t = user.tenantId;
    let patientId = dto.patientId;
    if (!patientId) {
      const [firstName, ...rest] = (dto.customerName ?? 'OTC Customer').trim().split(/\s+/);
      const p = await this.patients.registerMinimal(t, { firstName, lastName: rest.join(' ') || 'Walk-in', sex: 'UNKNOWN', phone: dto.phone });
      patientId = p.id;
    }
    const visit = await this.visits.open(user, { patientId, type: 'WALK_IN' as any, payerType: dto.payerType ?? 'CASH', schemeId: dto.schemeId, skipConsultationFee: true, queueAt: 'NONE' });
    const store = dto.storeId ? await this.inventory.mustStore(t, dto.storeId) : await this.inventory.pharmacyStore(t, visit.facilityId);
    const items = await this.prisma.stockItem.findMany({ where: { tenantId: t, id: { in: dto.items.map((i) => i.itemId) } } });
    const im = new Map(items.map((i) => [i.id, i]));
    for (const l of dto.items) if (!im.get(l.itemId)?.active) throw new NotFoundException(`Item ${l.itemId} not found or inactive`);
    const controlled = dto.items.filter((l) => im.get(l.itemId)!.isControlled);
    if (controlled.length) throw new BadRequestException('Controlled drugs cannot be sold over the counter; a prescription is required');

    const dispensed = await this.prisma.$transaction(async (tx) => {
      const out = [];
      for (const l of dto.items) {
        const issued = await this.inventory.issue({ tenantId: t, userId: user.sub, itemId: l.itemId, storeId: store.id, quantity: l.quantity, type: 'DISPENSE', reference: `OTC:${visit.visitNumber}` }, tx);
        for (const i of issued) out.push(await tx.dispense.create({ data: { tenantId: t, itemId: l.itemId, batchId: i.batchId, quantity: i.quantity, storeId: store.id, dispensedBy: user.sub } }));
      }
      return out;
    });
    for (const l of dto.items) await this.billing.charge({ tenantId: t, visitId: visit.id, sourceType: 'DISPENSE', stockItemId: l.itemId, quantity: l.quantity });
    const bill = await this.prisma.bill.findFirst({ where: { tenantId: t, visitId: visit.id }, include: { lines: true } });
    return { visit: { id: visit.id, visitNumber: visit.visitNumber, patientId }, dispensed, bill };
  }

  /** Controlled drugs register (PPB): every movement of controlled items with running balance per item. */
  async controlledRegister(tenantId: string, q: ControlledRegisterQuery) {
    const items = await this.prisma.stockItem.findMany({ where: { tenantId, isControlled: true, ...(q.itemId ? { id: q.itemId } : {}) } });
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400000);
    const to = q.to ? new Date(q.to) : new Date();
    const storeFilter = q.storeId ? { OR: [{ fromStoreId: q.storeId }, { toStoreId: q.storeId }] } : {};
    const out = [];
    for (const item of items) {
      const signed = (m: { type: string; quantity: number; fromStoreId: string | null; toStoreId: string | null }) => {
        if (m.type === 'ADJUSTMENT' || m.type === 'EXPIRY') return m.quantity; // stored signed
        if (q.storeId) return m.toStoreId === q.storeId ? m.quantity : -m.quantity;
        if (m.type === 'TRANSFER') return 0;
        return m.type === 'RECEIPT' || m.type === 'RETURN' ? m.quantity : -m.quantity;
      };
      const before = await this.prisma.stockMovement.findMany({ where: { tenantId, itemId: item.id, createdAt: { lt: from }, ...storeFilter } });
      let balance = before.reduce((a, m) => a + signed(m), 0);
      const opening = balance;
      const moves = await this.prisma.stockMovement.findMany({ where: { tenantId, itemId: item.id, createdAt: { gte: from, lte: to }, ...storeFilter }, orderBy: { createdAt: 'asc' } });
      const rxIds = moves.map((m) => m.reference?.startsWith('RX:') ? m.reference.slice(3) : null).filter((x): x is string => !!x);
      const rxs = await this.prisma.prescription.findMany({ where: { id: { in: rxIds } }, include: { visit: { select: { patient: { select: { mrn: true, firstName: true, lastName: true } } } } } });
      const rm = new Map(rxs.map((r) => [r.id, r]));
      const entries = moves.map((m) => {
        const delta = signed(m);
        balance += delta;
        const rx = m.reference?.startsWith('RX:') ? rm.get(m.reference.slice(3)) : undefined;
        return { date: m.createdAt, type: m.type, received: delta > 0 ? delta : 0, issued: delta < 0 ? -delta : 0, balance, reference: m.reference, userId: m.userId, patient: rx?.visit.patient, prescriberId: rx?.prescriberId };
      });
      out.push({ item: { id: item.id, code: item.code, name: item.name, strength: item.strength }, opening, closing: balance, entries });
    }
    return { from, to, items: out };
  }
}
