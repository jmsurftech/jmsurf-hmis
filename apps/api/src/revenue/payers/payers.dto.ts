import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class PayerDto {
  @IsString() name: string;
  @IsIn(['SHA', 'INSURER', 'CORPORATE', 'GOVERNMENT']) type: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsIn(['sha-hie', 'smart', 'slade360', 'manual']) integration?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
export class UpdatePayerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsIn(['sha-hie', 'smart', 'slade360', 'manual']) integration?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
export class SchemeDto {
  @IsString() payerId: string;
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) copayPercent?: number;
  @IsOptional() @IsInt() @Min(0) annualLimitMinor?: number;
  @IsOptional() @IsInt() @Min(0) requiresPreauthAboveMinor?: number;
}
export class UpdateSchemeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) copayPercent?: number;
  @IsOptional() @IsInt() @Min(0) annualLimitMinor?: number;
  @IsOptional() @IsInt() @Min(0) requiresPreauthAboveMinor?: number;
}
export class ClientLookupDto {
  @IsString() idType: string;
  @IsString() idNumber: string;
  /** If given, the patient's crId / shaNumber are updated from the registry. */
  @IsOptional() @IsString() patientId?: string;
}
export class EligibilityDto {
  @IsString() patientId: string;
  @IsOptional() @IsString() visitId?: string;
}
