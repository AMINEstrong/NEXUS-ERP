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
    passwordResetToken: { create: AsyncMock };
    withUserContext: AsyncMock;
    $transaction: AsyncMock;
  };
  let config: { get: jest.Mock };
  let email: { send: AsyncMock };
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
      passwordResetToken: { create: jest.fn<(...args: any[]) => Promise<any>>() },
      $transaction: jest.fn<(...args: any[]) => Promise<any>>(),
    };
    config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
    email = { send: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined) };
    service = new AuthService(prisma as never, config as unknown as ConfigService, email as never);
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
      membershipRole: { create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "membership-role-id" }) },
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
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.test",
        template: "email-verification",
        subject: "Vérifiez votre adresse e-mail NEXUS ERP",
      }),
    );
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

  it("rejects an expired or unknown verification token", async () => {
    const tx = {
      emailVerificationToken: {
        findFirst: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>(),
      },
      user: { update: jest.fn<(...args: any[]) => Promise<any>>() },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

    await expect(service.verifyEmail("an-expired-or-unknown-verification-token")).rejects.toThrow(
      "This verification link is invalid or expired",
    );
    expect(tx.emailVerificationToken.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects reuse of a consumed verification token", async () => {
    const tx = {
      emailVerificationToken: {
        findFirst: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "verification-id", userId: "user-id" }),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 0 }),
      },
      user: { update: jest.fn<(...args: any[]) => Promise<any>>() },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

    await expect(service.verifyEmail("an-already-consumed-verification-token")).rejects.toThrow(
      "This verification link is invalid or expired",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("returns a generic response without sending mail for an unknown reset request", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.requestPasswordReset("unknown@example.test")).resolves.toEqual({ status: "if_account_exists" });
    expect(email.send).not.toHaveBeenCalled();
  });

  it("sends a localized one-time password reset link and stores only its hash", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-id",
      email: "owner@example.test",
      name: "Owner",
      locale: "ar-MA",
    });
    prisma.passwordResetToken.create = jest.fn<(...args: any[]) => Promise<any>>();

    const result = await service.requestPasswordReset(" OWNER@Example.Test ");
    const resetUrl = new URL(result.developmentResetUrl!);
    const token = resetUrl.searchParams.get("token")!;
    const storedHash = (prisma.passwordResetToken.create as AsyncMock).mock.calls[0][0].data.tokenHash as string;

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "owner@example.test", deletedAt: null, emailVerifiedAt: { not: null } },
      select: { id: true, email: true, name: true, locale: true },
    });
    expect(resetUrl.pathname).toBe("/reset-password");
    expect(storedHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(storedHash).not.toBe(token);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.test",
        template: "password-reset",
        subject: "إعادة تعيين كلمة المرور في NEXUS ERP",
      }),
    );
  });

  it("still returns the generic reset response when the provider fails", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "user-id", email: "owner@example.test", name: "Owner", locale: "en" });
    prisma.passwordResetToken.create = jest.fn<(...args: any[]) => Promise<any>>();
    email.send.mockRejectedValue(new Error("provider unavailable"));

    await expect(service.requestPasswordReset("owner@example.test")).resolves.toMatchObject({ status: "if_account_exists" });
  });

  it("rejects an expired or unknown password reset token", async () => {
    const tx = {
      passwordResetToken: {
        findFirst: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>(),
      },
      user: { update: jest.fn<(...args: any[]) => Promise<any>>() },
      session: { updateMany: jest.fn<(...args: any[]) => Promise<any>>() },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

    await expect(service.resetPassword("an-expired-or-unknown-reset-token", password)).rejects.toThrow(
      "This reset link is invalid or expired",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it("rejects reuse of a consumed password reset token", async () => {
    const tx = {
      passwordResetToken: {
        findFirst: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: "reset-id", userId: "user-id" }),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 0 }),
      },
      user: { update: jest.fn<(...args: any[]) => Promise<any>>() },
      session: { updateMany: jest.fn<(...args: any[]) => Promise<any>>() },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

    await expect(service.resetPassword("an-already-consumed-reset-token", password)).rejects.toThrow(
      "This reset link is invalid or expired",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("resends verification once, invalidating older tokens, and stays generic for unknown accounts", async () => {
    const tx = {
      emailVerificationToken: {
        updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 0 }),
        create: jest.fn<(...args: any[]) => Promise<any>>(),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(tx));

    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.resendVerification("unknown@example.test")).resolves.toEqual({ status: "if_account_exists" });
    expect(email.send).not.toHaveBeenCalled();

    prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-id",
      email: "owner@example.test",
      name: "Owner",
      locale: "de-DE",
      emailVerifiedAt: null,
    });
    const result = await service.resendVerification("owner@example.test");
    const token = new URL(result.developmentVerificationUrl!).searchParams.get("token")!;

    expect(tx.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-id", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.emailVerificationToken.create).toHaveBeenCalledWith({
      data: { userId: "user-id", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: expect.any(Date) },
    });
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.test",
        template: "email-verification",
        subject: "Bestätigen Sie Ihre NEXUS ERP-E-Mail-Adresse",
      }),
    );
  });

  it("does not resend verification for an already verified account", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-id",
      email: "owner@example.test",
      name: "Owner",
      locale: "en",
      emailVerifiedAt: new Date(),
    });

    await expect(service.resendVerification("owner@example.test")).resolves.toEqual({ status: "if_account_exists" });
    expect(email.send).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
