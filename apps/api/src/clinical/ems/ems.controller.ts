import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { EmsService } from './ems.service';
import { AmbulanceDto, AmbulanceStatusDto, CancelTripDto, CompleteTripDto, DispatchDto, TripDto, TripEventDto, TripQuery } from './ems.dto';

const R = ['RECEPTION', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'TRIAGE_NURSE'];
const Id = () => Param('id', ParseUUIDPipe);
@ApiTags('ems') @ApiBearerAuth()
@Controller('ems')
export class EmsController {
  constructor(private s: EmsService) {}
  @Get('ambulances') @Roles(...R) fleet(@CurrentUser() u: AuthUser) { return this.s.fleet(u.tenantId); }
  @Post('ambulances') @Roles('ADMIN', 'MANAGER') add(@CurrentUser() u: AuthUser, @Body() d: AmbulanceDto) { return this.s.addAmbulance(u, d); }
  @Post('ambulances/:id/status') @Roles(...R) status(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: AmbulanceStatusDto) { return this.s.ambulanceStatus(u, id, d); }
  @Get('trips') @Roles(...R, 'CASHIER') list(@CurrentUser() u: AuthUser, @Query() q: TripQuery) { return this.s.list(u.tenantId, q); }
  @Post('trips') @Roles(...R) request(@CurrentUser() u: AuthUser, @Body() d: TripDto) { return this.s.request(u, d); }
  @Get('trips/:id') @Roles(...R, 'CASHIER') get(@CurrentUser() u: AuthUser, @Id() id: string) { return this.s.get(u.tenantId, id); }
  @Post('trips/:id/dispatch') @Roles(...R) dispatch(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: DispatchDto) { return this.s.dispatch(u, id, d); }
  @Post('trips/:id/event') @Roles(...R) event(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: TripEventDto) { return this.s.event(u, id, d); }
  @Post('trips/:id/complete') @Roles(...R) complete(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: CompleteTripDto) { return this.s.complete(u, id, d); }
  @Post('trips/:id/cancel') @Roles(...R) cancel(@CurrentUser() u: AuthUser, @Id() id: string, @Body() d: CancelTripDto) { return this.s.cancel(u, id, d); }
}
