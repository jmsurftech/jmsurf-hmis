import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SMS, SmsPort } from '../integrations/ports';
import { withTenant } from '../integrations/integration-context';
import { WHATSAPP, WhatsAppPort } from './whatsapp.port';
import { DEFAULT_TEMPLATES, TEMPLATE_CODES, TemplateCode, renderTemplate } from './templates';
import { ReminderKind, appointmentWindow, selectAppointments, selectBillBalances, selectImmunizations, selectResultsReady } from './reminder-rules';

export const fmtKes = (minor: number, currency = 'KES') => `${currency} ${(minor / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtLocal = (d: Date, tz = 'Africa/Nairobi') => d.toLocaleString('en-KE', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

@Injectable()
export class MessagingService {
  private log = new Logger('Reminders');
  constructor(private prisma: PrismaService, @Inject(SMS) private sms: SmsPort, @Inject(WHATSAPP) private whatsapp: WhatsAppPort) {}

  async templates(tenantId: string) {
    const rows = await this.prisma.messageTemplate.findMany({ where: { tenantId } });
    const out: { code: string; lang: string; channel: string; body: string; isDefault: boolean; defaultBody: string }[] = [];
    for (const code of TEMPLATE_CODES) for (const lang of ['en', 'sw'] as const) {
      const r = rows.find((x) => x.code === code && x.lang === lang && x.channel === 'SMS');
      out.push({ code, lang, channel: 'SMS', body: r?.body ?? DEFAULT_TEMPLATES[code][lang], isDefault: !r, defaultBody: DEFAULT_TEMPLATES[code][lang] });
    }
    return out;
  }
  upsertTemplate(tenantId: string, code: string, lang: string, body: string, channel = 'SMS') {
    return this.prisma.messageTemplate.upsert({
      where: { tenantId_code_lang_channel: { tenantId, code, lang, channel } },
      create: { tenantId, code, lang, channel, body }, update: { body, active: true },
    });
  }
  async resetTemplate(tenantId: string, code: string, lang: string, channel = 'SMS') {
    await this.prisma.messageTemplate.deleteMany({ where: { tenantId, code, lang, channel } });
    return { ok: true };
  }

  async render(tenantId: string, code: TemplateCode, lang: string, vars: Record<string, string | number | undefined | null>) {
    const l = lang === 'sw' ? 'sw' : 'en';
    const row = await this.prisma.messageTemplate.findFirst({ where: { tenantId, code, lang: l, channel: 'SMS', active: true } });
    return renderTemplate(row?.body ?? DEFAULT_TEMPLATES[code][l], vars);
  }

  async languageOf(tenantId: string, patientId?: string | null) {
    if (!patientId) return 'en';
    const p = await this.prisma.patientPreference.findFirst({ where: { tenantId, patientId } });
    return p?.language ?? 'en';
  }

  /** Respect an explicit SMS opt-out (latest SMS consent with granted=false). */
  async smsAllowed(tenantId: string, patientId?: string | null) {
    if (!patientId) return true;
    const c = await this.prisma.consent.findFirst({ where: { tenantId, patientId, scope: 'SMS' }, orderBy: { createdAt: 'desc' } });
    return !c || c.granted;
  }

  /** Send a templated message to a patient (SMS, or WhatsApp if they opted in) and log it as a reminder when kind/refId are given. */
  async sendToPatient(tenantId: string, args: { patientId?: string | null; to: string; code: TemplateCode; vars: Record<string, any>; kind?: string; refId?: string }) {
    const lang = await this.languageOf(tenantId, args.patientId);
    const body = await this.render(tenantId, args.code, lang, args.vars);
    if (args.kind && args.refId) {
      const dup = await this.prisma.reminderLog.findUnique({ where: { tenantId_kind_refId: { tenantId, kind: args.kind, refId: args.refId } } });
      if (dup) return dup;
    }
    let status = 'SKIPPED', channel = 'SMS';
    if (await this.smsAllowed(tenantId, args.patientId)) {
      const pref = args.patientId ? await this.prisma.patientPreference.findFirst({ where: { tenantId, patientId: args.patientId } }) : null;
      if (pref?.whatsapp) {
        channel = 'WHATSAPP';
        status = (await withTenant(tenantId, () => this.whatsapp.sendText(args.to, body))).ok ? 'SENT' : 'FAILED';
      } else {
        status = (await withTenant(tenantId, () => this.sms.send(args.to, body))).ok ? 'SENT' : 'FAILED';
      }
    }
    if (!args.kind || !args.refId) return { status, body, channel };
    return this.prisma.reminderLog.create({ data: { tenantId, kind: args.kind, refId: args.refId, patientId: args.patientId ?? undefined, channel, to: args.to, lang, body, status } });
  }

  async reminderLog(tenantId: string, q: { page?: number; pageSize?: number; kind?: string; q?: string }) {
    const where: any = { tenantId, ...(q.kind ? { kind: q.kind } : {}), ...(q.q ? { OR: [{ to: { contains: q.q } }, { body: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    const page = Number(q.page) || 1, pageSize = Math.min(Number(q.pageSize) || 25, 200);
    const [data, total] = await Promise.all([
      this.prisma.reminderLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.reminderLog.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  private async sentSet(tenantId: string, kind: ReminderKind, ids: string[]) {
    if (!ids.length) return new Set<string>();
    const rows = await this.prisma.reminderLog.findMany({ where: { tenantId, kind, refId: { in: ids } }, select: { refId: true } });
    return new Set(rows.map((r) => r.refId));
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'patient-reminders' })
  async cron() {
    if (process.env.REMINDERS_ENABLED === 'false') return;
    const tenants = await this.prisma.tenant.findMany({ where: { subscriptionStatus: { not: 'CANCELLED' } }, select: { id: true } }).catch(() => []);
    for (const t of tenants) {
      try { await this.runForTenant(t.id); } catch (e: any) { this.log.warn(`Reminder run failed for ${t.id}: ${e?.message}`); }
    }
  }

  /** One reminder sweep for a tenant. Returns counts per kind. */
  async runForTenant(tenantId: string, now = new Date()) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { facilities: true } });
    const facility = tenant.facilities[0];
    const base = { facility: facility?.name ?? tenant.name, phone: facility?.phone ?? '' };
    const counts: Record<string, number> = {};
    const portal = `${process.env.WEB_PUBLIC_URL ?? 'http://localhost:3000'}/portal`;

    for (const kind of ['APPT_24H', 'APPT_2H'] as const) {
      const w = appointmentWindow(kind, now);
      const appts = await this.prisma.appointment.findMany({ where: { tenantId, startAt: { gte: w.from, lt: w.to }, status: { in: ['BOOKED', 'CONFIRMED'] } } });
      const pts = await this.prisma.patient.findMany({ where: { id: { in: appts.map((a) => a.patientId) } }, select: { id: true, firstName: true, phone: true } });
      const pm = new Map(pts.map((p) => [p.id, p]));
      const sel = selectAppointments(kind, appts.map((a) => ({ ...a, patientPhone: pm.get(a.patientId)?.phone })), now, await this.sentSet(tenantId, kind, appts.map((a) => a.id)));
      for (const a of sel) {
        const appt = appts.find((x) => x.id === a.id)!; const p = pm.get(appt.patientId)!;
        await this.sendToPatient(tenantId, { patientId: p.id, to: p.phone!, code: kind, kind, refId: a.id,
          vars: { ...base, name: p.firstName, time: fmtLocal(appt.startAt, tenant.timezone), link: appt.mode === 'TELEMEDICINE' ? `Video: ${portal}` : '' } });
      }
      counts[kind] = sel.length;
    }

    const imms = await this.prisma.immunization.findMany({ where: { tenantId, status: 'DUE', givenAt: null, dueDate: { gte: new Date(now.getTime() - 7 * 86400000), lt: new Date(now.getTime() + 2 * 86400000) } } });
    const ipts = await this.prisma.patient.findMany({ where: { id: { in: imms.map((i) => i.patientId) } }, select: { id: true, firstName: true, phone: true, nextOfKin: true } });
    const ipm = new Map(ipts.map((p) => [p.id, p]));
    const guardianPhone = (p?: { phone: string | null; nextOfKin: any }) => p?.phone ?? (Array.isArray(p?.nextOfKin) ? p!.nextOfKin.find((k: any) => k?.phone)?.phone : null);
    const isel = selectImmunizations(imms.map((i) => ({ ...i, phone: guardianPhone(ipm.get(i.patientId)) })), now, await this.sentSet(tenantId, 'IMMUNIZATION_DUE', imms.map((i) => i.id)));
    for (const i of isel) {
      const imm = imms.find((x) => x.id === i.id)!; const p = ipm.get(imm.patientId)!;
      await this.sendToPatient(tenantId, { patientId: p.id, to: i.phone!, code: 'IMMUNIZATION_DUE', kind: 'IMMUNIZATION_DUE', refId: i.id,
        vars: { ...base, name: p.firstName, vaccine: imm.vaccine, dose: imm.dose, date: imm.dueDate!.toISOString().slice(0, 10) } });
    }
    counts.IMMUNIZATION_DUE = isel.length;

    const results = await this.prisma.labResult.findMany({ where: { tenantId, verifiedAt: { gte: new Date(now.getTime() - 86400000) } }, include: { order: { include: { visit: { include: { patient: { select: { id: true, firstName: true, phone: true } } } } } } } });
    const byOrder = new Map<string, (typeof results)[number]>();
    for (const r of results) if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, r);
    const rsel = selectResultsReady([...byOrder.values()].map((r) => ({ id: r.orderId, verifiedAt: r.verifiedAt, phone: r.order.visit.patient.phone })), now, await this.sentSet(tenantId, 'RESULTS_READY', [...byOrder.keys()]));
    for (const o of rsel) {
      const r = byOrder.get(o.id)!; const p = r.order.visit.patient;
      await this.sendToPatient(tenantId, { patientId: p.id, to: p.phone!, code: 'RESULTS_READY', kind: 'RESULTS_READY', refId: o.id, vars: { ...base, name: p.firstName, test: r.order.description } });
    }
    counts.RESULTS_READY = rsel.length;

    const bills = await this.prisma.bill.findMany({ where: { tenantId, status: { in: ['FINAL', 'PARTIALLY_PAID', 'INTERIM'] }, updatedAt: { lte: new Date(now.getTime() - 48 * 3600000), gte: new Date(now.getTime() - 60 * 86400000) } }, include: { visit: { include: { patient: { select: { id: true, firstName: true, phone: true } } } } }, take: 500 });
    const bsel = selectBillBalances(bills.map((b) => ({ ...b, phone: b.visit.patient.phone })), now, await this.sentSet(tenantId, 'BILL_BALANCE', bills.map((b) => b.id)));
    for (const b of bsel) {
      const bill = bills.find((x) => x.id === b.id)!; const p = bill.visit.patient;
      await this.sendToPatient(tenantId, { patientId: p.id, to: p.phone!, code: 'BILL_BALANCE', kind: 'BILL_BALANCE', refId: b.id,
        vars: { ...base, name: p.firstName, amount: fmtKes(bill.patientAmountMinor - bill.paidMinor, bill.currency), bill: bill.billNumber } });
    }
    counts.BILL_BALANCE = bsel.length;
    return counts;
  }
}
