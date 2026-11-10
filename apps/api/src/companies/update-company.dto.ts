import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: "Atlas Manufacturing Morocco" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ example: "Atlas Manufacturing SARL" })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  legalName?: string;

  @ApiPropertyOptional({ example: "MA" })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ example: "MAD" })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  currencyCode?: string;

  @ApiPropertyOptional({ example: "fr-MA", enum: ["en", "fr-MA", "ar-MA", "de-DE"] })
  @IsOptional()
  @IsIn(["en", "fr-MA", "ar-MA", "de-DE"])
  defaultLocale?: string;

  @ApiPropertyOptional({ example: "Africa/Casablanca" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeZone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
