import type { Prisma } from "../../generated/prisma/client.js";

export const OWNER_ROLE_KEY = "company_owner";
export const TENANT_PERMISSION_MODULES_EXCLUDED = new Set(["platform"]);

export type MembershipScope = {
  id: string;
  companyId: string;
  roleId: string;
};

export type EffectiveRole = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
};

export type EffectiveAccess = {
  roles: EffectiveRole[];
  permissionKeys: string[];
  isOwner: boolean;
  isAdministrator: boolean;
};

type PermissionClient = Pick<Prisma.TransactionClient, "membershipRole" | "role" | "rolePermission" | "permission">;

/**
 * Effective access is the union of every active role linked to the membership,
 * plus the legacy primary role stored on memberships.role_id. A company owner
 * always receives every tenant permission, which guarantees that an owner can
 * never lock themselves out by removing one role link. Platform permissions are
 * never granted through tenant roles.
 */
export async function resolveEffectiveAccess(tx: PermissionClient, membership: MembershipScope): Promise<EffectiveAccess> {
  const links = await tx.membershipRole.findMany({
    where: { membershipId: membership.id, companyId: membership.companyId },
    select: { roleId: true },
  });
  const roleIds = Array.from(new Set([membership.roleId, ...links.map((link) => link.roleId)]));
  const roles = await tx.role.findMany({
    where: { companyId: membership.companyId, id: { in: roleIds } },
    select: { id: true, key: true, name: true, isSystem: true },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  const isOwner = roles.some((role) => role.key === OWNER_ROLE_KEY);
  const isAdministrator = isOwner || roles.some((role) => role.key === "company_admin");

  if (isOwner) {
    const all = await tx.permission.findMany({
      where: { module: { notIn: [...TENANT_PERMISSION_MODULES_EXCLUDED] } },
      select: { key: true },
      orderBy: { key: "asc" },
    });
    return { roles, permissionKeys: all.map(({ key }) => key), isOwner, isAdministrator };
  }

  const grants = await tx.rolePermission.findMany({
    where: { companyId: membership.companyId, roleId: { in: roles.map((role) => role.id) } },
    select: { permission: { select: { key: true, module: true } } },
  });
  const keys = Array.from(new Set(grants.filter(({ permission }) => !TENANT_PERMISSION_MODULES_EXCLUDED.has(permission.module)).map(({ permission }) => permission.key))).sort();
  return { roles, permissionKeys: keys, isOwner, isAdministrator };
}

export function hasPermission(permissions: Iterable<string>, required: string) {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(required);
}
