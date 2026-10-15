import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { MaternityService } from './maternity.service';
import { AncVisitDto, DeliveryDto, GiveImmunizationDto, ImmunizationScheduleDto, PatientRefQuery, PregnancyDto, PregnancyQuery, UpdatePregnancyDto } from './maternity.dto';

const MCH = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER'];

@ApiTags('maternity') @ApiBearerAuth()
@Controller('maternity')
export class MaternityController {
  constructor(private svc: MaternityService) {}
  @Post('pregnancies') @Roles(...MCH) create(@CurrentUser() u: AuthUser, @Body() dto: PregnancyDto) { return this.svc.createPregnancy(u, dto); }
  @Get('pregnancies') @Roles(...MCH) list(@CurrentUser() u: AuthUser, @Query() q: PregnancyQuery) { return this.svc.list(u.tenantId, q); }
  @Get('pregnancies/:id') @Roles(...MCH) get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.tenantId, id); }
  @Patch('pregnancies/:id') @Roles(...MCH) update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePregnancyDto) { return this.svc.update(u, id, dto); }
  @Post('pregnancies/:id/anc-visits') @Roles(...MCH) anc(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AncVisitDto) { return this.svc.addAncVisit(u, id, dto); }
  @Post('pregnancies/:id/delivery') @Roles(...MCH) deliver(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliveryDto) { return this.svc.recordDelivery(u, id, dto); }

  @Post('immunizations/schedule') @Roles(...MCH) schedule(@CurrentUser() u: AuthUser, @Body() dto: ImmunizationScheduleDto) { return this.svc.generateSchedule(u, dto.patientId); }
  @Get('immunizations') @Roles(...MCH, 'RECEPTION') immunizations(@CurrentUser() u: AuthUser, @Query() q: PatientRefQuery) { return this.svc.listImmunizations(u.tenantId, q.patientId); }
  @Get('immunizations/defaulters') @Roles(...MCH, 'MANAGER') defaulters(@CurrentUser() u: AuthUser) { return this.svc.defaulters(u.tenantId); }
  @Post('immunizations/:id/give') @Roles('NURSE', 'CLINICAL_OFFICER') give(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GiveImmunizationDto) { return this.svc.give(u, id, dto); }
}
