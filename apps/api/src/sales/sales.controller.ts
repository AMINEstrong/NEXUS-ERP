import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import { CreateSalesInvoiceDto, CreateSalesQuotationDto, DeliverSalesOrderDto, RecordSalesPaymentDto, SalesListQueryDto } from "./sales.dto.js";
import { SalesService } from "./sales.service.js";

@ApiTags("sales")
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
@Controller("sales")
@UseGuards(AuthGuard, PermissionGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get("summary") @RequirePermissions("sales.read") @ApiOperation({ summary: "Read sales and receivables KPIs" })
  summary(@Req() request: AuthenticatedRequest) { return this.sales.summary(request.auth!.userId, request.auth!.activeCompanyId!); }

  @Get("quotations") @RequirePermissions("sales.read")
  listQuotations(@Query() query: SalesListQueryDto, @Req() request: AuthenticatedRequest) { return this.sales.listQuotations(request.auth!.userId, request.auth!.activeCompanyId!, query); }

  @Post("quotations") @RequirePermissions("sales.create") @ApiOperation({ summary: "Create a priced sales quotation" })
  createQuotation(@Body() body: CreateSalesQuotationDto, @Req() request: AuthenticatedRequest) { return this.sales.createQuotation(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body); }

  @Post("quotations/:id/send") @RequirePermissions("sales.update")
  sendQuotation(@Param("id", new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.sales.sendQuotation(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id); }

  @Post("quotations/:id/convert") @RequirePermissions("sales.approve")
  convertQuotation(@Param("id", new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.sales.convertQuotation(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id); }

  @Get("orders") @RequirePermissions("sales.read")
  listOrders(@Query() query: SalesListQueryDto, @Req() request: AuthenticatedRequest) { return this.sales.listOrders(request.auth!.userId, request.auth!.activeCompanyId!, query); }

  @Post("orders/:id/deliver") @RequirePermissions("sales.approve") @ApiOperation({ summary: "Ship an order and decrement inventory atomically" })
  deliverOrder(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: DeliverSalesOrderDto, @Req() request: AuthenticatedRequest) { return this.sales.deliverOrder(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id, body); }

  @Post("orders/:id/invoices") @RequirePermissions("sales.approve") @ApiOperation({ summary: "Invoice delivered order quantities and post balanced accounting entries" })
  createInvoice(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: CreateSalesInvoiceDto, @Req() request: AuthenticatedRequest) { return this.sales.createInvoice(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id, body); }

  @Get("invoices") @RequirePermissions("sales.read")
  listInvoices(@Query() query: SalesListQueryDto, @Req() request: AuthenticatedRequest) { return this.sales.listInvoices(request.auth!.userId, request.auth!.activeCompanyId!, query); }

  @Post("invoices/:id/payments") @RequirePermissions("sales.approve") @ApiOperation({ summary: "Record a customer payment and post its accounting entry" })
  recordPayment(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: RecordSalesPaymentDto, @Req() request: AuthenticatedRequest) { return this.sales.recordPayment(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, id, body); }
}
