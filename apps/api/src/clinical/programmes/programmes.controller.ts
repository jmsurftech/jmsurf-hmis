import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { ProgrammesService } from './programmes.service';
import { AppointmentDto, DotDto, HivEnrolDto, HivQuery, HivUpdateDto, OutcomeDto, PhaseDto, RegimenDto, TbCaseDto, TbQuery, TracingDto, ViralLoadDto } from './programmes.dto';

/** Sensitive programme data: clinician roles only (ADMIN passes the guard but every access is audited). */
const CLIN = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'];
const Id = () => Param('id', ParseUUIDPipe);
@ApiTags('programmes') @ApiBearerAuth()
@Controller('programmes')
@Roles(...CLIN)
export class ProgrammesController {
  constructor(private s: ProgrammesService) {}
  @Get('hiv') hiv(@CurrentUser() u: AuthUser, @Query() q: HivQuery) { return this.s.listHiv(u, q); }
  @Post('hiv') enrol(@CurrentUser() u: AuthUser, @Body() d: HivEnrolDto) { return this.s.enrol(u, d); }
  @Get('hiv/defaulters') defaulters(@CurrentUser() u: AuthUser) { return this.s.defaulters(u); }
  @Get('hiv/cascade') cascade(@CurrentUser() u: AuthUser) { return this.s.cascade(u); }
  @Get('hiv/export') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="nascop-art-line-list.csv"') export(@CurrentUser() u: AuthUser) { return this.s.exportLineList(u); }
  @Get('hiv/:id') getHiv(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.getHiv(u, id); }
  @Patch('hiv/:id') update(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: HivUpdateDto) { return this.s.updateHiv(u, id, d); }
  @Post('hiv/:id/regimens') regimen(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: RegimenDto) { return this.s.changeRegimen(u, id, d); }
  @Post('hiv/:id/viral-loads') vl(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: ViralLoadDto) { return this.s.addViralLoad(u, id, d); }
  @Post('hiv/:id/appointments') appt(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: AppointmentDto) { return this.s.addAppointment(u, id, d); }
  @Post('hiv/appointments/:id/attend') attend(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.attend(u, id); }
  @Post('hiv/appointments/:id/tracing') trace(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: TracingDto) { return this.s.trace(u, id, d); }
  @Get('tb') tb(@CurrentUser() u: AuthUser, @Query() q: TbQuery) { return this.s.listTb(u, q); }
  @Post('tb') registerTb(@CurrentUser() u: AuthUser, @Body() d: TbCaseDto) { return this.s.registerTb(u, d); }
  @Get('tb/:id') getTb(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.getTb(u, id); }
  @Post('tb/:id/dot') dot(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: DotDto) { return this.s.dot(u, id, d); }
  @Post('tb/:id/phase') phase(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: PhaseDto) { return this.s.phase(u, id, d); }
  @Post('tb/:id/outcome') outcome(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: OutcomeDto) { return this.s.outcome(u, id, d); }
}
