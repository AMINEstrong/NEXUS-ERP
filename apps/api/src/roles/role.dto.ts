import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsArray, IsString, Matches, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({ example: "Oversees stock operations", maxLength: 500 })
  @IsString()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: ["inventory.read", "inventory.update"], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(140, { each: true })
  permissionKeys!: string[];
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ example: ["inventory.read", "inventory.update"], type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(140, { each: true })
  permissionKeys!: string[];
}

export class AssignMembershipRoleDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  roleId!: string;
}
