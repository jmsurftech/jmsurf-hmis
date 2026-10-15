import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export const CATEGORIES = ['CONSULTATION', 'LAB', 'IMAGING', 'PROCEDURE', 'BED', 'NURSING', 'THEATRE', 'PHARMACY', 'OTHER'];
export const PAYER_TYPES = ['CASH', 'SHA', 'INSURANCE', 'CORPORATE', 'STAFF'];

export class ServiceItemDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsIn(CATEGORIES) category: string;
  @IsOptional() @IsString() departmentType?: string;
  @IsInt() @Min(0) basePriceMinor: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) vatRate?: number;
  @IsOptional() @IsString() etimsItemCode?: string;
  @IsOptional() @IsString() shaInterventionCode?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateServiceItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(CATEGORIES) category?: string;
  @IsOptional() @IsString() departmentType?: string;
  @IsOptional() @IsInt() @Min(0) basePriceMinor?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) vatRate?: number;
  @IsOptional() @IsString() etimsItemCode?: string;
  @IsOptional() @IsString() shaInterventionCode?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ImportRowDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsIn(CATEGORIES) category?: string;
  /** Base price in MAJOR units (as typed in a spreadsheet), e.g. 1500.00 */
  @IsNumber() @Min(0) price: number;
  @IsOptional() @IsNumber() vatRate?: number;
  @IsOptional() @IsString() shaInterventionCode?: string;
  @IsOptional() @IsString() etimsItemCode?: string;
  @IsOptional() @IsString() departmentType?: string;
}
export class BulkImportDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows: ImportRowDto[];
  /** Optionally also write each price into this price list (price in major units, or `listPrice` per row). */
  @IsOptional() @IsString() priceListId?: string;
}

export class PriceListDto {
  @IsString() name: string;
  @IsIn(PAYER_TYPES) payerType: string;
  @IsOptional() @IsString() schemeId?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
export class UpdatePriceListDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(PAYER_TYPES) payerType?: string;
  @IsOptional() @IsString() schemeId?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
export class PriceListItemDto {
  @IsOptional() @IsString() serviceItemId?: string;
  @IsOptional() @IsString() stockItemId?: string;
  @IsInt() @Min(0) priceMinor: number;
}
export class PriceListItemsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceListItemDto) items: PriceListItemDto[];
}
