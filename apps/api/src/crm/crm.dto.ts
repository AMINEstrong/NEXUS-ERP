import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

export class CrmListQueryDto {
  @ApiPropertyOptional({ example: "atlas" }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateCrmCustomerDto {
  @ApiProperty({ example: "CUST-0001" }) @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/) code!: string;
  @ApiProperty({ example: "Atlas Industrial Supply" }) @IsString() @MinLength(2) @MaxLength(180) name!: string;
  @ApiPropertyOptional({ enum: ["CUSTOMER", "PROSPECT"] }) @IsOptional() @IsEnum(["CUSTOMER", "PROSPECT"]) type?: "CUSTOMER" | "PROSPECT";
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional({ example: "MA" }) @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateCrmCustomerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(180) name?: string;
  @ApiPropertyOptional({ enum: ["CUSTOMER", "PROSPECT"] }) @IsOptional() @IsEnum(["CUSTOMER", "PROSPECT"]) type?: "CUSTOMER" | "PROSPECT";
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCrmOpportunityDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() customerId!: string;
  @ApiProperty({ example: "OPP-2026-001" }) @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/) reference!: string;
  @ApiProperty({ example: "Warehouse automation rollout" }) @IsString() @MinLength(2) @MaxLength(180) title!: string;
  @ApiPropertyOptional({ enum: ["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] }) @IsOptional() @IsEnum(["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]) stage?: string;
  @ApiPropertyOptional({ example: "185000.00" }) @IsOptional() @Matches(MONEY_PATTERN) estimatedValue?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) probability?: number;
  @ApiPropertyOptional({ example: "2026-12-15" }) @IsOptional() @IsDateString() expectedCloseAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateCrmOpportunityDto {
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(180) title?: string;
  @ApiPropertyOptional({ enum: ["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] }) @IsOptional() @IsEnum(["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]) stage?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY_PATTERN) estimatedValue?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) probability?: number;
  @ApiPropertyOptional({ example: "2026-12-15" }) @IsOptional() @IsDateString() expectedCloseAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCrmActivityDto {
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiProperty({ enum: ["CALL", "EMAIL", "MEETING", "TASK", "NOTE"] }) @IsEnum(["CALL", "EMAIL", "MEETING", "TASK", "NOTE"]) type!: string;
  @ApiProperty({ example: "Follow up on requirements" }) @IsString() @MinLength(2) @MaxLength(180) subject!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) body?: string;
  @ApiPropertyOptional({ example: "2026-11-12T10:00:00Z" }) @IsOptional() @IsDateString() dueAt?: string;
}
