import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { PatientsService } from './patients.service';
import { AllergyDto, ClientRegistryLookupDto, ConsentDto, CoverDto, CreatePatientDto, MergePatientsDto, SearchPatientsDto, UpdateCoverDto, UpdatePatientDto } from './patients.dto';

const CLINICAL = ['RECEPTION', 'TRIAGE_NURSE', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'LAB_TECH', 'RADIOGRAPHER', 'PHARMACIST', 'CASHIER', 'CLAIMS_OFFICER'];

@ApiTags('patients') @ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private svc: PatientsService) {}

  @Post() @Roles('RECEPTION', 'NURSE', 'TRIAGE_NURSE', 'DOCTOR', 'CLINICAL_OFFICER')
  register(@CurrentUser() u: AuthUser, @Body() dto: CreatePatientDto) { return this.svc.register(u, dto); }

  @Get() @Roles(...CLINICAL)
  search(@CurrentUser() u: AuthUser, @Query() q: SearchPatientsDto) { return this.svc.search(u.tenantId, q); }

  @Post('client-registry/lookup') @Roles('RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'CLAIMS_OFFICER')
  crLookup(@CurrentUser() u: AuthUser, @Body() dto: ClientRegistryLookupDto) { return this.svc.clientRegistryLookup(u, dto); }

  @Post('duplicates') @Roles('RECEPTION', 'MANAGER')
  dups(@CurrentUser() u: AuthUser, @Body() dto: UpdatePatientDto) { return this.svc.findDuplicates(u.tenantId, dto); }

  @Post('merge') @Roles('MANAGER')
  merge(@CurrentUser() u: AuthUser, @Body() dto: MergePatientsDto) { return this.svc.merge(u, dto); }

  @Get(':id') @Roles(...CLINICAL)
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.tenantId, id); }

  @Patch(':id') @Roles('RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto) { return this.svc.update(u, id, dto); }

  @Post(':id/client-registry/sync') @Roles('RECEPTION', 'CLAIMS_OFFICER')
  sync(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.syncFromRegistry(u, id); }

  @Get(':id/allergies') @Roles(...CLINICAL)
  allergies(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listAllergies(u.tenantId, id); }
  @Post(':id/allergies') @Roles('NURSE', 'TRIAGE_NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST')
  addAllergy(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AllergyDto) { return this.svc.addAllergy(u, id, dto); }
  @Delete(':id/allergies/:allergyId') @Roles('DOCTOR', 'CLINICAL_OFFICER')
  delAllergy(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('allergyId', ParseUUIDPipe) aid: string) { return this.svc.removeAllergy(u, id, aid); }

  @Get(':id/consents') @Roles(...CLINICAL)
  consents(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listConsents(u.tenantId, id); }
  @Post(':id/consents') @Roles('RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER')
  addConsent(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsentDto) { return this.svc.addConsent(u, id, dto); }

  @Get(':id/covers') @Roles(...CLINICAL)
  covers(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listCovers(u.tenantId, id); }
  @Post(':id/covers') @Roles('RECEPTION', 'CLAIMS_OFFICER', 'CASHIER')
  addCover(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CoverDto) { return this.svc.addCover(u, id, dto); }
  @Patch(':id/covers/:coverId') @Roles('RECEPTION', 'CLAIMS_OFFICER', 'CASHIER')
  updateCover(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('coverId', ParseUUIDPipe) cid: string, @Body() dto: UpdateCoverDto) { return this.svc.updateCover(u, id, cid, dto); }
}
