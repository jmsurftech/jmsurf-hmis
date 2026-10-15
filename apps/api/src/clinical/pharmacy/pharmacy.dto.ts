import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export class PrescriptionDto {
  @IsUUID() visitId: string;
  @IsUUID() itemId: string;
  @IsString() dose: string;
  @IsOptional() @IsString() route?: string;
  @IsString() frequency: string;
  @IsOptional() @IsInt() @Min(1) durationDays?: number;
  /** Units to dispense; computed from frequency × days when omitted. */
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() instructions?: string;
  /** Required to proceed when a HIGH severity allergy warning exists. */
  @IsOptional() @IsBoolean() overrideWarnings?: boolean;
  @IsOptional() @IsString() overrideReason?: string;
}
export class RxQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() visitId?: string;
  @IsOptional() @IsString() status?: string;
}
export class DispenseDto {
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsUUID() storeId?: string;
}
export class OtcLineDto {
  @IsUUID() itemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() instructions?: string;
}
export class OtcSaleDto {
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn(['CASH', 'INSURANCE', 'CORPORATE']) payerType?: string;
  @IsOptional() @IsUUID() schemeId?: string;
  @IsOptional() @IsUUID() storeId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OtcLineDto) items: OtcLineDto[];
}
export class ControlledRegisterQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsUUID() storeId?: string;
}
