import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export const FP_METHODS = ['PILLS_COC', 'PILLS_POP', 'INJECTABLE', 'IMPLANT', 'IUCD', 'CONDOMS', 'EC', 'BTL', 'VASECTOMY', 'NATURAL'];
export class FpDto {
  @IsUUID() patientId: string; @IsIn(FP_METHODS) method: string; @IsOptional() @IsIn(['NEW', 'REVISIT']) clientType?: string;
  @IsOptional() @IsDateString() visitDate?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(0) quantity?: number;
  @IsOptional() @IsBoolean() removal?: boolean; @IsOptional() @IsString() sideEffects?: string;
  @IsOptional() @IsDateString() nextVisitAt?: string; @IsOptional() @IsString() notes?: string;
}
export class ClinicQuery extends PageQueryDto { @IsOptional() @IsUUID() patientId?: string; @IsOptional() @IsString() method?: string; @IsOptional() @IsString() condition?: string }
export class NcdDto {
  @IsUUID() patientId: string; @IsIn(['HTN', 'DM', 'HTN_DM']) condition: string; @IsOptional() @IsDateString() visitAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() systolic?: number; @IsOptional() @Type(() => Number) @IsInt() diastolic?: number;
  @IsOptional() @Type(() => Number) @IsNumber() fbs?: number; @IsOptional() @Type(() => Number) @IsNumber() rbs?: number; @IsOptional() @Type(() => Number) @IsNumber() hba1c?: number;
  @IsOptional() @Type(() => Number) @IsNumber() weightKg?: number; @IsOptional() @IsString() medications?: string; @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() nextVisitAt?: string;
}
