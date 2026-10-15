import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export class AmbulanceDto { @IsString() regNumber: string; @IsOptional() @IsString() callSign?: string; @IsOptional() @IsIn(['BLS', 'ALS', 'TRANSPORT']) type?: string; @IsOptional() @Type(() => Number) @IsInt() odometerKm?: number }
export class AmbulanceStatusDto { @IsIn(['AVAILABLE', 'MAINTENANCE']) status: string }
export class TripDto {
  @IsString() pickupLocation: string; @IsOptional() @IsString() dropoffLocation?: string;
  @IsOptional() @IsString() callerName?: string; @IsOptional() @IsString() callerPhone?: string;
  @IsOptional() @IsUUID() patientId?: string; @IsOptional() @IsString() patientName?: string;
  @IsOptional() @IsIn(['ROUTINE', 'URGENT', 'EMERGENCY']) priority?: string; @IsOptional() @IsString() complaint?: string;
}
export class TripQuery extends PageQueryDto { @IsOptional() @IsString() status?: string }
export class DispatchDto { @IsUUID() ambulanceId: string; @IsOptional() @IsArray() @IsString({ each: true }) crew?: string[]; @IsOptional() @IsString() crewText?: string }
export class TripEventDto { @IsIn(['AT_SCENE', 'TRANSPORTING']) status: string; @IsOptional() @IsUUID() patientId?: string }
export class CompleteTripDto {
  @Type(() => Number) @IsInt() @Min(0) odometerEnd: number;
  @IsOptional() @IsString() dropoffLocation?: string; @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() patientId?: string; @IsOptional() @IsUUID() visitId?: string;
}
export class CancelTripDto { @IsOptional() @IsString() reason?: string }
export class TariffQuery { @Type(() => Number) @IsNumber() km: number }
