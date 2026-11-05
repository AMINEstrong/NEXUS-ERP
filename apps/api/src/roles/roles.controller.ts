import { BadRequestException, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Body, Req, UseGuards, ForbiddenException } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TenantContextService } from "../database/tenant-context.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { AssignMembershipRoleDto, CreateRoleDto, UpdateRolePermissionsDto } from "./role.dto.js";

@ApiTags("roles and permissions")
@Controller()
@UseGuards(AuthGuard, PermissionGuard)
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
export class RolesController {
  constructor(private readonly tenants: TenantContextService) {}

  @Get("permissions")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "List permission keys available to company roles" })
  listPermissions(@Req() request: AuthenticatedRequest) {
    return this.tenants.run(request.auth!.userId, request.auth!.activeCompanyId!, (tx) =>
      tx.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }], select: { key: true, module: true, action: true, description: true } }),
    );
  }

  @Get("roles")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "List roles and their permissions for the active company" })
  async listRoles(@Req() request: AuthenticatedRequest) {
    return this.tenants.run(request.auth!.userId, request.auth!.activeCompanyId!, async (tx, membership) => {
      const roles = await tx.role.findMany({
        where: { companyId: membership.companyId },
        orderBy: { name: "asc" },
        include: { permissions: { include: { permission: { select: { key: true, module: true, action: true } } } } },
      });
      return roles.map(({ permissions, ...role }) => ({ ...role, permissions: permissions.map(({ permission }) => permission) }));
    });
  }

  @Post("roles")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Create a custom role from existing company permission keys" })
  createRole(@Body() body: CreateRoleDto, @Req() request: AuthenticatedRequest) {
    return this.tenants.run(request.auth!.userId, request.auth!.activeCompanyId!, async (tx, membership) => {
      const existing = await tx.role.findFirst({ where: { companyId: membership.companyId, key: body.key }, select: { id: true } });
      if (existing) throw new ConflictException("A role with this key already exists in the active company");
      const permissions = await tx.permission.findMany({ where: { key: { in: body.permissionKeys } }, select: { id: true, key: true } });
      if (permissions.length !== body.permissionKeys.length) throw new BadRequestException("Every permission key must exist");

      const role = await tx.role.create({
        data: { companyId: membership.companyId, key: body.key, name: body.name.trim(), description: body.description.trim(), isSystem: false },
      });
      await tx.rolePermission.createMany({
        data: permissions.map(({ id: permissionId }) => ({ companyId: membership.companyId, roleId: role.id, permissionId })),
      });
      await tx.auditLog.create({
        data: { companyId: membership.companyId, actorUserId: request.auth!.userId, action: "role.created", entityType: "Role", entityId: role.id, metadata: { key: role.key, permissionKeys: permissions.map(({ key }) => key) } },
      });
      return { ...role, permissions: permissions.map(({ key }) => key) };
    });
  }

  @Patch("roles/:roleId/permissions")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Replace permissions on a custom role in the active company" })
  replaceRolePermissions(@Param("roleId", new ParseUUIDPipe()) roleId: string, @Body() body: UpdateRolePermissionsDto, @Req() request: AuthenticatedRequest) {
    return this.tenants.run(request.auth!.userId, request.auth!.activeCompanyId!, async (tx, membership) => {
      const role = await tx.role.findFirst({ where: { id: roleId, companyId: membership.companyId } });
      if (!role) throw new NotFoundException("Role not found in the active company");
      if (role.isSystem) throw new ForbiddenException("System roles cannot be changed");
      const permissions = await tx.permission.findMany({ where: { key: { in: body.permissionKeys } }, select: { id: true, key: true } });
      if (permissions.length !== body.permissionKeys.length) throw new BadRequestException("Every permission key must exist");
      await tx.rolePermission.deleteMany({ where: { companyId: membership.companyId, roleId: role.id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({ data: permissions.map(({ id: permissionId }) => ({ companyId: membership.companyId, roleId: role.id, permissionId })) });
      }
      await tx.auditLog.create({
        data: { companyId: membership.companyId, actorUserId: request.auth!.userId, action: "role.permissions_updated", entityType: "Role", entityId: role.id, metadata: { permissionKeys: permissions.map(({ key }) => key) } },
      });
      return { id: role.id, key: role.key, name: role.name, permissions: permissions.map(({ key }) => key) };
    });
  }

  @Get("memberships")
  @RequirePermissions("administration.read")
  @ApiOperation({ summary: "List active and invited memberships for the active company" })
  listMemberships(@Req() request: AuthenticatedRequest) {
    return this.tenants.run(request.auth!.userId, request.auth!.activeCompanyId!, (tx, membership) =>
      tx.membership.findMany({
        where: { companyId: membership.companyId, status: { in: ["ACTIVE", "INVITED"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, userId: true, roleId: true, status: true, invitedAt: true, joinedAt: true, user: { select: { name: true, email: true } }, role: { select: { key: true, name: true } } },
      }),
    );
  }

  @Patch("memberships/:membershipId/role")
  @RequirePermissions("administration.manage")
  @ApiOperation({ summary: "Assign a role from the active company to one of its memberships" })
  assignMembershipRole(@Param("membershipId", new ParseUUIDPipe()) membershipId: string, @Body() body: AssignMembershipRoleDto, @Req() request: AuthenticatedRequest) {
    return this.tenants.run(request.auth!.userId, request.auth!.activeCompanyId!, async (tx, membership) => {
      const [target, nextRole] = await Promise.all([
        tx.membership.findFirst({ where: { id: membershipId, companyId: membership.companyId, status: "ACTIVE" }, include: { role: { select: { key: true } } } }),
        tx.role.findFirst({ where: { id: body.roleId, companyId: membership.companyId }, select: { id: true, key: true, name: true } }),
      ]);
      if (!target) throw new NotFoundException("Active membership not found in the active company");
      if (!nextRole) throw new BadRequestException("The requested role does not belong to the active company");
      if (target.role.key === "company_owner" && nextRole.key !== "company_owner") {
        const otherOwners = await tx.membership.count({ where: { companyId: membership.companyId, status: "ACTIVE", role: { key: "company_owner" }, id: { not: target.id } } });
        if (otherOwners === 0) throw new ForbiddenException("A company must retain at least one active owner");
      }
      const updated = await tx.membership.update({ where: { id: target.id }, data: { roleId: nextRole.id }, select: { id: true, userId: true, roleId: true, status: true } });
      await tx.auditLog.create({
        data: { companyId: membership.companyId, actorUserId: request.auth!.userId, action: "membership.role_assigned", entityType: "Membership", entityId: target.id, metadata: { previousRole: target.role.key, nextRole: nextRole.key } },
      });
      return { ...updated, role: nextRole };
    });
  }
}
