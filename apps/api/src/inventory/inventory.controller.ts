import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { PermissionGuard } from "../authorization/permission.guard.js";
import { RequirePermissions } from "../authorization/require-permissions.decorator.js";
import {
  CreateInventoryItemDto,
  CreateWarehouseDto,
  GoodsReceiptDto,
  InventoryListQueryDto,
  StockTransferDto,
  UpdateInventoryItemDto,
  UpdateWarehouseDto,
} from "./inventory.dto.js";
import { InventoryService } from "./inventory.service.js";

@ApiTags("inventory")
@ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
@Controller("inventory")
@UseGuards(AuthGuard, PermissionGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("summary")
  @RequirePermissions("inventory.read")
  @ApiOperation({ summary: "Read inventory KPIs for the active company" })
  summary(@Req() request: AuthenticatedRequest) {
    return this.inventory.summary(request.auth!.userId, request.auth!.activeCompanyId!);
  }

  @Get("items")
  @RequirePermissions("inventory.read")
  @ApiOperation({ summary: "Search and paginate the active-company item catalog" })
  listItems(@Query() query: InventoryListQueryDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.listItems(request.auth!.userId, request.auth!.activeCompanyId!, query);
  }

  @Post("items")
  @RequirePermissions("inventory.create")
  @ApiOperation({ summary: "Create an item in the active company's catalog" })
  createItem(@Body() body: CreateInventoryItemDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.createItem(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body);
  }

  @Patch("items/:itemId")
  @RequirePermissions("inventory.update")
  @ApiOperation({ summary: "Update an item without changing its stock ledger" })
  updateItem(@Param("itemId", new ParseUUIDPipe()) itemId: string, @Body() body: UpdateInventoryItemDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.updateItem(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, itemId, body);
  }

  @Delete("items/:itemId")
  @RequirePermissions("inventory.delete")
  @ApiOperation({ summary: "Archive an item only when it has no stock on hand" })
  archiveItem(@Param("itemId", new ParseUUIDPipe()) itemId: string, @Req() request: AuthenticatedRequest) {
    return this.inventory.archiveItem(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, itemId);
  }

  @Get("warehouses")
  @RequirePermissions("inventory.read")
  @ApiOperation({ summary: "Search and paginate the active-company warehouses" })
  listWarehouses(@Query() query: InventoryListQueryDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.listWarehouses(request.auth!.userId, request.auth!.activeCompanyId!, query);
  }

  @Post("warehouses")
  @RequirePermissions("inventory.create")
  @ApiOperation({ summary: "Create an inventory warehouse" })
  createWarehouse(@Body() body: CreateWarehouseDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.createWarehouse(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body);
  }

  @Patch("warehouses/:warehouseId")
  @RequirePermissions("inventory.update")
  @ApiOperation({ summary: "Update or reactivate a warehouse" })
  updateWarehouse(@Param("warehouseId", new ParseUUIDPipe()) warehouseId: string, @Body() body: UpdateWarehouseDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.updateWarehouse(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, warehouseId, body);
  }

  @Delete("warehouses/:warehouseId")
  @RequirePermissions("inventory.delete")
  @ApiOperation({ summary: "Archive a warehouse only when it has no stock on hand" })
  archiveWarehouse(@Param("warehouseId", new ParseUUIDPipe()) warehouseId: string, @Req() request: AuthenticatedRequest) {
    return this.inventory.archiveWarehouse(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, warehouseId);
  }

  @Post("receipts")
  @RequirePermissions("inventory.create")
  @ApiOperation({ summary: "Record a goods receipt and increase stock atomically" })
  receiveGoods(@Body() body: GoodsReceiptDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.receiveGoods(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body);
  }

  @Post("transfers")
  @RequirePermissions("inventory.update")
  @ApiOperation({ summary: "Transfer stock between warehouses without allowing negative balances" })
  transferStock(@Body() body: StockTransferDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.transferStock(request.auth!.userId, request.auth!.activeCompanyId!, request.auth!.userId, body);
  }

  @Get("movements")
  @RequirePermissions("inventory.read")
  @ApiOperation({ summary: "Search and paginate the immutable stock movement ledger" })
  listMovements(@Query() query: InventoryListQueryDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.listMovements(request.auth!.userId, request.auth!.activeCompanyId!, query);
  }
}
