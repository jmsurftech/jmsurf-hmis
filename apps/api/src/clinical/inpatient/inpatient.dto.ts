import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export const WARD_TYPES = ['GENERAL', 'MATERNITY', 'PAEDIATRIC', 'ICU', 'HDU', 'NBU', 'PRIVATE', 'ISOLATION', 'SURGICAL'];
export class WardDto {
  @IsString() name: string;
  @IsOptional() @IsIn(WARD_TYPES) type?: string;
  @IsOptional() @IsUUID() dailyRateServiceId?: string;
  @IsOptional() @IsUUID() facilityId?: string;
}
export class UpdateWardDto extends PartialType(WardDto) {}
export class BedDto {
  @IsString() label: string;
}
export class BedStatusDto {
  @IsIn(['AVAILABLE', 'CLEANING', 'MAINTENANCE', 'RESERVED']) status: string;
}
export class BedBoardQuery { @IsOptional() @IsUUID() wardId?: string; @IsOptional() @IsUUID() facilityId?: string }

export class AdmitDto {
  /** Existing visit to admit from (OPD/A&E). If omitted, a new IPD visit is opened for patientId. */
  @IsOptional() @IsUUID() visitId?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsIn(['CASH', 'SHA', 'INSURANCE', 'CORPORATE', 'WAIVER']) payerType?: string;
  @IsOptional() @IsUUID() schemeId?: string;
  @IsUUID() wardId: string;
  @IsOptional() @IsUUID() bedId?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsInt() @Min(0) depositMinor?: number;
}
export class TransferBedDto {
  @IsUUID() wardId: string;
  @IsOptional() @IsUUID() bedId?: string;
  @IsOptional() @IsString() reason?: string;
}
export class DischargeDto {
  @IsString() summary: string;
  @IsOptional() @IsIn(['NORMAL', 'AMA', 'REFERRED', 'ABSCONDED', 'DECEASED']) dischargeType?: string;
}
export class ScheduleMarDto {
  @IsUUID() prescriptionId: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsInt() @Min(1) days?: number;
}
export class MarActionDto {
  @IsIn(['GIVEN', 'MISSED', 'REFUSED', 'HELD']) status: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() givenAt?: string;
}
export class AdmissionQuery { @IsOptional() @IsUUID() wardId?: string; @IsOptional() @IsIn(['ACTIVE', 'DISCHARGED']) state?: string }
