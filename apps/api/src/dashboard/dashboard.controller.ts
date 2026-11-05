import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import { DashboardService } from "./dashboard.service.js";

@ApiTags("dashboard")
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
@Controller("dashboard")
@UseGuards(AuthGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  @RequirePermissions("company.read")
  @ApiOperation({ summary: "Read permission-aware, tenant-scoped executive dashboard metrics" })
  summary(@Req() request: AuthenticatedRequest) {
    return this.dashboard.summary(request.auth!.userId, request.auth!.activeCompanyId!);
  }
}
