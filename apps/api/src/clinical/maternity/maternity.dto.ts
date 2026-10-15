import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class PregnancyDto {
  @IsUUID() patientId: string;
  @IsOptional() @IsDateString() lmp?: string;
  @IsOptional() @IsDateString() edd?: string;
  @IsOptional() @IsInt() @Min(1) gravida?: number;
  @IsOptional() @IsInt() @Min(0) parity?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) riskFlags?: string[];
}
export class UpdatePregnancyDto {
  @IsOptional() @IsDateString() lmp?: string;
  @IsOptional() @IsDateString() edd?: string;
  @IsOptional() @IsInt() gravida?: number;
  @IsOptional() @IsInt() parity?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) riskFlags?: string[];
  @IsOptional() @IsIn(['ACTIVE', 'DELIVERED', 'LOST']) status?: string;
}
export class PregnancyQuery { @IsOptional() @IsUUID() patientId?: string; @IsOptional() @IsString() status?: string }

export class AncVisitDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsUUID() visitId?: string;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsInt() systolic?: number;
  @IsOptional() @IsInt() diastolic?: number;
  @IsOptional() @IsNumber() fundalHeightCm?: number;
  @IsOptional() @IsInt() fetalHeartRate?: number;
  @IsOptional() @IsString() presentation?: string;
  @IsOptional() @IsNumber() hb?: number;
  @IsOptional() @IsString() urineProtein?: string;
  @IsOptional() @IsString() notes?: string;
}

export class BabyDto {
  @IsIn(['MALE', 'FEMALE', 'INTERSEX', 'UNKNOWN']) sex: string;
  @IsOptional() @IsNumber() @Min(0.2) @Max(7) weightKg?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) apgar1?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) apgar5?: number;
  @IsOptional() @IsBoolean() alive?: boolean;
  @IsOptional() @IsString() firstName?: string;
}
export class DeliveryDto {
  @IsUUID() visitId: string;
  @IsDateString() deliveredAt: string;
  @IsIn(['SVD', 'CS', 'ASSISTED', 'BREECH']) mode: string;
  @IsString() outcome: string;
  @IsOptional() @IsObject() partograph?: Record<string, unknown>;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BabyDto) babies: BabyDto[];
}
export class ImmunizationScheduleDto { @IsUUID() patientId: string }
export class GiveImmunizationDto { @IsOptional() @IsString() batch?: string; @IsOptional() @IsDateString() givenAt?: string }
export class PatientRefQuery { @IsUUID() patientId: string }
