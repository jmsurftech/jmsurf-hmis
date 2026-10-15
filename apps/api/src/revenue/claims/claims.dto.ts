import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ListQuery } from '../list-query';

export const CLAIM_STATUSES = ['DRAFT', 'VALIDATED', 'PREAUTH_PENDING', 'SUBMITTED', 'IN_REVIEW', 'QUERIED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'RECONCILED'];

export class ClaimListQuery extends ListQuery {
  @IsOptional() @IsIn(CLAIM_STATUSES) status?: string;
  @IsOptional() @IsString() payerId?: string;
}
export class BuildClaimDto { @IsString() billId: string }
export class ClaimNoteDto { @IsOptional() @IsString() note?: string }
export class ManualStatusDto {
  @IsIn(CLAIM_STATUSES) status: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsInt() @Min(0) approvedMinor?: number;
  @IsOptional() @IsString() rejectionReason?: string;
}
export class RemittanceLineDto {
  @IsOptional() @IsString() claimNumber?: string;
  @IsOptional() @IsString() externalRef?: string;
  @IsInt() @Min(0) amountMinor: number;
}
export class RemittanceDto {
  @IsString() payerId: string;
  @IsString() reference: string;
  @IsDateString() paidAt: string;
  @IsOptional() @IsInt() @Min(0) amountMinor?: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RemittanceLineDto) lines: RemittanceLineDto[];
}
export class PreAuthDto {
  @IsString() visitId: string;
  @IsOptional() @IsString() payerId?: string;
  @IsOptional() @IsString() interventionCode?: string;
  @IsString() description: string;
  @IsInt() @Min(0) amountMinor: number;
}
export class UpdatePreAuthDto {
  @IsOptional() @IsString() interventionCode?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) amountMinor?: number;
  @IsOptional() @IsIn(['APPROVED', 'REJECTED', 'EXPIRED']) status?: string; // manual capture of an offline decision
  @IsOptional() @IsInt() @Min(0) approvedMinor?: number;
  @IsOptional() @IsString() externalRef?: string;
}
export class PreAuthListQuery extends ListQuery {
  @IsOptional() @IsString() visitId?: string;
  @IsOptional() @IsString() status?: string;
}
