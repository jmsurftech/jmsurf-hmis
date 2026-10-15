import { IsDateString, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class HomeVisitDto {
  @IsUUID() patientId: string;
  /** User id of the provider (nurse/caregiver/physio). */
  @IsUUID() providerId: string;
  @IsIn(['NURSING', 'CAREGIVER', 'PHYSIO', 'COUNSELLING']) serviceType: string;
  @IsDateString() scheduledAt: string;
  @IsInt() @Min(0) feeMinor: number;
}
export class HomeVisitQuery {
  @IsOptional() @IsUUID() providerId?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
export class CheckInDto { @IsLatitude() lat: number; @IsLongitude() lng: number }
export class CheckOutDto {
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
  @IsOptional() @IsString() notes?: string;
}
export class ReasonDto { @IsString() reason: string }
