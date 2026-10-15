import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { RehabService } from './rehab.service';
import { PlanQuery, PlanStatusDto, RehabPlanDto, RehabSessionDto } from './rehab.dto';

const R = ['DOCTOR', 'CLINICAL_OFFICER', 'NURSE'];
const Id = () => Param('id', ParseUUIDPipe);
@ApiTags('rehab') @ApiBearerAuth()
@Controller('rehab')
export class RehabController {
  constructor(private s: RehabService) {}
  @Get('plans') @Roles(...R) list(@CurrentUser() u: AuthUser, @Query() q: PlanQuery) { return this.s.list(u.tenantId, q); }
  @Post('plans') @Roles(...R) create(@CurrentUser() u: AuthUser, @Body() d: RehabPlanDto) { return this.s.createPlan(u, d); }
  @Get('plans/:id') @Roles(...R) get(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.get(u.tenantId, id); }
  @Post('plans/:id/sessions') @Roles(...R) session(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: RehabSessionDto) { return this.s.session(u, id, d); }
  @Post('plans/:id/status') @Roles(...R) status(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: PlanStatusDto) { return this.s.status(u, id, d); }
}
