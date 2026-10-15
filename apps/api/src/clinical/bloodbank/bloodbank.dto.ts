import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';
import { COMPONENTS } from './bloodbank.rules';

const ABO = ['A', 'B', 'AB', 'O']; const RH = ['POS', 'NEG'];
export class DonorDto {
  @IsString() firstName: string; @IsString() lastName: string;
  @IsIn(['MALE', 'FEMALE']) sex: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsIn(ABO) abo?: string; @IsOptional() @IsIn(RH) rh?: string;
}
export class DeferDto { @IsString() reason: string; @IsOptional() @IsDateString() until?: string }
export class DonationDto {
  @IsUUID() donorId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(600) volumeMl?: number;
  @IsOptional() @Type(() => Number) @IsNumber() hbGdl?: number;
  @IsOptional() @Type(() => Number) @IsNumber() weightKg?: number;
  @IsOptional() @IsObject() ttiResults?: Record<string, string>;
  /** Components to separate (default WHOLE_BLOOD). */
  @IsOptional() @IsArray() @IsIn(COMPONENTS as unknown as string[], { each: true }) components?: string[];
  @IsOptional() @IsIn(ABO) abo?: string; @IsOptional() @IsIn(RH) rh?: string;
}
export class ScreeningDto {
  @IsIn(['NEG', 'POS', 'PENDING']) hiv: string; @IsIn(['NEG', 'POS', 'PENDING']) hbv: string;
  @IsIn(['NEG', 'POS', 'PENDING']) hcv: string; @IsIn(['NEG', 'POS', 'PENDING']) syphilis: string;
  @IsOptional() @IsIn(['NEG', 'POS', 'PENDING']) malaria?: string;
  @IsOptional() @IsIn(ABO) abo?: string; @IsOptional() @IsIn(RH) rh?: string;
}
export class UnitDto {
  @IsString() unitNumber: string; @IsIn(ABO) abo: string; @IsIn(RH) rh: string;
  @IsIn(COMPONENTS as unknown as string[]) component: string;
  @IsOptional() @Type(() => Number) @IsInt() volumeMl?: number;
  @IsOptional() @IsDateString() collectedAt?: string; @IsOptional() @IsDateString() expiresAt?: string;
}
export class UnitQuery extends PageQueryDto {
  @IsOptional() @IsString() status?: string; @IsOptional() @IsString() abo?: string; @IsOptional() @IsString() rh?: string; @IsOptional() @IsString() component?: string;
}
export class ExpiryQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(0) days?: number }
export class BloodRequestDto {
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() patientId?: string; @IsOptional() @IsUUID() visitId?: string;
  @IsIn(COMPONENTS as unknown as string[]) component: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) unitsRequested?: number;
  @IsOptional() @IsIn(['ROUTINE', 'URGENT', 'EMERGENCY']) urgency?: string;
  @IsOptional() @IsString() indication?: string;
}
export class RequestQuery extends PageQueryDto { @IsOptional() @IsString() status?: string; @IsOptional() @IsUUID() patientId?: string }
export class GroupingDto { @IsIn(ABO) abo: string; @IsIn(RH) rh: string; @IsOptional() @IsIn(['NEGATIVE', 'POSITIVE']) antibodyScreen?: string }
export class CrossmatchDto { @IsUUID() unitId: string; @IsOptional() @IsIn(['IS', 'IAT', 'ELECTRONIC']) method?: string; @IsOptional() @IsIn(['COMPATIBLE', 'INCOMPATIBLE']) result?: string }
export class IssueDto { @IsUUID() unitId: string }
export class TransfusionStartDto { @IsOptional() @IsObject() preVitals?: Record<string, unknown> }
export class TransfusionEndDto { @IsOptional() @IsObject() postVitals?: Record<string, unknown>; @IsOptional() @Type(() => Number) @IsInt() volumeMl?: number }
export class ReactionDto {
  @IsIn(['FEBRILE', 'ALLERGIC', 'HAEMOLYTIC', 'TACO', 'TRALI', 'ANAPHYLAXIS', 'OTHER']) reactionType: string;
  @IsIn(['MILD', 'MODERATE', 'SEVERE', 'FATAL']) reactionSeverity: string;
  @IsOptional() @IsString() reactionNotes?: string;
  @IsOptional() @IsBoolean() stopTransfusion?: boolean;
}
