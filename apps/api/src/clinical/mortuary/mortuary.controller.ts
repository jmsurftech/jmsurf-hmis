import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { MortuaryService } from './mortuary.service';
import { AssignCompartmentDto, BodyAdmissionDto, CaseQuery, CompartmentDto, CompartmentStatusDto, PmReportDto, PmRequestDto, ReleaseDto } from './mortuary.dto';

const R = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'RECEPTION'];
const Id = () => Param('id', ParseUUIDPipe);
@ApiTags('mortuary') @ApiBearerAuth()
@Controller('mortuary')
export class MortuaryController {
  constructor(private s: MortuaryService) {}
  @Get('compartments') @Roles(...R) compartments(@CurrentUser() u: AuthUser) { return this.s.compartments(u.tenantId); }
  @Post('compartments') @Roles('ADMIN', 'MANAGER') createCompartment(@CurrentUser() u: AuthUser, @Body() d: CompartmentDto) { return this.s.createCompartment(u, d); }
  @Post('compartments/:id/status') @Roles(...R) compartmentStatus(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: CompartmentStatusDto) { return this.s.compartmentStatus(u, id, d); }
  @Get('cases') @Roles(...R, 'CASHIER') list(@CurrentUser() u: AuthUser, @Query() q: CaseQuery) { return this.s.list(u.tenantId, q); }
  @Post('cases') @Roles(...R) admit(@CurrentUser() u: AuthUser, @Body() d: BodyAdmissionDto) { return this.s.admit(u, d); }
  @Get('cases/:id') @Roles(...R, 'CASHIER') get(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.get(u.tenantId, id); }
  @Post('cases/:id/compartment') @Roles(...R) assign(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: AssignCompartmentDto) { return this.s.assign(u, id, d); }
  @Post('cases/:id/post-mortem') @Roles('DOCTOR', 'CLINICAL_OFFICER') pm(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: PmRequestDto) { return this.s.requestPm(u, id, d); }
  @Post('cases/:id/post-mortem/report') @Roles('DOCTOR') pmReport(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: PmReportDto) { return this.s.pmReport(u, id, d); }
  @Post('cases/:id/release') @Roles(...R) release(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: ReleaseDto) { return this.s.release(u, id, d); }
  @Post('run-charges') @Roles('ADMIN', 'MANAGER') run(@CurrentUser() u: AuthUser) { return this.s.runDailyCharges(u.tenantId); }
}
