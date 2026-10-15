import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../shared/pagination';

export const ID_TYPES = ['NATIONAL_ID', 'PASSPORT', 'BIRTH_CERT', 'MAISHA_NAMBA', 'ALIEN_ID', 'REFUGEE_ID'];
export enum SexDto { MALE = 'MALE', FEMALE = 'FEMALE', INTERSEX = 'INTERSEX', UNKNOWN = 'UNKNOWN' }

export class NextOfKinDto {
  @IsString() name: string;
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsString() phone?: string;
}

export class UpdatePatientDto {
  @IsOptional() @IsString() crId?: string;
  @IsOptional() @IsString() shaNumber?: string;
  @IsOptional() @IsIn(ID_TYPES) idType?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() @MinLength(1) firstName?: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() @MinLength(1) lastName?: string;
  @IsOptional() @IsEnum(SexDto) sex?: SexDto;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() county?: string;
  @IsOptional() @IsString() subCounty?: string;
  @IsOptional() @IsString() village?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => NextOfKinDto) nextOfKin?: NextOfKinDto[];
}

export class CreatePatientDto extends UpdatePatientDto {
  @IsString() @MinLength(1) declare firstName: string;
  @IsString() @MinLength(1) declare lastName: string;
  @IsEnum(SexDto) declare sex: SexDto;
  /** Skip duplicate warning and register anyway. */
  @IsOptional() @IsBoolean() force?: boolean;
}

export class SearchPatientsDto extends PageQueryDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() mrn?: string;
}

export class MergePatientsDto {
  @IsUUID() survivorId: string;
  @IsUUID() duplicateId: string;
}

export class AllergyDto {
  @IsString() substance: string;
  @IsOptional() @IsString() reaction?: string;
  @IsOptional() @IsIn(['MILD', 'MODERATE', 'SEVERE']) severity?: string;
}

export class ConsentDto {
  @IsIn(['DATA_SHARING_HIE', 'SMS', 'RESEARCH', 'PROCEDURE', 'TREATMENT']) scope: string;
  @IsBoolean() granted: boolean;
  @IsOptional() @IsIn(['OTP', 'SIGNATURE', 'VERBAL']) method?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CoverDto {
  @IsUUID() schemeId: string;
  @IsString() memberNumber: string;
  @IsOptional() @IsString() principalName?: string;
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ClientRegistryLookupDto {
  @IsIn(ID_TYPES) idType: string;
  @IsString() idNumber: string;
}

export class UpdateCoverDto extends PartialType(CoverDto) {}
