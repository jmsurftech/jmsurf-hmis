import { IsIn, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { ListQuery } from '../list-query';

export class ReceiptDto {
  @IsString() billId: string;
  @IsIn(['CASH', 'CARD', 'BANK', 'CHEQUE', 'MPESA', 'AIRTEL', 'MOMO']) method: string;
  @IsInt() @Min(1) amountMinor: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() phone?: string;
}
export class StkDto {
  @IsString() billId: string;
  @Matches(/^(\+?254|0)?[17]\d{8}$/, { message: 'phone must be a Kenyan mobile number' }) phone: string;
  /** Defaults to the outstanding patient balance. */
  @IsOptional() @IsInt() @Min(100) amountMinor?: number;
}
export class RefundDto {
  @IsOptional() @IsInt() @Min(1) amountMinor?: number;
  @IsString() @MinLength(3) reason: string;
}
export class PaymentListQuery extends ListQuery {
  @IsOptional() @IsString() billId?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() shiftId?: string;
}
export class OpenShiftDto { @IsOptional() @IsInt() @Min(0) openingFloat?: number }
export class CloseShiftDto { @IsInt() @Min(0) declaredCash: number; @IsOptional() @IsString() note?: string }
