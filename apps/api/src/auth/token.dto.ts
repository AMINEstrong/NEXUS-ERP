import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class VerifyEmailDto {
  @ApiProperty({ minLength: 20 })
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({ example: "owner@company.example" })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: "owner@company.example" })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({ minLength: 20 })
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 256 })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}

export class SelectCompanyDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  companyId!: string;
}
