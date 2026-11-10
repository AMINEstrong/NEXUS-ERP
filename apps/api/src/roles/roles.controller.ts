import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { RolesService } from "./roles.service.js";
import {
  AddRolePermissionDto,
  AssignMembershipRoleDto,
  AssignMembershipRolesDto,
  CreateRoleDto,
  DuplicateRoleDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
} from "./role.dto.js";

@ApiTags("roles and permissions")
@Controller()
@UseGuards(AuthGuard, PermissionGuard)
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get("permissions")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "List tenant permission keys available to company roles" })
  listPermissions(@Req() request: AuthenticatedRequest) {
    return this.roles.listPermissions(request.auth!.userId, request.auth!.activeCompanyId!);
  }

  @Get("roles")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "List roles, permission grants and member counts" })
  listRoles(@Req() request: AuthenticatedRequest) {
    return this.roles.listRoles(request.auth!.userId, request.auth!.activeCompanyId!);
  }

  @Get("roles/:roleId")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "Read one role with its permissions and member count" })
  getRole(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Req() request: AuthenticatedRequest) {
    return this.roles.getRole(request.auth!.userId, request.auth!.activeCompanyId!, roleId);
  }

  @Post("roles")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Create a custom role from tenant permission keys" })
  createRole(@Body() body: CreateRoleDto, @Req() request: AuthenticatedRequest) {
    return this.roles.createRole(request.auth!.userId, request.auth!.activeCompanyId!, body);
  }

  @Patch("roles/:roleId")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Rename or describe a custom role" })
  updateRole(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Body() body: UpdateRoleDto, @Req() request: AuthenticatedRequest) {
    return this.roles.updateRole(request.auth!.userId, request.auth!.activeCompanyId!, roleId, body);
  }

  @Delete("roles/:roleId")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Delete an unused custom role" })
  deleteRole(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Req() request: AuthenticatedRequest) {
    return this.roles.deleteRole(request.auth!.userId, request.auth!.activeCompanyId!, roleId);
  }

  @Post("roles/:roleId/duplicate")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Duplicate a role and its permission grants into a custom role" })
  duplicateRole(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Body() body: DuplicateRoleDto, @Req() request: AuthenticatedRequest) {
    return this.roles.duplicateRole(request.auth!.userId, request.auth!.activeCompanyId!, roleId, body);
  }

  @Put("roles/:roleId/permissions")
  @Patch("roles/:roleId/permissions")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Replace every permission grant on a custom role" })
  replaceRolePermissions(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Body() body: UpdateRolePermissionsDto, @Req() request: AuthenticatedRequest) {
    return this.roles.replacePermissions(request.auth!.userId, request.auth!.activeCompanyId!, roleId, body.permissionKeys);
  }

  @Post("roles/:roleId/permissions")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Add one permission to a custom role" })
  addRolePermission(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Body() body: AddRolePermissionDto, @Req() request: AuthenticatedRequest) {
    return this.roles.addPermission(request.auth!.userId, request.auth!.activeCompanyId!, roleId, body.permissionKey);
  }

  @Delete("roles/:roleId/permissions/:permissionKey")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Remove one permission from a custom role" })
  removeRolePermission(
    @Param("roleId", new ParseUUIDPipe()) roleId: string,
    @Param("permissionKey") permissionKey: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.removePermission(request.auth!.userId, request.auth!.activeCompanyId!, roleId, permissionKey);
  }

  @Get("roles/:roleId/members")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "List the members who currently hold a role" })
  listRoleMembers(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Req() request: AuthenticatedRequest) {
    return this.roles.listRoleMembers(request.auth!.userId, request.auth!.activeCompanyId!, roleId);
  }

  @Get("memberships")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "List company memberships with their effective roles and permissions" })
  listMemberships(@Req() request: AuthenticatedRequest) {
    return this.roles.listMemberships(request.auth!.userId, request.auth!.activeCompanyId!);
  }

  @Put("memberships/:membershipId/roles")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Replace every role assigned to a company member" })
  assignMembershipRoles(
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
    @Body() body: AssignMembershipRolesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.assignMembershipRoles(request.auth!.userId, request.auth!.activeCompanyId!, membershipId, body);
  }

  @Post("memberships/:membershipId/roles")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Add one role to a company member without removing existing roles" })
  addMembershipRole(
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
    @Body() body: AssignMembershipRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.addMembershipRole(request.auth!.userId, request.auth!.activeCompanyId!, membershipId, body.roleId);
  }

  @Delete("memberships/:membershipId/roles/:roleId")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Remove one role from a company member" })
  removeMembershipRole(
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
    @Param("roleId", new ParseUUIDPipe()) roleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.removeMembershipRole(request.auth!.userId, request.auth!.activeCompanyId!, membershipId, roleId);
  }

  @Patch("memberships/:membershipId/role")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Legacy single-role assignment; replaces the member's role set" })
  assignMembershipRole(
    @Param("membershipId", new ParseUUIDPipe()) membershipId: string,
    @Body() body: AssignMembershipRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.roles.assignLegacyMembershipRole(request.auth!.userId, request.auth!.activeCompanyId!, membershipId, body.roleId);
  }
}
