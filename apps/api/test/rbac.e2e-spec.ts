import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";

jest.setTimeout(60_000);

type RoleRecord = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  isOwnerRole: boolean;
  memberCount: number;
  permissions: Array<{ key: string }>;
};
type MembershipRecord = {
  id: string;
  userId: string;
  roles: Array<{ id: string; key: string }>;
  permissions: string[];
  isOwner: boolean;
  user: { email: string };
};
type SessionUser = {
  id: string;
  email: string;
  locale: string;
  activeCompanyId: string | null;
  memberships: Array<{
    id: string;
    membershipId: string;
    permissions: string[];
    roles: Array<{ id: string; key: string }>;
    isOwner: boolean;
    isAdministrator: boolean;
  }>;
};

describe("RBAC API", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseUrl: string;
  const suffix = randomUUID();
  const userIds: string[] = [];
  const tenantCleanup: Array<{ ownerUserId: string; companyId: string }> = [];

  const ownerEmail = `rbac-owner-${suffix}@nexus.local`;
  const memberEmail = `rbac-member-${suffix}@nexus.local`;
  const password = `Nexus-rbac-${suffix}-C7!`;

  async function request(path: string, options: RequestInit = {}) {
    return fetch(`${baseUrl}/api/v1${path}`, {
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) },
    });
  }

  function cookieOf(response: Response) {
    return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }

  async function readJson<T>(response: Response) {
    return (await response.json()) as T;
  }

  async function register(name: string, email: string, companyName: string) {
    const response = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, companyName }),
    });
    expect(response.status).toBe(201);
    const payload = await readJson<{
      user: { id: string };
      company: { id: string };
      developmentVerificationUrl?: string;
    }>(response);
    userIds.push(payload.user.id);
    tenantCleanup.push({ ownerUserId: payload.user.id, companyId: payload.company.id });
    const token = new URL(payload.developmentVerificationUrl!).searchParams.get("token");
    const verified = await request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
    expect(verified.status).toBe(201);
    return payload;
  }

  async function login(email: string) {
    const response = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    expect(response.status).toBe(201);
    return cookieOf(response);
  }

  async function me(cookie: string) {
    const response = await request("/auth/me", { headers: { cookie } });
    expect(response.status).toBe(200);
    return readJson<SessionUser>(response);
  }

  async function listRoles(cookie: string) {
    const response = await request("/roles", { headers: { cookie } });
    expect(response.status).toBe(200);
    return readJson<RoleRecord[]>(response);
  }

  async function listMemberships(cookie: string) {
    const response = await request("/memberships", { headers: { cookie } });
    expect(response.status).toBe(200);
    return readJson<MembershipRecord[]>(response);
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("The test API did not open a TCP port");
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      for (const { ownerUserId, companyId } of tenantCleanup.reverse()) {
        await prisma
          .withTenantContext(ownerUserId, companyId, async (tx) => {
            await tx.auditLog.deleteMany({ where: { companyId } });
            await tx.membershipRole.deleteMany({ where: { companyId } });
            await tx.membership.deleteMany({ where: { companyId } });
            await tx.rolePermission.deleteMany({ where: { companyId } });
            await tx.role.deleteMany({ where: { companyId } });
            await tx.company.delete({ where: { id: companyId } });
          })
          .catch(() => undefined);
      }
      for (const userId of [...new Set(userIds)]) {
        await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
      }
    }
    if (app) await app.close();
  });

  it("manages custom roles, propagates permission changes to members and enforces role protections", async () => {
    const owner = await register("RBAC Owner", ownerEmail, `RBAC Owner ${suffix.slice(0, 8)}`);
    const ownerCookie = await login(ownerEmail);
    const ownerRoles = await listRoles(ownerCookie);
    const ownerRole = ownerRoles.find((role) => role.key === "company_owner")!;
    expect(ownerRole).toBeDefined();
    expect(ownerRole.isOwnerRole).toBe(true);
    expect(ownerRole.permissions.length).toBeGreaterThan(0);

    const stockRoleResponse = await request("/roles", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({
        key: "stock_clerk",
        name: "Stock Clerk",
        description: "Receives and transfers stock",
        permissionKeys: ["inventory.read", "inventory.create"],
      }),
    });
    expect(stockRoleResponse.status).toBe(201);
    const stockRole = await readJson<RoleRecord>(stockRoleResponse);
    expect(stockRole.permissions.map(({ key }) => key).sort()).toEqual(["inventory.create", "inventory.read"]);

    const duplicateResponse = await request(`/roles/${stockRole.id}/duplicate`, {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ key: "stock_clerk_copy", name: "Stock Clerk copy" }),
    });
    expect(duplicateResponse.status).toBe(201);
    const duplicateRole = await readJson<RoleRecord>(duplicateResponse);
    expect(duplicateRole.permissions.map(({ key }) => key).sort()).toEqual(["inventory.create", "inventory.read"]);

    const member = await register("RBAC Member", memberEmail, `RBAC Member ${suffix.slice(0, 8)}`);
    const memberCookie = await login(memberEmail);

    const baseRoleResponse = await request("/roles", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ key: "member_base", name: "Member base", permissionKeys: ["company.read"] }),
    });
    expect(baseRoleResponse.status).toBe(201);
    const baseRole = await readJson<RoleRecord>(baseRoleResponse);

    const employeeRole = await prisma.withTenantContext(owner.user.id, owner.company.id, async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { companyId: owner.company.id, key: baseRole.key } });
      const membership = await tx.membership.create({
        data: { companyId: owner.company.id, userId: member.user.id, roleId: role.id, status: "ACTIVE", joinedAt: new Date() },
      });
      await tx.membershipRole.create({
        data: { companyId: owner.company.id, membershipId: membership.id, roleId: role.id, assignedByUserId: owner.user.id },
      });
      return { role, membership };
    });
    const memberId = employeeRole.membership.id;

    const selected = await request("/auth/active-company", {
      method: "POST",
      headers: { cookie: memberCookie },
      body: JSON.stringify({ companyId: owner.company.id }),
    });
    expect(selected.status).toBe(201);

    const initialSession = await me(memberCookie);
    expect(initialSession.memberships.find((item) => item.id === owner.company.id)!.permissions).not.toContain("inventory.read");
    expect((await request("/inventory/items", { headers: { cookie: memberCookie } })).status).toBe(403);

    const assignResponse = await request(`/memberships/${memberId}/roles`, {
      method: "PUT",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ roleIds: [stockRole.id] }),
    });
    expect(assignResponse.status).toBe(200);
    const assigned = await readJson<MembershipRecord>(assignResponse);
    expect(assigned.roles.map(({ key }) => key)).toEqual(["stock_clerk"]);

    const grantedSession = await me(memberCookie);
    expect(grantedSession.memberships.find((item) => item.id === owner.company.id)!.permissions.sort()).toEqual(["inventory.create", "inventory.read"]);
    expect((await request("/inventory/items", { headers: { cookie: memberCookie } })).status).toBe(200);
    expect(
      (
        await request("/inventory/warehouses", {
          method: "POST",
          headers: { cookie: memberCookie },
          body: JSON.stringify({ code: "RBAC-WH", name: "RBAC warehouse" }),
        })
      ).status,
    ).toBe(201);
    expect((await request("/sales/quotations", { headers: { cookie: memberCookie } })).status).toBe(403);

    const updatePermissions = await request(`/roles/${stockRole.id}/permissions`, {
      method: "PUT",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ permissionKeys: ["inventory.read", "sales.read"] }),
    });
    expect(updatePermissions.status).toBe(200);

    expect((await request("/sales/quotations", { headers: { cookie: memberCookie } })).status).toBe(200);
    expect(
      (
        await request("/inventory/warehouses", {
          method: "POST",
          headers: { cookie: memberCookie },
          body: JSON.stringify({ code: "RBAC-WH2", name: "Forbidden warehouse" }),
        })
      ).status,
    ).toBe(403);

    const crmRoleResponse = await request("/roles", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ key: "crm_viewer", name: "CRM Viewer", permissionKeys: ["crm.read"] }),
    });
    expect(crmRoleResponse.status).toBe(201);
    const crmRole = await readJson<RoleRecord>(crmRoleResponse);

    const addRole = await request(`/memberships/${memberId}/roles`, {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ roleId: crmRole.id }),
    });
    expect(addRole.status).toBe(201);
    const unionedSession = await me(memberCookie);
    expect(unionedSession.memberships.find((item) => item.id === owner.company.id)!.permissions.sort()).toEqual(["crm.read", "inventory.read", "sales.read"]);
    expect((await request("/crm/customers", { headers: { cookie: memberCookie } })).status).toBe(200);
    expect((await request("/inventory/items", { headers: { cookie: memberCookie } })).status).toBe(200);
    expect((await request("/sales/quotations", { headers: { cookie: memberCookie } })).status).toBe(200);

    expect(
      (
        await request(`/roles/${ownerRole.id}/permissions`, {
          method: "PUT",
          headers: { cookie: ownerCookie },
          body: JSON.stringify({ permissionKeys: ["company.read"] }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/roles/${ownerRole.id}`, {
          method: "PATCH",
          headers: { cookie: ownerCookie },
          body: JSON.stringify({ name: "Renamed owner" }),
        })
      ).status,
    ).toBe(403);
    expect((await request(`/roles/${ownerRole.id}`, { method: "DELETE", headers: { cookie: ownerCookie } })).status).toBe(403);
    expect((await request(`/roles/${stockRole.id}`, { method: "DELETE", headers: { cookie: ownerCookie } })).status).toBe(409);
    expect((await request(`/roles/${duplicateRole.id}`, { method: "DELETE", headers: { cookie: ownerCookie } })).status).toBe(200);

    const ownerMembership = (await listMemberships(ownerCookie)).find((item) => item.user.email === ownerEmail)!;
    const selfChange = await request(`/memberships/${ownerMembership.id}/roles`, {
      method: "PUT",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ roleIds: [ownerRole.id] }),
    });
    expect(selfChange.status).toBe(403);
    expect(await readJson<{ message: string }>(selfChange)).toMatchObject({
      message: "You cannot change your own role assignment. Ask another administrator to do it.",
    });

    const managerRoleResponse = await request("/roles", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({
        key: "access_manager",
        name: "Access Manager",
        permissionKeys: ["administration.read", "administration.manage", "administration.update"],
      }),
    });
    expect(managerRoleResponse.status).toBe(201);
    const managerRole = await readJson<RoleRecord>(managerRoleResponse);

    const promoteMember = await request(`/memberships/${memberId}/roles`, {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ roleId: managerRole.id }),
    });
    expect(promoteMember.status).toBe(201);

    const removeLastOwner = await request(`/memberships/${ownerMembership.id}/roles/${ownerRole.id}`, {
      method: "DELETE",
      headers: { cookie: memberCookie },
    });
    expect(removeLastOwner.status).toBe(403);
    expect(await readJson<{ message: string }>(removeLastOwner)).toMatchObject({
      message: "A company must retain at least one active owner",
    });

    const grantOwner = await request(`/memberships/${ownerMembership.id}/roles`, {
      method: "PUT",
      headers: { cookie: memberCookie },
      body: JSON.stringify({ roleIds: [ownerRole.id] }),
    });
    expect(grantOwner.status).toBe(403);
    expect(await readJson<{ message: string }>(grantOwner)).toMatchObject({
      message: "Only a company owner can grant the owner role",
    });

    const escalation = await request("/roles", {
      method: "POST",
      headers: { cookie: memberCookie },
      body: JSON.stringify({ key: "finance_escalation", name: "Finance escalation", permissionKeys: ["finance.read"] }),
    });
    expect(escalation.status).toBe(403);
    expect((await readJson<{ message: string }>(escalation)).message).toContain("You cannot grant permissions you do not hold");

    const allowedCreate = await request("/roles", {
      method: "POST",
      headers: { cookie: memberCookie },
      body: JSON.stringify({ key: "reader_role", name: "Reader role", permissionKeys: ["administration.read"] }),
    });
    expect(allowedCreate.status).toBe(201);
    const readerRole = await readJson<RoleRecord>(allowedCreate);
    expect((await request(`/roles/${readerRole.id}`, { method: "DELETE", headers: { cookie: memberCookie } })).status).toBe(200);

    const otherCompany = await request("/companies", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ companyName: `RBAC Second ${suffix.slice(0, 8)}`, countryCode: "MA", currencyCode: "MAD" }),
    });
    expect(otherCompany.status).toBe(201);
    const secondCompany = await readJson<{ id: string }>(otherCompany);
    tenantCleanup.push({ ownerUserId: owner.user.id, companyId: secondCompany.id });

    const secondCompanyRoles = await listRoles(ownerCookie);
    expect(secondCompanyRoles.some((role) => role.id === stockRole.id)).toBe(false);
    expect((await request(`/roles/${stockRole.id}`, { headers: { cookie: ownerCookie } })).status).toBe(404);
    expect(
      (
        await request(`/memberships/${memberId}/roles`, {
          method: "PUT",
          headers: { cookie: ownerCookie },
          body: JSON.stringify({ roleIds: [stockRole.id] }),
        })
      ).status,
    ).toBe(404);

    const sameKeyElsewhere = await request("/roles", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ key: "stock_clerk", name: "Second company stock clerk", permissionKeys: ["inventory.read"] }),
    });
    expect(sameKeyElsewhere.status).toBe(201);

    const backToOwnerCompany = await request("/auth/active-company", {
      method: "POST",
      headers: { cookie: ownerCookie },
      body: JSON.stringify({ companyId: owner.company.id }),
    });
    expect(backToOwnerCompany.status).toBe(201);
    expect((await request(`/memberships/${memberId}/roles/${crmRole.id}`, { method: "DELETE", headers: { cookie: ownerCookie } })).status).toBe(200);
  });

  it("persists the user's language and returns it with the session", async () => {
    const localeEmail = `rbac-locale-${suffix}@nexus.local`;
    await register("RBAC Locale", localeEmail, `RBAC Locale ${suffix.slice(0, 8)}`);
    const cookie = await login(localeEmail);
    const before = await me(cookie);
    expect(before.locale).toBe("en");

    const changed = await request("/auth/me/locale", {
      method: "PATCH",
      headers: { cookie },
      body: JSON.stringify({ locale: "ar" }),
    });
    expect(changed.status).toBe(200);
    expect(await readJson<{ locale: string }>(changed)).toMatchObject({ locale: "ar" });

    expect((await me(cookie)).locale).toBe("ar");
    const german = await request("/auth/me/locale", {
      method: "PATCH",
      headers: { cookie },
      body: JSON.stringify({ locale: "de" }),
    });
    expect(german.status).toBe(200);
    expect(await readJson<{ locale: string }>(german)).toMatchObject({ locale: "de" });
    expect((await me(cookie)).locale).toBe("de");
    const invalid = await request("/auth/me/locale", {
      method: "PATCH",
      headers: { cookie },
      body: JSON.stringify({ locale: "es" }),
    });
    expect(invalid.status).toBe(400);
  });
});

