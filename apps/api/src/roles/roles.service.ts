import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { TenantContextService } from "../database/tenant-context.service.js";
import { OWNER_ROLE_KEY, resolveEffectiveAccess, type EffectiveAccess } from "../authorization/effective-permissions.js";
import type { AssignMembershipRolesDto, CreateRoleDto, DuplicateRoleDto, UpdateRoleDto } from "./role.dto.js";

const MEMBER_STATUSES = ["ACTIVE", "INVITED"] as const;

type RoleWithPermissions = Prisma.RoleGetPayload<{
  include: { permissions: { include: { permission: { select: { key: true; module: true; action: true } } } } };
}>;

@Injectable()
export class RolesService {
  constructor(private readonly tenants: TenantContextService) {}

  async listPermissions(actorUserId: string, companyId: string) {
    return this.tenants.run(actorUserId, companyId, (tx) =>
      tx.permission.findMany({
        where: { module: { not: "platform" } },
        orderBy: [{ module: "asc" }, { action: "asc" }],
        select: { key: true, module: true, action: true, description: true },
      }),
    );
  }

  async listRoles(actorUserId: string, companyId: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const [roles, counts] = await Promise.all([this.fetchRoles(tx, membership.companyId), this.memberCounts(tx, membership.companyId)]);
      return roles.map((role) => this.shapeRole(role, counts.get(role.id) ?? 0));
    });
  }

  async getRole(actorUserId: string, companyId: string, roleId: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const role = await this.requireRole(tx, membership.companyId, roleId);
      const counts = await this.memberCounts(tx, membership.companyId);
      return this.shapeRole(role, counts.get(role.id) ?? 0);
    });
  }

  async createRole(actorUserId: string, companyId: string, input: CreateRoleDto) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const access = await resolveEffectiveAccess(tx, membership);
      const keys = await this.validatePermissionKeys(tx, input.permissionKeys);
      this.assertCanGrant(access, keys);
      const duplicate = await tx.role.findFirst({ where: { companyId: membership.companyId, key: input.key }, select: { id: true } });
      if (duplicate) throw new ConflictException("A role with this key already exists in the active company");

      const role = await tx.role.create({
        data: {
          companyId: membership.companyId,
          key: input.key,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          isSystem: false,
        },
        include: { permissions: { include: { permission: { select: { key: true, module: true, action: true } } } } },
      });
      if (keys.length) {
        const permissionRows = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
        await tx.rolePermission.createMany({
          data: permissionRows.map(({ id: permissionId }) => ({ companyId: membership.companyId, roleId: role.id, permissionId })),
        });
      }
      await this.audit(tx, membership.companyId, actorUserId, "role.created", "Role", role.id, {
        key: role.key,
        permissionKeys: keys,
      });
      return this.shapeRole(await this.requireRole(tx, membership.companyId, role.id), 0);
    });
  }

  async updateRole(actorUserId: string, companyId: string, roleId: string, input: UpdateRoleDto) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const role = await this.requireRole(tx, membership.companyId, roleId);
      this.assertCustomRole(role, "System roles are protected and cannot be renamed or deleted");
      if (input.name === undefined && input.description === undefined) {
        throw new BadRequestException("Provide a name or description to update");
      }
      const updated = await tx.role.update({
        where: { id: role.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
        },
        include: { permissions: { include: { permission: { select: { key: true, module: true, action: true } } } } },
      });
      await this.audit(tx, membership.companyId, actorUserId, "role.updated", "Role", role.id, {
        previous: { name: role.name, description: role.description },
        next: { name: updated.name, description: updated.description },
      });
      const counts = await this.memberCounts(tx, membership.companyId);
      return this.shapeRole(updated, counts.get(updated.id) ?? 0);
    });
  }

  async deleteRole(actorUserId: string, companyId: string, roleId: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const role = await this.requireRole(tx, membership.companyId, roleId);
      this.assertCustomRole(role, "System roles cannot be deleted");
      const counts = await this.memberCounts(tx, membership.companyId);
      const members = counts.get(role.id) ?? 0;
      if (members > 0) {
        throw new ConflictException(`${members} member${members === 1 ? "" : "s"} still use this role. Reassign them before deleting it.`);
      }
      await this.audit(tx, membership.companyId, actorUserId, "role.deleted", "Role", role.id, {
        key: role.key,
        name: role.name,
        permissionKeys: role.permissions.map(({ permission }) => permission.key),
      });
      await tx.role.delete({ where: { id: role.id } });
      return { id: role.id, deleted: true };
    });
  }

  async duplicateRole(actorUserId: string, companyId: string, roleId: string, input: DuplicateRoleDto) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const source = await this.requireRole(tx, membership.companyId, roleId);
      const access = await resolveEffectiveAccess(tx, membership);
      const keys = source.permissions.map(({ permission }) => permission.key);
      this.assertCanGrant(access, keys);
      const duplicate = await tx.role.findFirst({ where: { companyId: membership.companyId, key: input.key }, select: { id: true } });
      if (duplicate) throw new ConflictException("A role with this key already exists in the active company");

      const role = await tx.role.create({
        data: {
          companyId: membership.companyId,
          key: input.key,
          name: (input.name?.trim() || `${source.name} copy`).slice(0, 120),
          description: source.description,
          isSystem: false,
        },
      });
      const permissionRows = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
      if (permissionRows.length) {
        await tx.rolePermission.createMany({
          data: permissionRows.map(({ id: permissionId }) => ({ companyId: membership.companyId, roleId: role.id, permissionId })),
        });
      }
      await this.audit(tx, membership.companyId, actorUserId, "role.duplicated", "Role", role.id, {
        sourceRoleId: source.id,
        sourceKey: source.key,
        key: role.key,
      });
      return this.shapeRole(await this.requireRole(tx, membership.companyId, role.id), 0);
    });
  }

  async replacePermissions(actorUserId: string, companyId: string, roleId: string, permissionKeys: string[]) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const role = await this.requireRole(tx, membership.companyId, roleId);
      this.assertCustomRole(role, "System role permissions are protected. Duplicate the role to customise its grants.");
      const access = await resolveEffectiveAccess(tx, membership);
      const keys = await this.validatePermissionKeys(tx, permissionKeys);
      this.assertCanGrant(access, keys);
      await this.assertActorKeepsAdministration(tx, membership, access, role.id, keys);

      const permissionRows = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
      await tx.rolePermission.deleteMany({ where: { companyId: membership.companyId, roleId: role.id } });
      if (permissionRows.length) {
        await tx.rolePermission.createMany({
          data: permissionRows.map(({ id: permissionId }) => ({ companyId: membership.companyId, roleId: role.id, permissionId })),
        });
      }
      await this.audit(tx, membership.companyId, actorUserId, "role.permissions_updated", "Role", role.id, {
        previous: role.permissions.map(({ permission }) => permission.key),
        permissionKeys: keys,
      });
      const counts = await this.memberCounts(tx, membership.companyId);
      return this.shapeRole(await this.requireRole(tx, membership.companyId, role.id), counts.get(role.id) ?? 0);
    });
  }

  async addPermission(actorUserId: string, companyId: string, roleId: string, permissionKey: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const role = await this.requireRole(tx, membership.companyId, roleId);
      this.assertCustomRole(role, "System role permissions are protected. Duplicate the role to customise its grants.");
      const access = await resolveEffectiveAccess(tx, membership);
      const keys = await this.validatePermissionKeys(tx, [permissionKey]);
      this.assertCanGrant(access, keys);
      const permission = await tx.permission.findUniqueOrThrow({ where: { key: permissionKey }, select: { id: true } });
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { companyId: membership.companyId, roleId: role.id, permissionId: permission.id },
      });
      await this.audit(tx, membership.companyId, actorUserId, "role.permission_added", "Role", role.id, { permissionKey });
      const counts = await this.memberCounts(tx, membership.companyId);
      return this.shapeRole(await this.requireRole(tx, membership.companyId, role.id), counts.get(role.id) ?? 0);
    });
  }

  async removePermission(actorUserId: string, companyId: string, roleId: string, permissionKey: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const role = await this.requireRole(tx, membership.companyId, roleId);
      this.assertCustomRole(role, "System role permissions are protected. Duplicate the role to customise its grants.");
      const existing = role.permissions.find(({ permission }) => permission.key === permissionKey);
      if (!existing) throw new NotFoundException("This permission is not granted to the role");
      const access = await resolveEffectiveAccess(tx, membership);
      const nextKeys = role.permissions.map(({ permission }) => permission.key).filter((key) => key !== permissionKey);
      await this.assertActorKeepsAdministration(tx, membership, access, role.id, nextKeys);
      await tx.rolePermission.deleteMany({
        where: { companyId: membership.companyId, roleId: role.id, permissionId: existing.permissionId },
      });
      await this.audit(tx, membership.companyId, actorUserId, "role.permission_removed", "Role", role.id, { permissionKey });
      const counts = await this.memberCounts(tx, membership.companyId);
      return this.shapeRole(await this.requireRole(tx, membership.companyId, role.id), counts.get(role.id) ?? 0);
    });
  }

  async listRoleMembers(actorUserId: string, companyId: string, roleId: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const role = await this.requireRole(tx, membership.companyId, roleId);
      const memberships = await tx.membership.findMany({
        where: {
          companyId: membership.companyId,
          status: { in: [...MEMBER_STATUSES] },
          OR: [{ roleId: role.id }, { roleLinks: { some: { roleId: role.id } } }],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, userId: true, status: true, joinedAt: true, roleId: true,
          user: { select: { name: true, email: true } },
        },
      });
      return memberships.map((member) => ({
        id: member.id,
        userId: member.userId,
        status: member.status,
        joinedAt: member.joinedAt,
        isPrimary: member.roleId === role.id,
        user: member.user,
      }));
    });
  }

  async listMemberships(actorUserId: string, companyId: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, membership) => {
      const [memberships, roles, ownerRole] = await Promise.all([
        tx.membership.findMany({
          where: { companyId: membership.companyId, status: { in: [...MEMBER_STATUSES] } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true, userId: true, roleId: true, status: true, invitedAt: true, joinedAt: true,
            user: { select: { name: true, email: true } },
            role: { select: { id: true, key: true, name: true, isSystem: true } },
            roleLinks: { select: { role: { select: { id: true, key: true, name: true, isSystem: true } } } },
          },
        }),
        this.fetchRoles(tx, membership.companyId),
        tx.role.findFirst({ where: { companyId: membership.companyId, key: OWNER_ROLE_KEY }, select: { id: true } }),
      ]);
      const permissionByRole = await this.permissionKeysByRole(tx, membership.companyId);
      const allTenantKeys = ownerRole ? await this.allTenantPermissionKeys(tx) : [];
      return memberships.map((member) => this.shapeMembership(member, permissionByRole, allTenantKeys));
    });
  }

  async assignMembershipRoles(actorUserId: string, companyId: string, membershipId: string, input: AssignMembershipRolesDto) {
    return this.tenants.run(actorUserId, companyId, async (tx, actorMembership) => {
      this.assertNotSelfChange(actorMembership.id, membershipId);
      const target = await this.requireMembership(tx, actorMembership.companyId, membershipId);
      const roles = await this.validateCompanyRoles(tx, actorMembership.companyId, input.roleIds);
      const access = await resolveEffectiveAccess(tx, actorMembership);
      this.assertOwnerRoleAssignable(access, roles.map((role) => role.key));
      const permissionByRole = await this.permissionKeysByRole(tx, actorMembership.companyId, roles.map((role) => role.id));
      const permissionKeys = Array.from(new Set(Array.from(permissionByRole.values()).flat()));
      this.assertCanGrant(access, permissionKeys);
      await this.assertOwnerRemains(tx, actorMembership.companyId, target, roles.map((role) => role.key));

      const primaryRoleId = roles.some((role) => role.id === target.roleId) ? target.roleId : roles[0]!.id;
      await tx.membership.update({ where: { id: target.id }, data: { roleId: primaryRoleId } });
      await tx.membershipRole.deleteMany({ where: { companyId: actorMembership.companyId, membershipId: target.id } });
      await tx.membershipRole.createMany({
        data: roles.map((role) => ({
          companyId: actorMembership.companyId,
          membershipId: target.id,
          roleId: role.id,
          assignedByUserId: actorUserId,
        })),
      });
      await this.audit(tx, actorMembership.companyId, actorUserId, "membership.roles_assigned", "Membership", target.id, {
        previous: await this.currentRoleKeys(tx, target),
        roleKeys: roles.map((role) => role.key),
      });
      return this.loadMembership(tx, actorMembership.companyId, target.id);
    });
  }

  async addMembershipRole(actorUserId: string, companyId: string, membershipId: string, roleId: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, actorMembership) => {
      this.assertNotSelfChange(actorMembership.id, membershipId);
      const target = await this.requireMembership(tx, actorMembership.companyId, membershipId);
      const [role] = await this.validateCompanyRoles(tx, actorMembership.companyId, [roleId]);
      const access = await resolveEffectiveAccess(tx, actorMembership);
      this.assertOwnerRoleAssignable(access, [role!.key]);
      const permissionKeys = (await this.permissionKeysByRole(tx, actorMembership.companyId, [roleId])).get(roleId) ?? [];
      this.assertCanGrant(access, permissionKeys);
      const existing = await tx.membershipRole.findUnique({
        where: { membershipId_roleId: { membershipId: target.id, roleId: role!.id } },
        select: { id: true },
      });
      if (!existing) {
        await tx.membershipRole.create({
          data: { companyId: actorMembership.companyId, membershipId: target.id, roleId: role!.id, assignedByUserId: actorUserId },
        });
      }
      await this.audit(tx, actorMembership.companyId, actorUserId, "membership.role_added", "Membership", target.id, { roleKey: role!.key });
      return this.loadMembership(tx, actorMembership.companyId, target.id);
    });
  }

  async removeMembershipRole(actorUserId: string, companyId: string, membershipId: string, roleId: string) {
    return this.tenants.run(actorUserId, companyId, async (tx, actorMembership) => {
      this.assertNotSelfChange(actorMembership.id, membershipId);
      const target = await this.requireMembership(tx, actorMembership.companyId, membershipId);
      const role = await this.requireRole(tx, actorMembership.companyId, roleId);
      const currentRoles = await this.currentRoleIds(tx, target);
      if (!currentRoles.includes(role.id)) throw new NotFoundException("The member does not hold this role");
      const nextRoleIds = currentRoles.filter((id) => id !== role.id);
      const nextRoles = await this.validateCompanyRoles(tx, actorMembership.companyId, nextRoleIds);
      await this.assertOwnerRemains(tx, actorMembership.companyId, target, nextRoles.map((next) => next.key));
      if (!nextRoles.length) throw new BadRequestException("A member must keep at least one role");

      await tx.membershipRole.deleteMany({ where: { companyId: actorMembership.companyId, membershipId: target.id, roleId: role.id } });
      const primaryRoleId = nextRoles.some((next) => next.id === target.roleId) ? target.roleId : nextRoles[0]!.id;
      await tx.membership.update({ where: { id: target.id }, data: { roleId: primaryRoleId } });
      await this.audit(tx, actorMembership.companyId, actorUserId, "membership.role_removed", "Membership", target.id, { roleKey: role.key });
      return this.loadMembership(tx, actorMembership.companyId, target.id);
    });
  }

  // Legacy single-role endpoint kept for API compatibility. It replaces the
  // member's full role set with the requested role.
  async assignLegacyMembershipRole(actorUserId: string, companyId: string, membershipId: string, roleId: string) {
    return this.assignMembershipRoles(actorUserId, companyId, membershipId, { roleIds: [roleId] });
  }

  private async fetchRoles(tx: Prisma.TransactionClient, companyId: string): Promise<RoleWithPermissions[]> {
    return tx.role.findMany({
      where: { companyId },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { permissions: { include: { permission: { select: { key: true, module: true, action: true } } } } },
    });
  }

  private async requireRole(tx: Prisma.TransactionClient, companyId: string, roleId: string) {
    const role = await tx.role.findFirst({
      where: { id: roleId, companyId },
      include: { permissions: { include: { permission: { select: { key: true, module: true, action: true } } } } },
    });
    if (!role) throw new NotFoundException("Role not found in the active company");
    return role;
  }

  private async requireMembership(tx: Prisma.TransactionClient, companyId: string, membershipId: string) {
    const member = await tx.membership.findFirst({
      where: { id: membershipId, companyId, status: "ACTIVE" },
      select: { id: true, roleId: true, userId: true },
    });
    if (!member) throw new NotFoundException("Active membership not found in the active company");
    return member;
  }

  private async validateCompanyRoles(tx: Prisma.TransactionClient, companyId: string, roleIds: string[]) {
    const unique = Array.from(new Set(roleIds));
    const roles = await tx.role.findMany({ where: { companyId, id: { in: unique } }, select: { id: true, key: true, name: true } });
    if (roles.length !== unique.length) throw new BadRequestException("Every role must belong to the active company");
    return roles;
  }

  private async validatePermissionKeys(tx: Prisma.TransactionClient, keys: string[]) {
    const unique = Array.from(new Set(keys));
    if (!unique.length) return unique;
    const permissions = await tx.permission.findMany({
      where: { key: { in: unique }, module: { not: "platform" } },
      select: { key: true },
    });
    if (permissions.length !== unique.length) throw new BadRequestException("Every permission key must exist and be tenant-scoped");
    return unique;
  }

  private assertCustomRole(role: { isSystem: boolean; key: string }, message: string) {
    if (role.isSystem || role.key === OWNER_ROLE_KEY) throw new ForbiddenException(message);
  }

  private assertNotSelfChange(actorMembershipId: string, targetMembershipId: string) {
    if (actorMembershipId === targetMembershipId) {
      throw new ForbiddenException("You cannot change your own role assignment. Ask another administrator to do it.");
    }
  }

  private assertCanGrant(access: EffectiveAccess, requestedKeys: string[]) {
    if (access.isOwner) return;
    const granted = new Set(access.permissionKeys);
    const missing = requestedKeys.filter((key) => !granted.has(key));
    if (missing.length) {
      throw new ForbiddenException(`You cannot grant permissions you do not hold: ${missing.join(", ")}`);
    }
  }

  private assertOwnerRoleAssignable(access: EffectiveAccess, roleKeys: string[]) {
    if (!access.isOwner && roleKeys.includes(OWNER_ROLE_KEY)) {
      throw new ForbiddenException("Only a company owner can grant the owner role");
    }
  }

  private async rolePermissionKeys(tx: Prisma.TransactionClient, companyId: string, roleId: string) {
    const grants = await tx.rolePermission.findMany({
      where: { companyId, roleId },
      select: { permission: { select: { key: true, module: true } } },
    });
    return grants.filter(({ permission }) => permission.module !== "platform").map(({ permission }) => permission.key);
  }

  private async assertActorKeepsAdministration(
    tx: Prisma.TransactionClient,
    actorMembership: { id: string; companyId: string; roleId: string },
    access: EffectiveAccess,
    affectedRoleId: string,
    nextRolePermissionKeys: string[],
  ) {
    if (access.isOwner || access.roles.length === 0) return;
    if (!actorHasRole(access, affectedRoleId)) return;
    const otherRoleKeys = new Set<string>();
    for (const role of access.roles) {
      if (role.id === affectedRoleId) continue;
      const keys = await this.rolePermissionKeys(tx, actorMembership.companyId, role.id);
      for (const key of keys) otherRoleKeys.add(key);
    }
    const next = new Set([...otherRoleKeys, ...nextRolePermissionKeys]);
    if (!next.has("administration.manage")) {
      throw new ForbiddenException("This change would remove your own administration access. Ask another administrator to make it.");
    }
  }

  private async assertOwnerRemains(
    tx: Prisma.TransactionClient,
    companyId: string,
    target: { id: string; roleId: string },
    nextRoleKeys: string[],
  ) {
    const ownerRole = await tx.role.findFirst({ where: { companyId, key: OWNER_ROLE_KEY }, select: { id: true } });
    if (!ownerRole) return;
    const targetRoles = await this.currentRoleIds(tx, target);
    if (!targetRoles.includes(ownerRole.id)) return;
    if (nextRoleKeys.includes(OWNER_ROLE_KEY)) return;

    const otherOwners = await tx.membership.count({
      where: {
        companyId,
        status: "ACTIVE",
        id: { not: target.id },
        OR: [{ roleId: ownerRole.id }, { roleLinks: { some: { roleId: ownerRole.id } } }],
      },
    });
    if (otherOwners === 0) throw new ForbiddenException("A company must retain at least one active owner");
  }

  private async currentRoleIds(tx: Prisma.TransactionClient, target: { id: string; roleId: string }) {
    const links = await tx.membershipRole.findMany({ where: { membershipId: target.id }, select: { roleId: true } });
    return Array.from(new Set([target.roleId, ...links.map((link) => link.roleId)]));
  }

  private async currentRoleKeys(tx: Prisma.TransactionClient, target: { id: string; roleId: string }) {
    const roleIds = await this.currentRoleIds(tx, target);
    const roles = await tx.role.findMany({ where: { id: { in: roleIds } }, select: { key: true } });
    return roles.map((role) => role.key);
  }

  private async loadMembership(tx: Prisma.TransactionClient, companyId: string, membershipId: string) {
    const member = await tx.membership.findFirstOrThrow({
      where: { id: membershipId, companyId },
      select: {
        id: true, userId: true, roleId: true, status: true, invitedAt: true, joinedAt: true,
        user: { select: { name: true, email: true } },
        role: { select: { id: true, key: true, name: true, isSystem: true } },
        roleLinks: { select: { role: { select: { id: true, key: true, name: true, isSystem: true } } } },
      },
    });
    const permissionByRole = await this.permissionKeysByRole(tx, companyId);
    const ownerExists = await tx.role.count({ where: { companyId, key: OWNER_ROLE_KEY } });
    const allTenantKeys = ownerExists ? await this.allTenantPermissionKeys(tx) : [];
    return this.shapeMembership(member, permissionByRole, allTenantKeys);
  }

  private async memberCounts(tx: Prisma.TransactionClient, companyId: string) {
    const [memberships, links] = await Promise.all([
      tx.membership.findMany({ where: { companyId, status: { in: [...MEMBER_STATUSES] } }, select: { id: true, roleId: true } }),
      tx.membershipRole.findMany({ where: { companyId }, select: { membershipId: true, roleId: true } }),
    ]);
    const counts = new Map<string, Set<string>>();
    const add = (roleId: string, membershipId: string) => {
      const set = counts.get(roleId) ?? new Set<string>();
      set.add(membershipId);
      counts.set(roleId, set);
    };
    for (const member of memberships) add(member.roleId, member.id);
    for (const link of links) add(link.roleId, link.membershipId);
    return new Map(Array.from(counts, ([roleId, set]) => [roleId, set.size]));
  }

  private async permissionKeysByRole(tx: Prisma.TransactionClient, companyId: string, roleIds?: string[]) {
    const grants = await tx.rolePermission.findMany({
      where: { companyId, ...(roleIds?.length ? { roleId: { in: roleIds } } : {}) },
      select: { roleId: true, permission: { select: { key: true, module: true } } },
    });
    const map = new Map<string, string[]>();
    for (const grant of grants) {
      if (grant.permission.module === "platform") continue;
      const keys = map.get(grant.roleId) ?? [];
      keys.push(grant.permission.key);
      map.set(grant.roleId, keys);
    }
    return map;
  }

  private async allTenantPermissionKeys(tx: Prisma.TransactionClient) {
    const permissions = await tx.permission.findMany({ where: { module: { not: "platform" } }, select: { key: true } });
    return permissions.map(({ key }) => key);
  }

  private shapeRole(role: RoleWithPermissions, memberCount: number) {
    return {
      id: role.id,
      companyId: role.companyId,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isOwnerRole: role.key === OWNER_ROLE_KEY,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      memberCount,
      permissions: role.permissions
        .map(({ permission }) => permission)
        .sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  private shapeMembership(
    member: {
      id: string; userId: string; roleId: string; status: string; invitedAt: Date | null; joinedAt: Date | null;
      user: { name: string; email: string };
      role: { id: string; key: string; name: string; isSystem: boolean };
      roleLinks: Array<{ role: { id: string; key: string; name: string; isSystem: boolean } }>;
    },
    permissionByRole: Map<string, string[]>,
    allTenantKeys: string[],
  ) {
    const roleMap = new Map<string, { id: string; key: string; name: string; isSystem: boolean }>();
    roleMap.set(member.role.id, member.role);
    for (const link of member.roleLinks) roleMap.set(link.role.id, link.role);
    const roles = Array.from(roleMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const isOwner = roles.some((role) => role.key === OWNER_ROLE_KEY);
    const permissions = isOwner
      ? [...allTenantKeys].sort()
      : Array.from(new Set(roles.flatMap((role) => permissionByRole.get(role.id) ?? []))).sort();
    return {
      id: member.id,
      userId: member.userId,
      status: member.status,
      invitedAt: member.invitedAt,
      joinedAt: member.joinedAt,
      role: member.role,
      roles,
      permissions,
      isOwner,
      user: member.user,
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    companyId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({ data: { companyId, actorUserId, action, entityType, entityId, metadata } });
  }
}

function actorHasRole(access: EffectiveAccess, roleId: string) {
  return access.roles.some((role) => role.id === roleId);
}
