import { BadRequestException, Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { CreateCompanyDto } from "../auth/create-company.dto.js";
import { TenantContextService } from "../database/tenant-context.service.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { UpdateCompanyDto } from "./update-company.dto.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";

@ApiTags("companies")
@Controller("companies")
@UseGuards(AuthGuard)
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
export class CompaniesController {
  constructor(private readonly auth: AuthService, private readonly tenants: TenantContextService) {}

  @Get()
  @ApiOperation({ summary: "List only active companies that belong to the signed-in user" })
  async list(@Req() request: AuthenticatedRequest) {
    const current = await this.auth.currentUser(request.auth!.userId, request.auth!.activeCompanyId);
    return current.memberships;
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Create a new company and make the signed-in user its owner" })
  create(@Body() body: CreateCompanyDto, @Req() request: AuthenticatedRequest) {
    return this.auth.createCompanyForUser(request.auth!.userId, request.auth!.sessionId, body);
  }

  @Get("current")
  @UseGuards(PermissionGuard)
  @RequirePermissions("company.read")
  @ApiOperation({ summary: "Read the active company after checking company.read" })
  current(@Req() request: AuthenticatedRequest) {
    const companyId = request.auth!.activeCompanyId!;
    return this.tenants.run(request.auth!.userId, companyId, async (tx, membership) => {
      const [company, role] = await Promise.all([
        tx.company.findFirst({
          where: { id: membership.companyId, deletedAt: null },
          select: { id: true, name: true, slug: true, legalName: true, countryCode: true, currencyCode: true, defaultLocale: true, timeZone: true, fiscalYearStartMonth: true, settings: true, createdAt: true, updatedAt: true },
        }),
        tx.role.findFirst({ where: { id: membership.roleId }, select: { key: true, name: true } }),
      ]);
      if (!company || !role) throw new BadRequestException("The active company workspace is unavailable");
      return { ...company, role };
    });
  }

  @Patch("current")
  @UseGuards(PermissionGuard)
  @RequirePermissions("company.update")
  @ApiOperation({ summary: "Update the active company profile and write an audit event" })
  updateCurrent(@Body() body: UpdateCompanyDto, @Req() request: AuthenticatedRequest) {
    const companyId = request.auth!.activeCompanyId!;
    const data: Prisma.CompanyUpdateInput = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.legalName !== undefined) data.legalName = body.legalName.trim() || null;
    if (body.countryCode !== undefined) data.countryCode = body.countryCode.toUpperCase();
    if (body.currencyCode !== undefined) data.currencyCode = body.currencyCode.toUpperCase();
    if (body.defaultLocale !== undefined) data.defaultLocale = body.defaultLocale;
    if (body.fiscalYearStartMonth !== undefined) data.fiscalYearStartMonth = body.fiscalYearStartMonth;
    if (body.settings !== undefined) data.settings = body.settings as Prisma.InputJsonObject;
    if (body.timeZone !== undefined) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).format();
      } catch {
        throw new BadRequestException("A valid IANA time zone is required");
      }
      data.timeZone = body.timeZone;
    }
    if (!Object.keys(data).length) throw new BadRequestException("At least one company field is required");

    return this.tenants.run(request.auth!.userId, companyId, async (tx, membership) => {
      const company = await tx.company.update({
        where: { id: membership.companyId },
        data,
        select: { id: true, name: true, slug: true, legalName: true, countryCode: true, currencyCode: true, defaultLocale: true, timeZone: true, fiscalYearStartMonth: true, settings: true, updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          companyId: membership.companyId,
          actorUserId: request.auth!.userId,
          action: "company.updated",
          entityType: "Company",
          entityId: membership.companyId,
          metadata: { changedFields: Object.keys(data) },
        },
      });
      return company;
    });
  }
}
