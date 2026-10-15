import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Appointment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { AuditService } from '../common/audit.service';
import { BillingCoreService } from '../billing/billing-core.service';
import { AuthUser } from '../common/auth-user';

export const jitsiBase = () => (process.env.JITSI_BASE_URL || 'https://meet.jit.si').replace(/\/+$/, '');
/** 128 bits of randomness: the room name is the only access control Jitsi public servers offer. */
export const newRoomName = (prefix = 'jmsurf') => `${prefix}-${randomBytes(16).toString('hex')}`;
export const DEFAULT_TELEMED_FEE_MINOR = 100_000; // KES 1,000

export class PaymentRequiredException extends HttpException {
  constructor(public details: Record<string, unknown>) { super({ statusCode: 402, message: 'Please pay the consultation fee before joining', ...details }, HttpStatus.PAYMENT_REQUIRED); }
}

export interface EPrescriptionItem { itemId?: string; drugName: string; dose: string; route?: string; frequency: string; durationDays?: number; quantity: number; instructions?: string }

@Injectable()
export class TelemedicineService {
  constructor(private prisma: PrismaService, private seq: SequenceService, private audit: AuditService, private billing: BillingCoreService) {}

  private async fee(tenantId: string, a: Appointment) {
    if (a.practitionerId) {
      const p = await this.prisma.practitioner.findFirst({ where: { id: a.practitionerId, tenantId } });
      if (p?.consultationFeeMinor != null) return p.consultationFeeMinor;
    }
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const s = (t?.settings ?? {}) as any;
    return Number.isInteger(s.telemedicineFeeMinor) ? s.telemedicineFeeMinor : DEFAULT_TELEMED_FEE_MINOR;
  }

  /** Create (once) the room for a TELEMEDICINE appointment and store the URL on the appointment. */
  async ensureSession(tenantId: string, appointmentId: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId } });
    if (!a) throw new NotFoundException('Appointment not found');
    if (a.mode !== 'TELEMEDICINE') throw new BadRequestException('Not a telemedicine appointment');
    const existing = await this.prisma.telemedicineSession.findUnique({ where: { appointmentId } });
    if (existing) return existing;
    const roomName = newRoomName();
    const url = `${jitsiBase()}/${roomName}`;
    const s = await this.prisma.telemedicineSession.create({ data: { tenantId, appointmentId, roomName, url, feeMinor: await this.fee(tenantId, a) } });
    await this.prisma.appointment.update({ where: { id: a.id }, data: { meetingUrl: url } });
    return s;
  }

  /** Open the TELEMEDICINE visit and post the consultation charge (via BillingCoreService) so it can be paid. */
  async ensureBill(tenantId: string, appointmentId: string) {
    let s = await this.ensureSession(tenantId, appointmentId);
    if (s.visitId && s.billId) return s;
    const a = await this.prisma.appointment.findFirstOrThrow({ where: { id: appointmentId, tenantId } });
    const visit = await this.prisma.visit.create({
      data: { tenantId, facilityId: a.facilityId, patientId: a.patientId, type: 'TELEMEDICINE', payerType: 'CASH', practitionerId: a.practitionerId, departmentId: a.departmentId, visitNumber: await this.seq.next(tenantId, 'VISIT', 'V') },
    });
    let billId: string | undefined;
    if (s.feeMinor > 0) {
      const line = await this.billing.charge({ tenantId, visitId: visit.id, sourceType: 'CONSULTATION', sourceId: a.id, description: 'Telemedicine consultation', unitPriceMinor: s.feeMinor });
      billId = line.billId;
    } else {
      billId = (await this.billing.getOrOpenBill(tenantId, visit.id)).id;
    }
    s = await this.prisma.telemedicineSession.update({ where: { id: s.id }, data: { visitId: visit.id, billId } });
    return s;
  }

  async status(tenantId: string, appointmentId: string) {
    const s = await this.ensureSession(tenantId, appointmentId);
    const bill = s.billId ? await this.prisma.bill.findUnique({ where: { id: s.billId } }) : null;
    const due = bill ? Math.max(bill.patientAmountMinor - bill.paidMinor, 0) : s.feeMinor;
    const paid = s.feeMinor === 0 || (!!bill && due === 0);
    return { session: s, paid, amountDueMinor: paid ? 0 : due, bill };
  }

  /** Patient join: pay-before-join. Returns the room URL only once the consultation fee is settled. */
  async patientJoin(tenantId: string, patientIds: string[], appointmentId: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId } });
    if (!a || !patientIds.includes(a.patientId)) throw new NotFoundException('Appointment not found');
    if (['CANCELLED', 'NO_SHOW', 'DONE'].includes(a.status)) throw new BadRequestException(`Appointment is ${a.status}`);
    const st = await this.status(tenantId, appointmentId);
    if (!st.paid) throw new PaymentRequiredException({ amountDueMinor: st.amountDueMinor, billId: st.session.billId });
    await this.prisma.telemedicineSession.update({ where: { id: st.session.id }, data: { patientJoinedAt: st.session.patientJoinedAt ?? new Date() } });
    return { url: st.session.url, roomName: st.session.roomName };
  }

  /** Staff join: opens the visit (so the doctor can document and e-prescribe) and marks the appointment ARRIVED. */
  async staffJoin(user: AuthUser, appointmentId: string) {
    const s = await this.ensureBill(user.tenantId, appointmentId);
    const a = await this.prisma.appointment.findFirstOrThrow({ where: { id: appointmentId, tenantId: user.tenantId } });
    if (['CANCELLED'].includes(a.status)) throw new BadRequestException('Appointment is cancelled');
    if (['BOOKED', 'CONFIRMED'].includes(a.status)) await this.prisma.appointment.update({ where: { id: a.id }, data: { status: 'ARRIVED' } });
    await this.prisma.telemedicineSession.update({ where: { id: s.id }, data: { doctorJoinedAt: s.doctorJoinedAt ?? new Date() } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'TELEMED_JOIN', entity: 'Appointment', entityId: a.id });
    const st = await this.status(user.tenantId, appointmentId);
    return { url: s.url, roomName: s.roomName, visitId: s.visitId, paid: st.paid, amountDueMinor: st.amountDueMinor };
  }

  /** E-prescription after the call: writes Prescriptions on the telemedicine visit and completes the appointment. */
  async ePrescribe(user: AuthUser, appointmentId: string, items: EPrescriptionItem[], notes?: string) {
    const s = await this.prisma.telemedicineSession.findFirst({ where: { appointmentId, tenantId: user.tenantId } });
    if (!s || !s.visitId) throw new BadRequestException('Join the call before prescribing');
    if (!s.doctorJoinedAt) throw new ForbiddenException('The consultation has not started');
    const created = [];
    for (const it of items) {
      let itemId = it.itemId ?? 'EXTERNAL';
      if (it.itemId) {
        const si = await this.prisma.stockItem.findFirst({ where: { id: it.itemId, tenantId: user.tenantId } });
        if (!si) throw new NotFoundException('Stock item not found');
        itemId = si.id;
      }
      created.push(await this.prisma.prescription.create({
        data: { tenantId: user.tenantId, visitId: s.visitId, itemId, drugName: it.drugName, dose: it.dose, route: it.route, frequency: it.frequency, durationDays: it.durationDays, quantity: it.quantity, instructions: it.instructions, prescriberId: user.sub },
      }));
    }
    if (notes) await this.prisma.clinicalNote.create({ data: { tenantId: user.tenantId, visitId: s.visitId, type: 'SOAP', plan: notes, authorId: user.sub, signedAt: new Date() } });
    await this.prisma.telemedicineSession.update({ where: { id: s.id }, data: { endedAt: new Date() } });
    await this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'DONE' } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.sub, action: 'E_PRESCRIBE', entity: 'Visit', entityId: s.visitId, data: { count: created.length } });
    return { visitId: s.visitId, prescriptions: created };
  }

  /** On cancellation, void the unpaid consultation charge and cancel the empty visit. */
  async releaseOnCancel(tenantId: string, appointmentId: string) {
    const s = await this.prisma.telemedicineSession.findFirst({ where: { tenantId, appointmentId } });
    if (!s?.billId) return;
    const bill = await this.prisma.bill.findFirst({ where: { id: s.billId, tenantId } });
    if (!bill || bill.paidMinor > 0) return; // paid fees are refunded by the cashier
    const lines = await this.prisma.billLine.findMany({ where: { tenantId, billId: bill.id, sourceType: 'CONSULTATION', sourceId: appointmentId, voided: false } });
    for (const l of lines) await this.billing.voidLine(tenantId, l.id);
    if (s.visitId) await this.prisma.visit.updateMany({ where: { id: s.visitId, tenantId, status: 'OPEN' }, data: { status: 'CANCELLED', endedAt: new Date() } });
  }

  async list(tenantId: string, from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date(start.getTime() + 7 * 86400000);
    const appts = await this.prisma.appointment.findMany({ where: { tenantId, mode: 'TELEMEDICINE', startAt: { gte: start, lt: end } }, orderBy: { startAt: 'asc' } });
    const [sessions, pts] = await Promise.all([
      this.prisma.telemedicineSession.findMany({ where: { tenantId, appointmentId: { in: appts.map((a) => a.id) } } }),
      this.prisma.patient.findMany({ where: { tenantId, id: { in: appts.map((a) => a.patientId) } }, select: { id: true, mrn: true, firstName: true, lastName: true, phone: true } }),
    ]);
    return { data: appts.map((a) => ({ ...a, session: sessions.find((s) => s.appointmentId === a.id) ?? null, patient: pts.find((p) => p.id === a.patientId) })) };
  }
}
