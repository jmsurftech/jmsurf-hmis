import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../shared/pagination';
import { mustFind } from '../shared/facility';
import { SupportBillingService } from '../support-common/support-billing.service';
import { tripMileage } from './ems.rules';
import { AmbulanceDto, AmbulanceStatusDto, CancelTripDto, CompleteTripDto, DispatchDto, TripDto, TripEventDto, TripQuery } from './ems.dto';

@Injectable()
export class EmsService {
  constructor(private prisma: PrismaService, private sb: SupportBillingService) {}

  fleet(t: string) { return this.prisma.ambulance.findMany({ where: { tenantId: t }, orderBy: { regNumber: 'asc' } }); }
  addAmbulance(u: AuthUser, d: AmbulanceDto) { return this.prisma.ambulance.create({ data: { tenantId: u.tenantId, ...d } }); }
  async ambulanceStatus(u: AuthUser, id: string, d: AmbulanceStatusDto) {
    const a = await mustFind(this.prisma.ambulance.findFirst({ where: { id, tenantId: u.tenantId } }), 'Ambulance');
    if (a.status === 'DISPATCHED') throw new BadRequestException('Ambulance is on a trip');
    return this.prisma.ambulance.update({ where: { id }, data: { status: d.status } });
  }

  async request(u: AuthUser, d: TripDto) {
    if (d.patientId) await this.sb.patient(u.tenantId, d.patientId);
    return this.prisma.ambulanceTrip.create({ data: { tenantId: u.tenantId, tripNumber: await this.sb.next(u.tenantId, 'AMB_TRIP', 'TRIP'), ...d } });
  }
  list(t: string, q: TripQuery) {
    const where: Prisma.AmbulanceTripWhereInput = { tenantId: t, ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ tripNumber: { contains: q.q, mode: 'insensitive' } }, { pickupLocation: { contains: q.q, mode: 'insensitive' } }, { patientName: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    return paginate(q, (skip, take) => this.prisma.ambulanceTrip.findMany({ where, skip, take, orderBy: { requestedAt: 'desc' } }), () => this.prisma.ambulanceTrip.count({ where }));
  }
  async get(t: string, id: string) {
    const trip = await mustFind(this.prisma.ambulanceTrip.findFirst({ where: { id, tenantId: t } }), 'Trip');
    const ambulance = trip.ambulanceId ? await this.prisma.ambulance.findUnique({ where: { id: trip.ambulanceId } }) : null;
    return { ...trip, ambulance };
  }
  private trip(t: string, id: string) { return mustFind(this.prisma.ambulanceTrip.findFirst({ where: { id, tenantId: t } }), 'Trip'); }

  async dispatch(u: AuthUser, id: string, d: DispatchDto) {
    const t = u.tenantId; const trip = await this.trip(t, id);
    if (trip.status !== 'REQUESTED') throw new BadRequestException(`Trip is ${trip.status}`);
    const amb = await mustFind(this.prisma.ambulance.findFirst({ where: { id: d.ambulanceId, tenantId: t } }), 'Ambulance');
    const claimed = await this.prisma.ambulance.updateMany({ where: { id: amb.id, status: 'AVAILABLE' }, data: { status: 'DISPATCHED' } });
    if (!claimed.count) throw new BadRequestException(`Ambulance ${amb.regNumber} is ${amb.status}`);
    const crew = d.crew ?? (d.crewText ? d.crewText.split(',').map((s) => s.trim()).filter(Boolean) : []);
    return this.prisma.ambulanceTrip.update({ where: { id }, data: { ambulanceId: amb.id, crew, status: 'DISPATCHED', dispatchedAt: new Date(), odometerStart: amb.odometerKm } });
  }
  async event(u: AuthUser, id: string, d: TripEventDto) {
    const trip = await this.trip(u.tenantId, id);
    if (!['DISPATCHED', 'AT_SCENE'].includes(trip.status)) throw new BadRequestException(`Trip is ${trip.status}`);
    if (d.patientId) await this.sb.patient(u.tenantId, d.patientId);
    return this.prisma.ambulanceTrip.update({ where: { id }, data: { status: d.status, ...(d.status === 'AT_SCENE' ? { atSceneAt: new Date() } : { pickedUpAt: new Date() }), ...(d.patientId ? { patientId: d.patientId } : {}) } });
  }
  /** Complete: log mileage, free the ambulance, bill base fare + per-km (service codes AMB-BASE / AMB-KM) to the patient's visit. */
  async complete(u: AuthUser, id: string, d: CompleteTripDto) {
    const t = u.tenantId; const trip = await this.trip(t, id);
    if (!['DISPATCHED', 'AT_SCENE', 'TRANSPORTING'].includes(trip.status)) throw new BadRequestException(`Trip is ${trip.status}`);
    let km: number;
    try { km = tripMileage(trip.odometerStart, d.odometerEnd); } catch (e) { throw new BadRequestException(e.message); }
    const patientId = d.patientId ?? trip.patientId;
    let visitId: string | undefined; let charged = 0;
    if (patientId) {
      const visit = await this.sb.billableVisit(u, patientId, d.visitId, 'EMERGENCY');
      visitId = visit.id;
      const base = await this.sb.chargeCode(t, 'AMB-BASE', { visitId, sourceType: 'PROCEDURE', sourceId: trip.id, description: `Ambulance ${trip.tripNumber} – base fare` });
      const perKm = km > 0 ? await this.sb.chargeCode(t, 'AMB-KM', { visitId, sourceType: 'PROCEDURE', sourceId: trip.id, quantity: km, description: `Ambulance ${trip.tripNumber} – ${km} km` }) : undefined;
      charged = (base?.totalMinor ?? 0) + (perKm?.totalMinor ?? 0);
    }
    if (trip.ambulanceId) await this.prisma.ambulance.update({ where: { id: trip.ambulanceId }, data: { status: 'AVAILABLE', odometerKm: d.odometerEnd } });
    return this.prisma.ambulanceTrip.update({ where: { id }, data: { status: 'COMPLETED', droppedAt: new Date(), odometerEnd: d.odometerEnd, mileageKm: km, dropoffLocation: d.dropoffLocation ?? trip.dropoffLocation, notes: d.notes, patientId, visitId, chargedMinor: charged } });
  }
  async cancel(u: AuthUser, id: string, d: CancelTripDto) {
    const trip = await this.trip(u.tenantId, id);
    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) throw new BadRequestException(`Trip is ${trip.status}`);
    if (trip.ambulanceId) await this.prisma.ambulance.update({ where: { id: trip.ambulanceId }, data: { status: 'AVAILABLE' } });
    return this.prisma.ambulanceTrip.update({ where: { id }, data: { status: 'CANCELLED', notes: d.reason } });
  }
}
