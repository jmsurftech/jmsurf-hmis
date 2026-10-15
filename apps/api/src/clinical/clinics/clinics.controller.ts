import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ClinicsService } from './clinics.service';
import { ClinicQuery, FpDto, NcdDto } from './clinics.dto';

const R = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE', 'TRIAGE_NURSE'];
@ApiTags('clinics') @ApiBearerAuth()
@Controller('clinics')
@Roles(...R)
export class ClinicsController {
  constructor(private s: ClinicsService) {}
  @Get('fp') fp(@CurrentUser() u: AuthUser, @Query() q: ClinicQuery) { return this.s.listFp(u.tenantId, q); }
  @Post('fp') addFp(@CurrentUser() u: AuthUser, @Body() d: FpDto) { return this.s.fp(u, d); }
  @Get('fp/summary') fpSummary(@CurrentUser() u: AuthUser) { return this.s.fpSummary(u.tenantId); }
  @Get('ncd') ncd(@CurrentUser() u: AuthUser, @Query() q: ClinicQuery) { return this.s.listNcd(u.tenantId, q); }
  @Post('ncd') addNcd(@CurrentUser() u: AuthUser, @Body() d: NcdDto) { return this.s.ncd(u, d); }
  @Get('ncd/patients/:patientId/trend') trend(@CurrentUser() u: AuthUser, @Param('patientId', ParseUUIDPipe) pid: string) { return this.s.ncdTrend(u.tenantId, pid); }
}
