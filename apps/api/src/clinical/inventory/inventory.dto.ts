import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, NotEquals, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PageQueryDto } from '../shared/pagination';

export class StoreDto {
  @IsString() name: string;
  @IsOptional() @IsIn(['MAIN', 'PHARMACY', 'WARD', 'LAB', 'THEATRE']) type?: string;
  @IsOptional() @IsUUID() facilityId?: string;
}

export class StockItemDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() genericName?: string;
  @IsOptional() @IsString() form?: string;
  @IsOptional() @IsString() strength?: string;
  @IsOptional() @IsIn(['DRUG', 'CONSUMABLE', 'REAGENT', 'NON_MEDICAL', 'IMPLANT']) category?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() isControlled?: boolean;
  @IsOptional() @IsInt() @Min(0) reorderLevel?: number;
  @IsOptional() @IsInt() @Min(0) sellPriceMinor?: number;
  @IsOptional() @IsNumber() @Min(0) vatRate?: number;
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsString() etimsItemCode?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateStockItemDto extends PartialType(StockItemDto) {}
export class ItemQueryDto extends PageQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() barcode?: string;
}

export class GrnLineDto {
  @IsUUID() itemId: string;
  @IsString() batchNo: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsInt() @Min(0) unitCostMinor?: number;
}
export class ReceiveStockDto {
  @IsUUID() storeId: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsOptional() @IsString() reference?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => GrnLineDto) lines: GrnLineDto[];
}

export class TransferLineDto {
  @IsUUID() itemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsUUID() batchId?: string;
}
export class TransferDto {
  @IsUUID() fromStoreId: string;
  @IsUUID() toStoreId: string;
  @IsOptional() @IsString() reference?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TransferLineDto) lines: TransferLineDto[];
}

export class AdjustmentDto {
  @IsUUID() batchId: string;
  /** Signed quantity change (negative = loss/damage/expiry write-off). */
  @IsInt() @NotEquals(0) delta: number;
  @IsIn(['COUNT', 'DAMAGE', 'EXPIRY', 'LOSS', 'FOUND', 'OTHER']) reason: string;
  @IsOptional() @IsString() note?: string;
}

export class LevelsQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() storeId?: string;
}
export class ExpiryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) days?: number;
  @IsOptional() @IsUUID() storeId?: string;
}
export class MovementQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsUUID() storeId?: string;
  @IsOptional() @IsString() type?: string;
}

export class SupplierDto {
  @IsString() name: string;
  @IsOptional() @IsString() kraPin?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() terms?: string;
}
export class UpdateSupplierDto extends PartialType(SupplierDto) {}

export class PoLineDto {
  @IsUUID() itemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsInt() @Min(0) unitCostMinor: number;
}
export class CreatePoDto {
  @IsUUID() supplierId: string;
  @IsOptional() @IsUUID() facilityId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PoLineDto) lines: PoLineDto[];
}
export class UpdatePoDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PoLineDto) lines?: PoLineDto[];
}
export class PoDecisionDto { @IsOptional() @IsString() comment?: string }
export class PoQueryDto extends PageQueryDto { @IsOptional() @IsString() status?: string }
