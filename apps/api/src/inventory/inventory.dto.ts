import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^\d{1,13}(?:\.\d{1,3})?$/;

export class InventoryListQueryDto {
  @ApiPropertyOptional({ example: "bearing" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class CreateInventoryItemDto {
  @ApiProperty({ example: "BRG-6204", maxLength: 60 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{1,59}$/)
  sku!: string;

  @ApiProperty({ example: "Deep groove ball bearing", maxLength: 180 })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: "each", maxLength: 16 })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,16}$/)
  unit?: string;

  @ApiPropertyOptional({ example: "125.50", description: "Base unit cost in the company's currency" })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  unitCost?: string;

  @ApiPropertyOptional({ example: "10.000", description: "Low-stock threshold across the company" })
  @IsOptional()
  @Matches(QUANTITY_PATTERN)
  reorderPoint?: string;
}

export class UpdateInventoryItemDto {
  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,16}$/)
  unit?: string;

  @ApiPropertyOptional({ example: "130.00" })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  unitCost?: string;

  @ApiPropertyOptional({ example: "12.000" })
  @IsOptional()
  @Matches(QUANTITY_PATTERN)
  reorderPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWarehouseDto {
  @ApiProperty({ example: "CASA-01", maxLength: 24 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{1,23}$/)
  code!: string;

  @ApiProperty({ example: "Casablanca Central", maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InventoryOperationLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: "12.500", description: "Positive quantity, up to 3 decimal places" })
  @Matches(QUANTITY_PATTERN)
  quantity!: string;
}

export class GoodsReceiptLineDto extends InventoryOperationLineDto {
  @ApiPropertyOptional({ example: "125.50" })
  @IsOptional()
  @Matches(MONEY_PATTERN)
  unitCost?: string;
}

export class GoodsReceiptDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  warehouseId!: string;

  @ApiPropertyOptional({ example: "GRN-2026-0001", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [GoodsReceiptLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}

export class StockTransferDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fromWarehouseId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toWarehouseId!: string;

  @ApiPropertyOptional({ example: "TRF-2026-0001", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [InventoryOperationLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryOperationLineDto)
  lines!: InventoryOperationLineDto[];
}
