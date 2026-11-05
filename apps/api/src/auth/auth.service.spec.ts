import { ConfigService } from "@nestjs/config";
import { jest } from "@jest/globals";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";
import { AuthService } from "./auth.service.js";

describe("AuthService", () => {
  const password = "a-safe-development-password";
  type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
  let prisma: {
    user: { findFirst: AsyncMock };
    session: { create: AsyncMock; findFirst: AsyncMock; update: AsyncMock; updateMany: AsyncMock };
    withUserContext: AsyncMock;
    $transaction: AsyncMock;
  };
  let config: { get: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn<(...args: any[]) => Promise<any>>() },
      session: {
        create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "session-id" }),
        findFirst: jest.fn<(...args: any[]) => Promise<any>>(),
        update: jest.fn<(...args: any[]) => Promise<any>>(),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>(),
      },
      withUserContext: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]),
      $transaction: jest.fn<(...args: any[]) => Promise<any>>(),
    };
    config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
    service = new AuthService(prisma as never, config as unknown as ConfigService);
  });

  it("creates an expiring session and stores only its SHA-256 token hash", async () => {
    const passwordHash = await argon2.hash(password);
    prisma.user.findFirst.mockResolvedValue({
      id: "user-id",
      email: "owner@example.test",
      name: "Owner",
      passwordHash,
      emailVerifiedAt: new Date(),
      mfaEnabled: false,
    });

    const result = await service.login(" OWNER@Example.Test ", password);
    const storedTokenHash = prisma.session.create.mock.calls[0][0].data.tokenHash as string;

    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { email: "owner@example.test", deletedAt: null } });
    expect(result.token).toHaveLength(43);
    expect(storedTokenHash).toBe(createHash("sha256").update(result.token).digest("hex"));
    expect(storedTokenHash).not.toBe(result.token);
    expect(result.user).toEqual({ id: "user-id", email: "owner@example.test", name: "Owner", mfaEnabled: false });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("registers an unverified owner with an isolated company, trial and one-time verification link", async () => {
    const company = {
      id: "company-id",
      name: "Atlas Manufacturing",
      slug: "atlas-manufacturing-a1b2c3d4",
      countryCode: "MA",
      currencyCode: "MAD",
      defaultLocale: "fr-MA",
      timeZone: "Africa/Casablanca",
    };
    const tx = {
      user: { create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "user-id", email: "owner@example.test", name: "Owner" }) },
      company: { create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(company) },
      role: { create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "role-id", key: "company_owner" }) },
      permission: { upsert: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "permission-id" }) },
      rolePermission: { createMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 77 }) },
      membership: { create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "membership-id" }) },
      plan: { upsert: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "plan-id" }) },
      subscription: { create: jest.fn<(...args: any[]) => Promise<any>>() },
      auditLog: { create: jest.fn<(...args: any[]) => Promise<any>>() },
      emailVerificationToken: { create: jest.fn<(...args: any[]) => Promise<any>>() },
      $executeRaw: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(1),
    };
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

    const result = await service.register({
      name: "Owner",
      email: " OWNER@Example.Test ",
      password,
      companyName: "Atlas Manufacturing",
    });
    const verificationUrl = new URL(result.developmentVerificationUrl!);
    const token = verificationUrl.searchParams.get("token")!;

    expect(result.user).toEqual({ id: "user-id", email: "owner@example.test", name: "Owner" });
    expect(result.company).toMatchObject({ name: "Atlas Manufacturing", countryCode: "MA", currencyCode: "MAD" });
    expect(verificationUrl.pathname).toBe("/verify-email");
    expect(token).toHaveLength(43);
    expect(tx.emailVerificationToken.create).toHaveBeenCalledWith({
      data: { userId: "user-id", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: expect.any(Date) },
    });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ roleId: "role-id" })]) }));
    expect(tx.membership.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "user-id", roleId: "role-id", status: "ACTIVE" }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "company.registered", entityId: "company-id" }) }));
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it("consumes a valid email verification token once", async () => {
    const token = "a-valid-one-time-verification-token-value";
    const tx = {
      emailVerificationToken: {
        findFirst: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "verification-id", userId: "user-id" }),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn<(...args: any[]) => Promise<any>>() },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

    await expect(service.verifyEmail(token)).resolves.toEqual({ status: "email_verified" });
    expect(tx.emailVerificationToken.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: createHash("sha256").update(token).digest("hex"), usedAt: null, expiresAt: { gt: expect.any(Date) } } }));
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-id" }, data: { emailVerifiedAt: expect.any(Date) } });
  });

  it("rejects a password mismatch and does not create a session", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-id",
      passwordHash: await argon2.hash(password),
      emailVerifiedAt: new Date(),
    });

    await expect(service.login("owner@example.test", "wrong-password-value")).rejects.toThrow("Invalid email or password");
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it("does not bypass MFA for an account that requires it", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-id",
      passwordHash: await argon2.hash(password),
      emailVerifiedAt: new Date(),
      mfaEnabled: true,
    });

    await expect(service.login("owner@example.test", password)).rejects.toThrow("MFA sign-in is not available in this phase");
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it("revokes the authenticated session on logout", async () => {
    await service.logout("session-id");
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: "session-id", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
