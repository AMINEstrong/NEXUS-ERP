import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";

jest.setTimeout(30_000);

describe("Account and company onboarding API", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseUrl: string;
  let userId: string | null = null;
  const companyIds: string[] = [];
  const suffix = randomUUID();
  const email = `phase2-${suffix}@nexus.local`;
  const initialPassword = `Nexus-start-${suffix}-A9!`;
  const resetPassword = `Nexus-reset-${suffix}-B8!`;

  async function request(path: string, options: RequestInit = {}) {
    return fetch(`${baseUrl}/api/v1${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
  }

  function getCookie(response: Response) {
    const raw = response.headers.get("set-cookie") ?? "";
    return raw.split(";")[0] ?? "";
  }

  async function readJson<T>(response: Response) {
    return (await response.json()) as T;
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("The test API did not open a TCP port");
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (userId && prisma) {
      for (const companyId of [...companyIds].reverse()) {
        await prisma.withTenantContext(userId, companyId, (tx) => tx.company.delete({ where: { id: companyId } })).catch(() => undefined);
      }
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
    if (app) await app.close();
  });

  it("verifies a new account, creates and switches companies, and resets its password", async () => {
    const registration = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Phase Two Owner", email, password: initialPassword, companyName: `NEXUS Phase 2 ${suffix.slice(0, 8)}` }),
    });
    expect(registration.status).toBe(201);
    const registered = await readJson<{ user: { id: string }; company: { id: string }; developmentVerificationUrl?: string }>(registration);
    userId = registered.user.id;
    companyIds.push(registered.company.id);
    expect(registered.developmentVerificationUrl).toBeDefined();

    const verificationToken = new URL(registered.developmentVerificationUrl!).searchParams.get("token");
    const verified = await request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verificationToken }) });
    expect(verified.status).toBe(201);
    expect(await readJson(verified)).toEqual({ status: "email_verified" });

    const signIn = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password: initialPassword }) });
    expect(signIn.status).toBe(201);
    const cookie = getCookie(signIn);
    expect(cookie).toContain("nexus.sid=");
    const authHeaders = { cookie };

    const me = await request("/auth/me", { headers: authHeaders });
    const profile = await readJson<{ activeCompanyId: string; memberships: Array<{ id: string; name: string }> }>(me);
    expect(me.status).toBe(200);
    expect(profile.memberships).toHaveLength(1);
    expect(profile.activeCompanyId).toBe(registered.company.id);

    const createCompany = await request("/companies", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ companyName: `NEXUS Secondary ${suffix.slice(0, 8)}`, countryCode: "MA", currencyCode: "MAD" }),
    });
    expect(createCompany.status).toBe(201);
    const secondCompany = await readJson<{ id: string; name: string }>(createCompany);
    companyIds.push(secondCompany.id);

    const companyList = await request("/companies", { headers: authHeaders });
    expect(companyList.status).toBe(200);
    expect(await readJson<Array<{ id: string }>>(companyList)).toHaveLength(2);

    const companyProfile = await request("/companies/current", { headers: authHeaders });
    expect(companyProfile.status).toBe(200);
    expect((await readJson<{ id: string; currencyCode: string; role: { key: string } }>(companyProfile))).toMatchObject({
      id: secondCompany.id,
      currencyCode: "MAD",
      role: { key: "company_owner" },
    });
    const companyUpdate = await request("/companies/current", {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ legalName: `NEXUS Lifecycle SARL ${suffix.slice(0, 8)}`, defaultLocale: "en", fiscalYearStartMonth: 4 }),
    });
    expect(companyUpdate.status).toBe(200);
    expect(await readJson<{ legalName: string; defaultLocale: string; fiscalYearStartMonth: number }>(companyUpdate)).toMatchObject({
      legalName: `NEXUS Lifecycle SARL ${suffix.slice(0, 8)}`,
      defaultLocale: "en",
      fiscalYearStartMonth: 4,
    });

    const permissionList = await request("/permissions", { headers: authHeaders });
    expect(permissionList.status).toBe(200);
    const permissions = await readJson<Array<{ key: string }>>(permissionList);
    expect(permissions.some(({ key }) => key === "company.read")).toBe(true);
    const roleList = await request("/roles", { headers: authHeaders });
    expect(roleList.status).toBe(200);
    expect((await readJson<Array<{ key: string }>>(roleList)).some(({ key }) => key === "company_owner")).toBe(true);

    const customRole = await request("/roles", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ key: `phase2_${suffix.replaceAll("-", "").slice(0, 12)}`, name: "Lifecycle Auditor", description: "Created by the account lifecycle integration test", permissionKeys: ["company.read"] }),
    });
    expect(customRole.status).toBe(201);
    const createdRole = await readJson<{ id: string; permissions: Array<{ key: string }> }>(customRole);
    expect(createdRole.permissions.map(({ key }) => key)).toContain("company.read");
    const permissionUpdate = await request(`/roles/${createdRole.id}/permissions`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ permissionKeys: ["company.read", "company.update"] }),
    });
    expect(permissionUpdate.status).toBe(200);
    const updatedRole = await readJson<{ permissions: Array<{ key: string }> }>(permissionUpdate);
    expect(updatedRole.permissions.map(({ key }) => key).sort()).toEqual(["company.read", "company.update"]);

    const members = await request("/memberships", { headers: authHeaders });
    expect(members.status).toBe(200);
    expect((await readJson<Array<{ role: { key: string } }>>(members))[0]?.role.key).toBe("company_owner");

    const selection = await request("/auth/active-company", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ companyId: registered.company.id }),
    });
    expect(selection.status).toBe(201);
    const selectedProfile = await request("/auth/me", { headers: authHeaders });
    expect((await readJson<{ activeCompanyId: string }>(selectedProfile)).activeCompanyId).toBe(registered.company.id);

    const resetRequest = await request("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
    expect(resetRequest.status).toBe(201);
    const resetUrl = (await readJson<{ developmentResetUrl?: string }>(resetRequest)).developmentResetUrl;
    expect(resetUrl).toBeDefined();
    const resetToken = new URL(resetUrl!).searchParams.get("token");
    const reset = await request("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: resetToken, password: resetPassword }) });
    expect(reset.status).toBe(201);
    expect(await readJson(reset)).toEqual({ status: "password_reset" });

    const revoked = await request("/auth/me", { headers: authHeaders });
    expect(revoked.status).toBe(401);
    const newSignIn = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password: resetPassword }) });
    expect(newSignIn.status).toBe(201);
    const newCookie = getCookie(newSignIn);
    const logout = await request("/auth/logout", { method: "POST", headers: { cookie: newCookie } });
    expect(logout.status).toBe(201);
  });
});
