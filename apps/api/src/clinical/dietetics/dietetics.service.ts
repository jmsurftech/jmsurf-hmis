import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { DietOrderDto, DietQuery, GenerateDto, SheetQuery } from './dietetics.dto';

const dayOf = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

@Injectable()
export class DieteticsService {
  constructor(private prisma: PrismaService) {}

  /** New diet order for an active admission; replaces (stops) any previous active order. */
  async order(u: AuthUser, d: DietOrderDto) {
    const t = u.tenantId;
    const a = await mustFind(this.prisma.admission.findFirst({ where: { id: d.admissionId, tenantId: t }, include: { visit: true } }), 'Admission');
    if (a.dischargedAt) throw new BadRequestException('Patient has been discharged');
    await this.prisma.dietOrder.updateMany({ where: { tenantId: t, admissionId: a.id, status: 'ACTIVE' }, data: { status: 'STOPPED', endAt: new Date() } });
    return this.prisma.dietOrder.create({ data: { tenantId: t, admissionId: a.id, patientId: a.visit.patientId, wardId: a.wardId, dietType: d.dietType, texture: d.texture, allergies: d.allergies, notes: d.notes, orderedById: u.sub } });
  }
  list(t: string, q: DietQuery) {
    const where: Prisma.DietOrderWhereInput = { tenantId: t, ...(q.wardId ? { wardId: q.wardId } : {}), status: q.status ?? 'ACTIVE' };
    return paginate(q, (skip, take) => this.prisma.dietOrder.findMany({ where, skip, take, orderBy: { startAt: 'desc' } }), () => this.prisma.dietOrder.count({ where }));
  }
  async stop(u: AuthUser, id: string) {
    await mustFind(this.prisma.dietOrder.findFirst({ where: { id, tenantId: u.tenantId } }), 'Diet order');
    return this.prisma.dietOrder.update({ where: { id }, data: { status: 'STOPPED', endAt: new Date() } });
  }

  /**
   * Generate the meal plan for each ward (or one ward) for a date+meal from current inpatients.
   * Inpatients without a diet order default to NORMAL. Idempotent: regenerating overwrites the plan.
   */
  async generate(u: AuthUser, d: GenerateDto) {
    const t = u.tenantId; const date = dayOf(d.date);
    const wards = await this.prisma.ward.findMany({ where: { tenantId: t, ...(d.wardId ? { id: d.wardId } : {}) }, include: { beds: true } });
    const plans = [];
    for (const w of wards) {
      const adms = await this.prisma.admission.findMany({ where: { tenantId: t, wardId: w.id, dischargedAt: null }, include: { visit: { include: { patient: true } } } });
      const orders = await this.prisma.dietOrder.findMany({ where: { tenantId: t, admissionId: { in: adms.map((a) => a.id) }, status: 'ACTIVE' } });
      const items = adms.map((a) => {
        const o = orders.find((x) => x.admissionId === a.id);
        const p = a.visit.patient;
        return { patientId: p.id, patientName: `${p.firstName} ${p.lastName}`, mrn: p.mrn, bed: w.beds.find((b) => b.id === a.bedId)?.label ?? '—', dietType: o?.dietType ?? 'NORMAL', texture: o?.texture ?? null, allergies: o?.allergies ?? null, notes: o?.notes ?? null };
      }).sort((x, y) => x.bed.localeCompare(y.bed, undefined, { numeric: true }));
      const counts: Record<string, number> = {};
      for (const i of items) if (i.dietType !== 'NPO') counts[i.dietType] = (counts[i.dietType] ?? 0) + 1;
      const plan = await this.prisma.mealPlan.upsert({
        where: { tenantId_date_meal_wardId: { tenantId: t, date, meal: d.meal, wardId: w.id } },
        create: { tenantId: t, date, meal: d.meal, wardId: w.id, wardName: w.name, items, counts },
        update: { items, counts, wardName: w.name, generatedAt: new Date() },
      });
      plans.push(plan);
    }
    return plans;
  }
  plans(t: string, q: SheetQuery) { return this.prisma.mealPlan.findMany({ where: { tenantId: t, date: dayOf(q.date), meal: q.meal }, orderBy: { wardName: 'asc' } }); }
  /** Kitchen sheet: totals per diet type across wards, plus per-ward breakdown and special notes. */
  async kitchenSheet(t: string, q: SheetQuery) {
    const plans = await this.plans(t, q);
    const totals: Record<string, number> = {};
    for (const p of plans) for (const [k, v] of Object.entries(p.counts as Record<string, number>)) totals[k] = (totals[k] ?? 0) + v;
    const specials = plans.flatMap((p) => (p.items as any[]).filter((i) => i.dietType !== 'NORMAL' || i.allergies || i.texture || i.notes).map((i) => ({ ward: p.wardName, ...i })));
    return { date: q.date.slice(0, 10), meal: q.meal, totalMeals: Object.values(totals).reduce((a, b) => a + b, 0), totals, wards: plans.map((p) => ({ ward: p.wardName, counts: p.counts, patients: (p.items as any[]).length })), specials };
  }
}
