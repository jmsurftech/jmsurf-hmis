import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ListQuery } from '../list-query';

export class BillListQuery extends ListQuery {
  @IsOptional() @IsIn(['OPEN', 'INTERIM', 'FINAL', 'PAID', 'PARTIALLY_PAID', 'VOID']) status?: string;
  @IsOptional() @IsString() visitId?: string;
}
export class ManualLineDto {
  @IsOptional() @IsString() serviceItemId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsInt() @Min(0) unitPriceMinor?: number;
}
export class VoidLineDto { @IsString() @MinLength(3) reason: string }
export class DiscountDto {
  @IsIn(['DISCOUNT', 'WAIVER']) type: 'DISCOUNT' | 'WAIVER';
  @IsOptional() @IsInt() @Min(0) amountMinor?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percent?: number;
  @IsString() @MinLength(3) reason: string;
}
export class FinalizeDto { @IsIn(['INTERIM', 'FINAL']) type: 'INTERIM' | 'FINAL'; @IsOptional() @IsString() buyerPin?: string }
export class FiscalSignDto { @IsOptional() @IsString() buyerPin?: string }
