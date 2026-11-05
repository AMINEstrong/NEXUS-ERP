import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import { CreateCrmActivityDto, CreateCrmCustomerDto, CreateCrmOpportunityDto, CrmListQueryDto, UpdateCrmCustomerDto, UpdateCrmOpportunityDto } from "./crm.dto.js";
import { CrmService } from "./crm.service.js";

@ApiTags("crm")
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
@Controller("crm")
@UseGuards(AuthGuard, PermissionGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get("summary") @RequirePermissions("crm.read") @ApiOperation({ summary: "Read customer, pipeline and activity KPIs" })
  summary(@Req() request: AuthenticatedRequest) { return this.crm.summary(request.auth!.userId, request.auth!.activeCompanyId!); }

  @Get("customers") @RequirePermissions("crm.read")
  listCustomers(@Query() query: CrmListQueryDto, @Req() request: AuthenticatedRequest) { return this.crm.listCustomers(request.auth!.userId, request.auth!.activeCompanyId!, query); }

  @Post("customers") @RequirePermissions("crm.create") @ApiOperation({ summary: "Add a customer or prospect" })
  createCustomer(@Body() body: CreateCrmCustomerDto, @Req() request: AuthenticatedRequest) { return this.crm.createCustomer(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body); }

  @Patch("customers/:id") @RequirePermissions("crm.update")
  updateCustomer(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: UpdateCrmCustomerDto, @Req() request: AuthenticatedRequest) { return this.crm.updateCustomer(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id, body); }

  @Get("opportunities") @RequirePermissions("crm.read")
  listOpportunities(@Query() query: CrmListQueryDto, @Req() request: AuthenticatedRequest) { return this.crm.listOpportunities(request.auth!.userId, request.auth!.activeCompanyId!, query); }

  @Post("opportunities") @RequirePermissions("crm.create") @ApiOperation({ summary: "Create a sales opportunity in the active company" })
  createOpportunity(@Body() body: CreateCrmOpportunityDto, @Req() request: AuthenticatedRequest) { return this.crm.createOpportunity(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body); }

  @Patch("opportunities/:id") @RequirePermissions("crm.update")
  updateOpportunity(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: UpdateCrmOpportunityDto, @Req() request: AuthenticatedRequest) { return this.crm.updateOpportunity(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id, body); }

  @Get("activities") @RequirePermissions("crm.read")
  listActivities(@Query() query: CrmListQueryDto, @Req() request: AuthenticatedRequest) { return this.crm.listActivities(request.auth!.userId, request.auth!.activeCompanyId!, query); }

  @Post("activities") @RequirePermissions("crm.create") @ApiOperation({ summary: "Log a CRM call, email, meeting, task or note" })
  createActivity(@Body() body: CreateCrmActivityDto, @Req() request: AuthenticatedRequest) { return this.crm.createActivity(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body); }

  @Patch("activities/:id/complete") @RequirePermissions("crm.update")
  completeActivity(@Param("id", new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.crm.completeActivity(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id); }
}
