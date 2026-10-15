import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { TheatreService, WHO_CHECKLIST } from './theatre.service';
import { AnaesthesiaDto, BookingDto, ChecklistDto, ClashQuery, CompleteDto, ConsumablesDto, OpNoteDto, RescheduleDto, ScheduleQuery } from './theatre.dto';

const TH = ['DOCTOR', 'NURSE', 'CLINICAL_OFFICER'];

@ApiTags('theatre') @ApiBearerAuth()
@Controller('theatre')
export class TheatreController {
  constructor(private svc: TheatreService) {}
  @Get('checklist-template') template() { return WHO_CHECKLIST; }
  @Get('clash-check') @Roles(...TH, 'RECEPTION') clash(@CurrentUser() u: AuthUser, @Query() q: ClashQuery) { return this.svc.checkClash(u, q); }
  @Post('bookings') @Roles('DOCTOR', 'NURSE') book(@CurrentUser() u: AuthUser, @Body() dto: BookingDto) { return this.svc.book(u, dto); }
  @Get('bookings') @Roles(...TH) schedule(@CurrentUser() u: AuthUser, @Query() q: ScheduleQuery) { return this.svc.schedule(u.tenantId, q); }
  @Get('bookings/:id') @Roles(...TH) get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.tenantId, id); }
  @Patch('bookings/:id') @Roles('DOCTOR', 'NURSE') reschedule(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleDto) { return this.svc.reschedule(u, id, dto); }
  @Post('bookings/:id/cancel') @Roles('DOCTOR') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(u, id); }
  @Put('bookings/:id/checklist') @Roles(...TH) checklist(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChecklistDto) { return this.svc.checklist(u, id, dto); }
  @Post('bookings/:id/start') @Roles('DOCTOR', 'NURSE') start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.start(u, id); }
  @Put('bookings/:id/anaesthesia') @Roles('DOCTOR', 'CLINICAL_OFFICER') anaesthesia(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnaesthesiaDto) { return this.svc.anaesthesia(u, id, dto); }
  @Post('bookings/:id/op-note') @Roles('DOCTOR') opNote(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OpNoteDto) { return this.svc.opNote(u, id, dto); }
  @Post('bookings/:id/consumables') @Roles('NURSE', 'DOCTOR') consumables(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsumablesDto) { return this.svc.consumables(u, id, dto); }
  @Post('bookings/:id/complete') @Roles('DOCTOR') complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteDto) { return this.svc.complete(u, id, dto); }
}
