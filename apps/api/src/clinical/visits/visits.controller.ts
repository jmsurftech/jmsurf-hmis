import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth-user';
import { VisitsService } from './visits.service';
import { QueueService } from './queue.service';
import { AppointmentsService } from './appointments.service';
import { BoardQueryDto, CalendarQueryDto, CallNextDto, CheckInDto, CreateAppointmentDto, CreateTicketDto, OpenVisitDto, TicketDoneDto, UpdateAppointmentDto, UpdateVisitDto, VisitQueryDto } from './visits.dto';

const FRONT = ['RECEPTION', 'TRIAGE_NURSE', 'NURSE', 'DOCTOR', 'CLINICAL_OFFICER'];
const ALL = [...FRONT, 'LAB_TECH', 'RADIOGRAPHER', 'PHARMACIST', 'CASHIER', 'CLAIMS_OFFICER'];

@ApiTags('visits') @ApiBearerAuth()
@Controller('visits')
export class VisitsController {
  constructor(private svc: VisitsService) {}
  @Post() @Roles(...FRONT) open(@CurrentUser() u: AuthUser, @Body() dto: OpenVisitDto) { return this.svc.open(u, dto); }
  @Get() @Roles(...ALL) list(@CurrentUser() u: AuthUser, @Query() q: VisitQueryDto) { return this.svc.list(u.tenantId, q); }
  @Get(':id') @Roles(...ALL) get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') @Roles(...FRONT) update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVisitDto) { return this.svc.update(u, id, dto); }
  @Post(':id/close') @Roles('DOCTOR', 'CLINICAL_OFFICER', 'RECEPTION', 'NURSE') close(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.close(u, id); }
  @Post(':id/eligibility') @Roles('RECEPTION', 'CLAIMS_OFFICER', 'CASHIER') elig(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.checkEligibility(u, id); }
}

@ApiTags('queue') @ApiBearerAuth()
@Controller('queue')
export class QueueController {
  constructor(private svc: QueueService) {}
  @Post('tickets') @Roles(...ALL) create(@CurrentUser() u: AuthUser, @Body() dto: CreateTicketDto) { return this.svc.create(u, dto); }
  @Post('call-next') @Roles(...ALL) next(@CurrentUser() u: AuthUser, @Body() dto: CallNextDto) { return this.svc.callNext(u, dto); }
  @Post('tickets/:id/serve') @Roles(...ALL) serve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.serve(u, id); }
  @Post('tickets/:id/done') @Roles(...ALL) done(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketDoneDto) { return this.svc.done(u, id, dto.nextServicePoint); }
  @Post('tickets/:id/skip') @Roles(...ALL) skip(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.skip(u, id); }
  @Post('tickets/:id/requeue') @Roles(...ALL) requeue(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.requeue(u, id); }
  @Get('board') @Roles(...ALL) board(@CurrentUser() u: AuthUser, @Query() q: BoardQueryDto) { return this.svc.board(u, q); }
}

@ApiTags('appointments') @ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private svc: AppointmentsService) {}
  @Post() @Roles(...FRONT) create(@CurrentUser() u: AuthUser, @Body() dto: CreateAppointmentDto) { return this.svc.create(u, dto); }
  @Get() @Roles(...FRONT) calendar(@CurrentUser() u: AuthUser, @Query() q: CalendarQueryDto) { return this.svc.calendar(u, q); }
  @Post('mark-no-shows') @Roles('RECEPTION', 'MANAGER') noShows(@CurrentUser() u: AuthUser) { return this.svc.markNoShows(u); }
  @Get(':id') @Roles(...FRONT) get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.tenantId, id); }
  @Patch(':id') @Roles(...FRONT) update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAppointmentDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @Roles(...FRONT) cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(u, id); }
  @Post(':id/check-in') @Roles('RECEPTION', 'NURSE') checkIn(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckInDto) { return this.svc.checkIn(u, id, dto); }
}
