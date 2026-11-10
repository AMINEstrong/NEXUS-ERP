import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import { DashboardQueryDto, DashboardSearchQueryDto } from "./dashboard.dto.js";
import { DashboardService } from "./dashboard.service.js";

@ApiTags("dashboard")
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
@Controller("dashboard")
@UseGuards(AuthGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions("reports.read")
  @ApiOperation({ summary: "Read tenant-scoped executive KPIs, charts and dashboard widgets" })
  overview(@Query() query: DashboardQueryDto, @Req() request: AuthenticatedRequest) {
    return this.dashboard.overview(request.auth!.userId, request.auth!.activeCompanyId!, query.range);
  }

  @Get("notifications")
  @RequirePermissions("reports.read")
  @ApiOperation({ summary: "Read notifications derived from live tenant operational data" })
  notifications(@Req() request: AuthenticatedRequest) {
    return this.dashboard.notifications(request.auth!.userId, request.auth!.activeCompanyId!);
  }

  @Get("search")
  @RequirePermissions("reports.read")
  @ApiOperation({ summary: "Search tenant records the active role is allowed to read" })
  search(@Query() query: DashboardSearchQueryDto, @Req() request: AuthenticatedRequest) {
    return this.dashboard.search(request.auth!.userId, request.auth!.activeCompanyId!, query.q);
  }
}
