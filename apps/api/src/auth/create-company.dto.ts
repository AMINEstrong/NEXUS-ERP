import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateCompanyDto {
  @ApiProperty({ example: "Rif Commerce", maxLength: 180 })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  companyName!: string;

  @ApiPropertyOptional({ example: "MA", default: "MA" })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ example: "MAD", default: "MAD" })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  currencyCode?: string;

  @ApiPropertyOptional({ example: "fr-MA", enum: ["en", "fr-MA", "ar-MA"] })
  @IsOptional()
  @IsIn(["en", "fr-MA", "ar-MA"])
  defaultLocale?: string;

  @ApiPropertyOptional({ example: "Africa/Casablanca", default: "Africa/Casablanca" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeZone?: string;
}
