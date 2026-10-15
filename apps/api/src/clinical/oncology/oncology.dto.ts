import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export class ProtocolDrugDto {
  @IsString() drug: string; @Type(() => Number) @IsNumber() @Min(0) dose: number;
  @IsIn(['mg/m2', 'mg/kg', 'mg', 'units/m2']) unit: 'mg/m2' | 'mg/kg' | 'mg' | 'units/m2';
  @IsOptional() @IsString() route?: string; @IsOptional() @IsArray() @IsInt({ each: true }) days?: number[];
  @IsOptional() @Type(() => Number) @IsNumber() maxDose?: number;
}
export class ProtocolDto {
  @IsString() code: string; @IsString() name: string; @IsOptional() @IsString() indication?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(52) cycles: number; @Type(() => Number) @IsInt() @Min(1) intervalDays: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProtocolDrugDto) drugs: ProtocolDrugDto[];
}
export class BsaQuery { @Type(() => Number) @IsNumber() heightCm: number; @Type(() => Number) @IsNumber() weightKg: number }
export class RegimenStartDto {
  @IsUUID() patientId: string; @IsUUID() protocolId: string;
  @Type(() => Number) @IsNumber() heightCm: number; @Type(() => Number) @IsNumber() weightKg: number;
  @IsDateString() startDate: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(150) doseModPct?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cycles?: number;
}
export class RegimenQuery extends PageQueryDto { @IsOptional() @IsString() status?: string; @IsOptional() @IsUUID() patientId?: string }
export class GivenDoseDto { @IsString() drug: string; @Type(() => Number) @IsNumber() dose: number; @IsOptional() @IsString() unit?: string; @IsOptional() @IsString() route?: string }
export class AdministerDto {
  @IsOptional() @Type(() => Number) @IsNumber() weightKg?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GivenDoseDto) givenDoses?: GivenDoseDto[];
  @IsOptional() @IsString() notes?: string; @IsOptional() @IsUUID() visitId?: string;
}
export class DelayDto { @IsDateString() newDate: string; @IsOptional() @IsString() reason?: string; @IsOptional() @IsBoolean() shiftFollowing?: boolean }
