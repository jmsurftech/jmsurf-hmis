import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { DialysisService } from './dialysis.service';
import { CompleteSessionDto, RecurringDto, SessionDto, SessionQuery, StartSessionDto } from './dialysis.dto';

const R = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER'];

@ApiTags('dialysis') @ApiBearerAuth()
@Controller('dialysis')
export class DialysisController {
  constructor(private svc: DialysisService) {}
  @Post('sessions') @Roles(...R, 'RECEPTION') create(@CurrentUser() u: AuthUser, @Body() dto: SessionDto) { return this.svc.create(u, dto); }
  @Post('sessions/recurring') @Roles(...R, 'RECEPTION') recurring(@CurrentUser() u: AuthUser, @Body() dto: RecurringDto) { return this.svc.createRecurring(u, dto); }
  @Get('sessions') @Roles(...R, 'RECEPTION') list(@CurrentUser() u: AuthUser, @Query() q: SessionQuery) { return this.svc.list(u.tenantId, q); }
  @Post('sessions/:id/start') @Roles(...R) start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartSessionDto) { return this.svc.start(u, id, dto); }
  @Post('sessions/:id/complete') @Roles(...R) complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteSessionDto) { return this.svc.complete(u, id, dto); }
  @Post('sessions/:id/cancel') @Roles(...R, 'RECEPTION') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(u, id); }
  @Get('patients/:patientId/adequacy') @Roles(...R) adequacy(@CurrentUser() u: AuthUser, @Param('patientId', ParseUUIDPipe) pid: string) { return this.svc.adequacyTrend(u.tenantId, pid); }
}
