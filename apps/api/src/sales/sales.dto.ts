import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from "class-validator";

const MONEY = /^\d{1,12}(?:\.\d{1,2})?$/;
const QUANTITY = /^\d{1,13}(?:\.\d{1,3})?$/;
const RATE = /^\d{1,3}(?:\.\d{1,2})?$/;

export class SalesListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class SalesQuotationLineDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() productId!: string;
  @ApiPropertyOptional({ maxLength: 240 }) @IsOptional() @IsString() @MinLength(2) @MaxLength(240) description?: string;
  @ApiProperty({ example: "2.000" }) @Matches(QUANTITY) quantity!: string;
  @ApiProperty({ example: "125.00" }) @Matches(MONEY) unitPrice!: string;
  @ApiPropertyOptional({ example: "20.00" }) @IsOptional() @Matches(RATE) taxRate?: string;
}

export class CreateSalesQuotationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() customerId!: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiPropertyOptional({ example: "2026-12-31" }) @IsOptional() @IsDateString() validUntil?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiProperty({ type: [SalesQuotationLineDto] }) @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SalesQuotationLineDto) lines!: SalesQuotationLineDto[];
}

export class SalesDeliveryLineDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() orderLineId!: string;
  @ApiProperty({ example: "2.000" }) @Matches(QUANTITY) quantity!: string;
}

export class DeliverSalesOrderDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() warehouseId!: string;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @ApiProperty({ type: [SalesDeliveryLineDto] }) @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SalesDeliveryLineDto) lines!: SalesDeliveryLineDto[];
}

export class SalesInvoiceLineDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() orderLineId!: string;
  @ApiProperty({ example: "2.000" }) @Matches(QUANTITY) quantity!: string;
}

export class CreateSalesInvoiceDto {
  @ApiProperty({ example: "2026-12-05" }) @IsDateString() dueAt!: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ type: [SalesInvoiceLineDto] }) @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SalesInvoiceLineDto) lines?: SalesInvoiceLineDto[];
}

export class RecordSalesPaymentDto {
  @ApiProperty({ enum: ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"] }) @IsEnum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]) method!: string;
  @ApiProperty({ example: "1250.00" }) @Matches(MONEY) amount!: string;
  @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @IsString() @MaxLength(120) externalReference?: string;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
