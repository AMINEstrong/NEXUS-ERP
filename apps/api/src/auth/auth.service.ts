import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { resolveEffectiveAccess } from "../authorization/effective-permissions.js";
import { EmailService } from "../email/email.service.js";
import { buildPasswordResetEmail, buildVerificationEmail } from "../email/email.templates.js";
import type { CreateCompanyDto } from "./create-company.dto.js";
import type { RegisterDto } from "./register.dto.js";

const OWNER_MODULES = [
  "company",
  "inventory",
  "sales",
  "purchasing",
  "finance",
  "hr",
  "crm",
  "projects",
  "reports",
  "notifications",
  "administration",
] as const;
const OWNER_ACTIONS = ["create", "read", "update", "delete", "approve", "export", "manage"] as const;
const DEMO_LOCALE_DEFAULTS = { countryCode: "MA", currencyCode: "MAD", defaultLocale: "fr-MA", timeZone: "Africa/Casablanca" };
const FREE_TRIAL_PLAN = {
  code: "free_trial",
  name: "Free Trial",
  trialDays: 14,
  usageLimits: { users: 5, companies: 1 },
  modules: ["company", "inventory", "sales", "crm"],
};

type CompanySetupInput = Pick<RegisterDto, "companyName" | "countryCode" | "currencyCode" | "defaultLocale" | "timeZone">;
type PublicCompany = {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  currencyCode: string;
  defaultLocale: string;
  timeZone: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  private get ttlHours() {
    return this.config.get<number>("SESSION_TTL_HOURS", 12);
  }

  private get webOrigin() {
    return this.config.get<string>("WEB_ORIGIN", "http://localhost:3001");
  }

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const userId = randomUUID();
    const rawToken = randomBytes(32).toString("base64url");
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { id: userId, email, name: input.name.trim(), passwordHash },
        select: { id: true, email: true, name: true },
      });
      const company = await this.provisionCompany(tx, user.id, input, "company.registered");
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(rawToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return { user, company };
    });

    const verificationUrl = `${this.webOrigin}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const verificationEmail = buildVerificationEmail({
      locale: input.defaultLocale ?? created.company.defaultLocale,
      recipientName: created.user.name,
      companyName: created.company.name,
      verificationUrl,
      expiresInHours: 24,
    });
    try {
      await this.email.send({
        to: created.user.email,
        template: "email-verification",
        subject: verificationEmail.subject,
        html: verificationEmail.html,
        text: verificationEmail.text,
      });
    } catch {
      // The account already exists. Do not fail registration or reveal
      // provider details; the user can request a new link through resend.
      this.logger.error(`Verification e-mail could not be delivered for userId=${created.user.id}`);
    }

    const response: {
      user: typeof created.user;
      company: PublicCompany;
      verificationRequired: true;
      developmentVerificationUrl?: string;
    } = {
      user: created.user,
      company: this.publicCompany(created.company),
      verificationRequired: true,
    };
    if (this.config.get<string>("NODE_ENV", "development") !== "production") {
      response.developmentVerificationUrl = verificationUrl;
    }
    return response;
  }

  async resendVerification(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const response: { status: "if_account_exists"; developmentVerificationUrl?: string } = { status: "if_account_exists" };
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, name: true, locale: true, emailVerifiedAt: true },
    });
    // Unknown or already verified accounts receive the same generic response
    // so the endpoint cannot be used for account enumeration.
    if (!user || user.emailVerifiedAt) return response;

    const rawToken = randomBytes(32).toString("base64url");
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(rawToken),
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
    });

    const verificationUrl = `${this.webOrigin}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const verificationEmail = buildVerificationEmail({
      locale: user.locale,
      recipientName: user.name,
      verificationUrl,
      expiresInHours: 24,
    });
    try {
      await this.email.send({
        to: user.email,
        template: "email-verification",
        subject: verificationEmail.subject,
        html: verificationEmail.html,
        text: verificationEmail.text,
      });
    } catch {
      this.logger.error(`Verification e-mail could not be resent for userId=${user.id}`);
    }

    if (this.config.get<string>("NODE_ENV", "development") !== "production") {
      response.developmentVerificationUrl = verificationUrl;
    }
    return response;
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true },
      });
      if (!token) throw new BadRequestException("This verification link is invalid or expired");

      const now = new Date();
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException("This verification link is invalid or expired");
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
      return { status: "email_verified" as const };
    });
  }

  async requestPasswordReset(emailInput: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: emailInput.trim().toLowerCase(), deletedAt: null, emailVerifiedAt: { not: null } },
      select: { id: true, email: true, name: true, locale: true },
    });
    // Unknown, unverified and deleted accounts all receive the same generic
    // response so this endpoint cannot be used for account enumeration.
    const response: { status: "if_account_exists"; developmentResetUrl?: string } = { status: "if_account_exists" };
    if (!user) return response;

    const rawToken = randomBytes(32).toString("base64url");
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: this.hashToken(rawToken), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });

    const resetUrl = `${this.webOrigin}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const resetEmail = buildPasswordResetEmail({
      locale: user.locale,
      recipientName: user.name,
      resetUrl,
      expiresInMinutes: 30,
    });
    try {
      await this.email.send({
        to: user.email,
        template: "password-reset",
        subject: resetEmail.subject,
        html: resetEmail.html,
        text: resetEmail.text,
      });
    } catch {
      // Delivery problems must not reveal whether the account exists.
      this.logger.error(`Password reset e-mail could not be delivered for userId=${user.id}`);
    }

    if (this.config.get<string>("NODE_ENV", "development") !== "production") {
      response.developmentResetUrl = resetUrl;
    }
    return response;
  }

  async resetPassword(rawToken: string, password: string) {
    const tokenHash = this.hashToken(rawToken);
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true },
      });
      if (!token) throw new BadRequestException("This reset link is invalid or expired");
      const now = new Date();
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException("This reset link is invalid or expired");
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: now },
      });
    });
    return { status: "password_reset" as const };
  }

  async login(emailInput: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: emailInput.trim().toLowerCase(), deletedAt: null },
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (!user.emailVerifiedAt) throw new UnauthorizedException("Email verification is required");
    if (user.mfaEnabled) throw new UnauthorizedException("MFA sign-in is not available in this phase");

    const memberships = await this.prisma.withUserContext(user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        select: { companyId: true },
        orderBy: [{ joinedAt: "asc" }, { createdAt: "asc" }],
        take: 1,
      }),
    );
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.ttlHours * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: { userId: user.id, tokenHash, expiresAt, activeCompanyId: memberships[0]?.companyId ?? null },
    });

    return {
      token: rawToken,
      expiresAt,
      user: { id: user.id, email: user.email, name: user.name, mfaEnabled: user.mfaEnabled, locale: user.locale },
      sessionId: session.id,
      activeCompanyId: session.activeCompanyId,
    };
  }

  async resolveSession(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() }, user: { deletedAt: null } },
      select: { id: true, userId: true, activeCompanyId: true },
    });
    if (!session) throw new UnauthorizedException("Authentication required");

    let activeCompanyId = session.activeCompanyId;
    if (activeCompanyId) {
      const membership = await this.prisma.withUserContext(session.userId, (tx) =>
        tx.membership.findFirst({
          where: { userId: session.userId, companyId: activeCompanyId!, status: "ACTIVE" },
          select: { companyId: true },
        }),
      );
      if (!membership) activeCompanyId = null;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), ...(activeCompanyId !== session.activeCompanyId ? { activeCompanyId } : {}) },
    });
    return { userId: session.userId, sessionId: session.id, activeCompanyId };
  }

  async currentUser(userId: string, activeCompanyId: string | null = null) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, name: true, emailVerifiedAt: true, mfaEnabled: true, locale: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException("Authentication required");
    const memberships = await this.prisma.withUserContext(user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        select: { id: true, companyId: true, roleId: true, joinedAt: true },
        orderBy: [{ joinedAt: "asc" }, { createdAt: "asc" }],
      }),
    );
    const companies = await Promise.all(
      memberships.map((membership) =>
        this.prisma.withTenantContext(user.id, membership.companyId, async (tx) => {
          const [company, access] = await Promise.all([
            tx.company.findFirst({
              where: { id: membership.companyId, deletedAt: null },
              select: { id: true, name: true, slug: true, countryCode: true, currencyCode: true, defaultLocale: true, timeZone: true },
            }),
            resolveEffectiveAccess(tx, membership),
          ]);
          if (!company) return null;
          const primaryRole = access.roles.find((role) => role.id === membership.roleId) ?? access.roles[0];
          if (!primaryRole) return null;
          return {
            ...company,
            membershipId: membership.id,
            role: { key: primaryRole.key, name: primaryRole.name },
            roles: access.roles,
            permissions: access.permissionKeys,
            isOwner: access.isOwner,
            isAdministrator: access.isAdministrator,
            joinedAt: membership.joinedAt,
          };
        }),
      ),
    );
    return { ...user, activeCompanyId, memberships: companies.filter((company) => company !== null) };
  }

  async selectCompany(userId: string, sessionId: string, companyId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const company = await tx.company.findFirst({
        where: { id: membership.companyId, deletedAt: null },
        select: { id: true, name: true, slug: true, countryCode: true, currencyCode: true, defaultLocale: true, timeZone: true },
      });
      if (!company) throw new NotFoundException("Company not found");
      const updated = await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { activeCompanyId: membership.companyId, lastSeenAt: new Date() },
      });
      if (updated.count !== 1) throw new UnauthorizedException("Authentication required");
      return company;
    });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, activeCompanyId: true },
    });
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException("Session not found");
  }

  async createCompanyForUser(userId: string, sessionId: string, input: CreateCompanyDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const company = await this.provisionCompany(tx, userId, input, "company.created");
      const updated = await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { activeCompanyId: company.id, lastSeenAt: new Date() },
      });
      if (updated.count !== 1) throw new UnauthorizedException("Authentication required");
      return company;
    });
    return this.publicCompany(result);
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async updateLocale(userId: string, locale: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { locale },
      select: { id: true, locale: true },
    });
    return updated;
  }

  hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private async provisionCompany(
    tx: Prisma.TransactionClient,
    userId: string,
    input: CompanySetupInput,
    auditAction: string,
  ): Promise<PublicCompany> {
    const companyId = randomUUID();
    const countryCode = (input.countryCode ?? DEMO_LOCALE_DEFAULTS.countryCode).toUpperCase();
    const currencyCode = (input.currencyCode ?? DEMO_LOCALE_DEFAULTS.currencyCode).toUpperCase();
    const defaultLocale = input.defaultLocale ?? DEMO_LOCALE_DEFAULTS.defaultLocale;
    const timeZone = input.timeZone ?? DEMO_LOCALE_DEFAULTS.timeZone;
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format();
    } catch {
      throw new BadRequestException("A valid IANA time zone is required");
    }

    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_company_id', ${companyId}, true)`;
    const company = await tx.company.create({
      data: {
        id: companyId,
        name: input.companyName.trim(),
        slug: `${this.slugify(input.companyName)}-${randomBytes(4).toString("hex")}`,
        countryCode,
        currencyCode,
        defaultLocale,
        timeZone,
      },
      select: { id: true, name: true, slug: true, countryCode: true, currencyCode: true, defaultLocale: true, timeZone: true },
    });

    const role = await tx.role.create({
      data: { companyId: company.id, key: "company_owner", name: "Company Owner", isSystem: true },
    });
    const permissions = await Promise.all(
      OWNER_MODULES.flatMap((module) =>
        OWNER_ACTIONS.map((action) => {
          const key = `${module}.${action}`;
          return tx.permission.upsert({
            where: { key },
            update: {},
            create: { key, module, action },
            select: { id: true },
          });
        }),
      ),
    );
    await tx.rolePermission.createMany({
      data: permissions.map(({ id: permissionId }) => ({ companyId: company.id, roleId: role.id, permissionId })),
    });
    const membership = await tx.membership.create({
      data: { companyId: company.id, userId, roleId: role.id, status: "ACTIVE", joinedAt: new Date() },
    });
    await tx.membershipRole.create({
      data: { companyId: company.id, membershipId: membership.id, roleId: role.id, assignedByUserId: userId },
    });
    const plan = await tx.plan.upsert({
      where: { code: FREE_TRIAL_PLAN.code },
      update: {},
      create: FREE_TRIAL_PLAN,
      select: { id: true },
    });
    const now = new Date();
    await tx.subscription.create({
      data: {
        id: company.id,
        companyId: company.id,
        planId: plan.id,
        status: "TRIALING",
        startedAt: now,
        trialEndsAt: new Date(now.getTime() + FREE_TRIAL_PLAN.trialDays * 24 * 60 * 60 * 1000),
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        actorUserId: userId,
        action: auditAction,
        entityType: "Company",
        entityId: company.id,
        metadata: { membershipId: membership.id, roleKey: role.key },
      },
    });
    return company;
  }

  private publicCompany(company: PublicCompany): PublicCompany {
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      countryCode: company.countryCode,
      currencyCode: company.currencyCode,
      defaultLocale: company.defaultLocale,
      timeZone: company.timeZone,
    };
  }

  private slugify(value: string) {
    const slug = value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return slug || "company";
  }
}
