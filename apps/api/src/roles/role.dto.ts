import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export class CreateRoleDto {
  @ApiProperty({ example: "warehouse_lead", maxLength: 80 })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,79}$/)
  key!: string;

  @ApiProperty({ example: "Warehouse Lead", maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: "Oversees stock operations", maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: ["inventory.read", "inventory.update"], type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(140, { each: true })
  @Matches(PERMISSION_KEY_PATTERN, { each: true })
  permissionKeys: string[] = [];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: "Warehouse Lead", maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: "Oversees stock operations", maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class DuplicateRoleDto {
  @ApiProperty({ example: "warehouse_lead_copy", maxLength: 80 })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,79}$/)
  key!: string;

  @ApiPropertyOptional({ example: "Warehouse Lead copy", maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ example: ["inventory.read", "inventory.update"], type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(140, { each: true })
  @Matches(PERMISSION_KEY_PATTERN, { each: true })
  permissionKeys!: string[];
}

export class AddRolePermissionDto {
  @ApiProperty({ example: "inventory.read" })
  @IsString()
  @MaxLength(140)
  @Matches(PERMISSION_KEY_PATTERN)
  permissionKey!: string;
}

export class AssignMembershipRolesDto {
  @ApiProperty({ type: [String], example: ["00000000-0000-4000-8000-000000000000"] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(UUID_PATTERN, { each: true })
  roleIds!: string[];
}

export class AssignMembershipRoleDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  @Matches(UUID_PATTERN)
  roleId!: string;
}

export class UpdateLocaleDto {
  @ApiProperty({ example: "fr", enum: ["en", "fr", "ar", "de"], description: "Base UI language; regional variants such as fr-MA or de-DE are accepted" })
  @IsString()
  @Matches(/^(en|fr|ar|de)(-[A-Z]{2})?$/)
  locale!: string;
}
