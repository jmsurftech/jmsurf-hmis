import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NATIONAL_INSURANCE, NationalInsurancePort } from '../integrations/ports';
import { withTenant } from '../integrations/integration-context';
import { normalizePhone } from './otp';
import { UssdData, ussdRespond, ussdRoute } from './ussd';
import { fmtKes, fmtLocal } from './messaging.service';

@Injectable()
export class UssdService {
  constructor(private prisma: PrismaService, @Inject(NATIONAL_INSURANCE) private nhi: NationalInsurancePort) {}

  async handle(slug: string | undefined, body: { sessionId?: string; serviceCode?: string; phoneNumber?: string; text?: string }): Promise<string> {
    const tenant = slug
      ? await this.prisma.tenant.findUnique({ where: { slug }, include: { facilities: { orderBy: { createdAt: 'asc' }, take: 1 } } })
      : await this.prisma.tenant.findFirst({ where: { slug: process.env.USSD_DEFAULT_TENANT ?? 'demo' }, include: { facilities: { orderBy: { createdAt: 'asc' }, take: 1 } } });
    if (!tenant) return 'END Service unavailable';
    const text = body.text ?? '';
    const route = ussdRoute(text);
    const data: UssdData = { facility: tenant.facilities[0]?.name ?? tenant.name };
    if (route.step === 'ACTION') {
      const phone = normalizePhone(body.phoneNumber ?? '');
      const patient = await this.prisma.patient.findFirst({ where: { tenantId: tenant.id, phone, mergedIntoId: null }, orderBy: { dateOfBirth: 'asc' } });
      if (patient) {
        data.patientName = patient.firstName;
        if (route.action === 'APPOINTMENT') {
          const a = await this.prisma.appointment.findFirst({ where: { tenantId: tenant.id, patientId: patient.id, startAt: { gte: new Date() }, status: { in: ['BOOKED', 'CONFIRMED'] } }, orderBy: { startAt: 'asc' } });
          if (a) data.appointment = `${fmtLocal(a.startAt, tenant.timezone)}${a.mode === 'TELEMEDICINE' ? ' (video)' : ''}`;
        } else if (route.action === 'SHA') {
          if (!patient.crId && !patient.idNumber) data.sha = route.lang === 'sw' ? 'Hakuna nambari ya kitambulisho' : 'No ID on file';
          else {
            try {
              const r = await withTenant(tenant.id, () => this.nhi.checkEligibility({ crId: patient.crId ?? undefined, idNumber: patient.idNumber ?? undefined, facilityCode: tenant.facilities[0]?.kmhflCode ?? undefined }));
              data.sha = r.eligible ? `${route.lang === 'sw' ? 'Hai' : 'Active'}${r.fund ? ` (${r.fund})` : ''}` : `${route.lang === 'sw' ? 'Haitumiki' : 'Not active'}${r.message ? ` - ${r.message}` : ''}`;
            } catch { data.sha = route.lang === 'sw' ? 'Huduma haipatikani kwa sasa' : 'Service unavailable, try later'; }
          }
        } else if (route.action === 'BILL') {
          const b = await this.prisma.bill.findFirst({ where: { tenantId: tenant.id, status: { notIn: ['VOID', 'PAID'] }, visit: { patientId: patient.id } }, orderBy: { createdAt: 'desc' } });
          if (b && b.patientAmountMinor - b.paidMinor > 0) data.bill = `${fmtKes(b.patientAmountMinor - b.paidMinor, b.currency)} (${b.billNumber})`;
        }
      }
    }
    return ussdRespond(text, data);
  }
}
