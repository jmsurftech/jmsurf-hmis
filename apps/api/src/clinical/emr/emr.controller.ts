import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { EmrService } from './emr.service';
import { DiagnosisDto, IcdQuery, NoteDto, TriageDto, UpdateNoteDto, VisitRefQuery, VitalsDto } from './emr.dto';

const NURSING = ['TRIAGE_NURSE', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER'];
const CLIN = ['DOCTOR', 'CLINICAL_OFFICER'];
const READ = [...NURSING, 'PHARMACIST', 'LAB_TECH', 'RADIOGRAPHER', 'CLAIMS_OFFICER'];

@ApiTags('emr') @ApiBearerAuth()
@Controller('emr')
export class EmrController {
  constructor(private svc: EmrService) {}

  @Post('triage') @Roles('TRIAGE_NURSE', 'NURSE', ...CLIN) triage(@CurrentUser() u: AuthUser, @Body() dto: TriageDto) { return this.svc.triage(u, dto); }
  @Get('triage') @Roles(...READ) listTriage(@CurrentUser() u: AuthUser, @Query() q: VisitRefQuery) { return this.svc.listTriage(u.tenantId, q.visitId); }

  @Post('vitals') @Roles(...NURSING) vitals(@CurrentUser() u: AuthUser, @Body() dto: VitalsDto) { return this.svc.recordVitals(u, dto); }
  @Get('vitals') @Roles(...READ) listVitals(@CurrentUser() u: AuthUser, @Query() q: VisitRefQuery) { return this.svc.listVitals(u.tenantId, q.visitId); }

  @Post('notes') @Roles(...NURSING) note(@CurrentUser() u: AuthUser, @Body() dto: NoteDto) { return this.svc.createNote(u, dto); }
  @Get('notes') @Roles(...READ) notes(@CurrentUser() u: AuthUser, @Query() q: VisitRefQuery) { return this.svc.listNotes(u, q.visitId); }
  @Patch('notes/:id') @Roles(...NURSING) updateNote(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNoteDto) { return this.svc.updateNote(u, id, dto); }
  @Post('notes/:id/sign') @Roles(...NURSING) sign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.signNote(u, id); }

  @Post('diagnoses') @Roles(...CLIN) dx(@CurrentUser() u: AuthUser, @Body() dto: DiagnosisDto) { return this.svc.addDiagnosis(u, dto); }
  @Get('diagnoses') @Roles(...READ) listDx(@CurrentUser() u: AuthUser, @Query() q: VisitRefQuery) { return this.svc.listDiagnoses(u.tenantId, q.visitId); }
  @Delete('diagnoses/:id') @Roles(...CLIN) delDx(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.removeDiagnosis(u, id); }
  @Get('patients/:patientId/problems') @Roles(...READ) problems(@CurrentUser() u: AuthUser, @Param('patientId', ParseUUIDPipe) pid: string) { return this.svc.problemList(u.tenantId, pid); }

  @Get('icd11') icd(@Query() q: IcdQuery) { return this.svc.searchIcd(q.q, q.limit); }
}
