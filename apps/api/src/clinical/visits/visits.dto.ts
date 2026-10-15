import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PageQueryDto } from '../shared/pagination';

export enum VisitTypeDto { OPD = 'OPD', IPD = 'IPD', EMERGENCY = 'EMERGENCY', WALK_IN = 'WALK_IN', REFERRAL = 'REFERRAL', TELEMEDICINE = 'TELEMEDICINE', OUTREACH = 'OUTREACH', HOME_CARE = 'HOME_CARE' }
export const PAYER_TYPES = ['CASH', 'SHA', 'INSURANCE', 'CORPORATE', 'WAIVER'];
export const SERVICE_POINTS = ['REGISTRATION', 'TRIAGE', 'CONSULTATION', 'LAB', 'PHARMACY', 'CASHIER', 'RADIOLOGY', 'DENTAL', 'EYE', 'MATERNITY', 'DIALYSIS', 'THEATRE', 'PROCEDURE'];

export class OpenVisitDto {
  @IsUUID() patientId: string;
  @IsOptional() @IsEnum(VisitTypeDto) type?: VisitTypeDto;
  @IsOptional() @IsIn(PAYER_TYPES) payerType?: string;
  @IsOptional() @IsUUID() schemeId?: string;
  @IsOptional() @IsUUID() coverId?: string;
  @IsOptional() @IsUUID() facilityId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() practitionerId?: string;
  /** Queue the patient at this service point on open (default TRIAGE for OPD/EMERGENCY). Pass NONE to skip. */
  @IsOptional() @IsString() queueAt?: string;
  @IsOptional() @IsBoolean() skipConsultationFee?: boolean;
}

export class VisitQueryDto extends PageQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsEnum(VisitTypeDto) type?: VisitTypeDto;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsUUID() facilityId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class UpdateVisitDto {
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() practitionerId?: string;
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']) status?: string;
}

export class CreateTicketDto {
  @IsUUID() visitId: string;
  @IsIn(SERVICE_POINTS) servicePoint: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) priority?: number;
}

export class CallNextDto {
  @IsIn(SERVICE_POINTS) servicePoint: string;
  @IsOptional() @IsUUID() facilityId?: string;
}

export class TicketDoneDto {
  /** Route the patient onward to another service point. */
  @IsOptional() @IsIn(SERVICE_POINTS) nextServicePoint?: string;
}

export class BoardQueryDto {
  @IsOptional() @IsIn(SERVICE_POINTS) servicePoint?: string;
  @IsOptional() @IsUUID() facilityId?: string;
}

export class CreateAppointmentDto {
  @IsUUID() patientId: string;
  @IsOptional() @IsUUID() practitionerId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() facilityId?: string;
  @IsDateString() startAt: string;
  @IsDateString() endAt: string;
  @IsOptional() @IsIn(['IN_PERSON', 'TELEMEDICINE', 'HOME']) mode?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() meetingUrl?: string;
}
export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @IsOptional() @IsIn(['BOOKED', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED', 'DONE']) status?: string;
}
export class CalendarQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() practitionerId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() facilityId?: string;
  @IsOptional() @IsString() status?: string;
}
export class CheckInDto {
  @IsOptional() @IsIn(PAYER_TYPES) payerType?: string;
  @IsOptional() @IsUUID() schemeId?: string;
  @IsOptional() @IsUUID() coverId?: string;
}
