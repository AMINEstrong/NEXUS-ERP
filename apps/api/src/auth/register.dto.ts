import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "Amine El Idrissi", maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: "amine@company.ma", maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 256 })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;

  @ApiProperty({ example: "Atlas Manufacturing", maxLength: 180 })
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

  @ApiPropertyOptional({ example: "fr-MA", enum: ["en", "fr-MA", "ar-MA", "de-DE"] })
  @IsOptional()
  @IsIn(["en", "fr-MA", "ar-MA", "de-DE"])
  defaultLocale?: string;

  @ApiPropertyOptional({ example: "Africa/Casablanca", default: "Africa/Casablanca" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeZone?: string;
}
