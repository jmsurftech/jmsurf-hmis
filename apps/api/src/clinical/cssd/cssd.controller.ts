import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { PageQueryDto } from '../shared/pagination';
import { CssdService } from './cssd.service';
import { BiDto, CycleDto, CycleResultDto, InstrumentSetDto, IssueSetDto, RecallDto, SetQuery } from './cssd.dto';

const R = ['NURSE', 'DOCTOR', 'STOREKEEPER'];
const Id = () => Param('id', ParseUUIDPipe);
@ApiTags('cssd') @ApiBearerAuth()
@Controller('cssd')
export class CssdController {
  constructor(private s: CssdService) {}
  @Get('sets') @Roles(...R) sets(@CurrentUser() u: AuthUser, @Query() q: SetQuery) { return this.s.listSets(u.tenantId, q); }
  @Post('sets') @Roles(...R) createSet(@CurrentUser() u: AuthUser, @Body() d: InstrumentSetDto) { return this.s.createSet(u, d); }
  @Get('sets/:id') @Roles(...R) set(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.getSet(u.tenantId, id); }
  @Post('sets/:id/issue') @Roles(...R) issue(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: IssueSetDto) { return this.s.issue(u, id, d); }
  @Post('sets/:id/return') @Roles(...R) ret(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.returnSet(u, id); }
  @Get('issues') @Roles(...R) issues(@CurrentUser() u: AuthUser, @Query() q: PageQueryDto) { return this.s.issues(u.tenantId, q); }
  @Get('cycles') @Roles(...R) cycles(@CurrentUser() u: AuthUser, @Query() q: PageQueryDto) { return this.s.listCycles(u.tenantId, q); }
  @Post('cycles') @Roles(...R) start(@CurrentUser() u: AuthUser, @Body() d: CycleDto) { return this.s.startCycle(u, d); }
  @Get('cycles/:id') @Roles(...R) cycle(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.recallReport(u.tenantId, id); }
  @Post('cycles/:id/complete') @Roles(...R) complete(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: CycleResultDto) { return this.s.completeCycle(u, id, d); }
  @Post('cycles/:id/biological') @Roles(...R) bi(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: BiDto) { return this.s.biResult(u, id, d); }
  @Post('cycles/:id/recall') @Roles('NURSE', 'DOCTOR') recall(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: RecallDto) { return this.s.recall(u, id, d); }
  @Get('patients/:patientId/trace') @Roles(...R) trace(@CurrentUser() u: AuthUser, @Param('patientId', ParseUUIDPipe) pid: string) { return this.s.patientTrace(u.tenantId, pid); }
}
