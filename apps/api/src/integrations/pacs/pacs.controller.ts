import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyzerService } from '../lab-analyzers/analyzer.service';
import { mwlItem, viewerUrl } from './pacs';

/** DICOM Modality Worklist feed (JSON) + viewer links. A worklist bridge (Orthanc plugin / script) polls /pacs/mwl with a device key. */
@Controller('pacs')
export class PacsController {
  constructor(private prisma: PrismaService, private devices: AnalyzerService) {}

  private async items(tenantId: string, modality?: string) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId, type: 'IMAGING', status: { in: ['REQUESTED', 'PAID', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'asc' }, take: 500,
      include: { imagingReport: true, visit: { select: { patient: { select: { mrn: true, firstName: true, middleName: true, lastName: true, sex: true, dateOfBirth: true } } } } },
    });
    return orders.map((o) => mwlItem({
      id: o.id, description: o.description, priority: o.priority, createdAt: o.createdAt, modality: o.imagingReport?.modality,
      accession: o.id.replace(/-/g, '').slice(0, 16).toUpperCase(), studyUid: o.imagingReport?.studyUid, patient: o.visit.patient,
    })).filter((i) => !modality || i.ScheduledProcedureStepSequence[0].Modality === modality);
  }

  @Get('worklist') @Roles('RADIOGRAPHER', 'DOCTOR')
  worklist(@CurrentUser() u: AuthUser, @Query('modality') modality?: string) { return this.items(u.tenantId, modality); }

  @Public() @Get('mwl')
  async mwl(@Headers('x-device-key') key: string | undefined, @Query('modality') modality?: string) {
    const d = await this.devices.authenticate(key);
    return this.items(d.tenantId, modality);
  }

  @Get('config') config() { return { viewerConfigured: !!viewerUrl('x'), example: viewerUrl('1.2.3') }; }
}
