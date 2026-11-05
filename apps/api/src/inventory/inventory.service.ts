import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type {
  CreateInventoryItemDto,
  CreateWarehouseDto,
  GoodsReceiptDto,
  InventoryListQueryDto,
  StockTransferDto,
  UpdateInventoryItemDto,
  UpdateWarehouseDto,
} from "./inventory.dto.js";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listItems(userId: string, companyId: string, query: InventoryListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const search = query.q?.trim();
    const where: Prisma.InventoryItemWhereInput = {
      companyId,
      ...(search ? { OR: [{ sku: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}),
    };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [items, total] = await Promise.all([
        tx.inventoryItem.findMany({
          where: { ...where, companyId: membership.companyId },
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { stockBalances: { orderBy: { warehouse: { name: "asc" } }, include: { warehouse: { select: { id: true, code: true, name: true } } } } },
        }),
        tx.inventoryItem.count({ where: { ...where, companyId: membership.companyId } }),
      ]);
      return { data: items, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  createItem(userId: string, companyId: string, actorUserId: string, body: CreateInventoryItemDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      try {
        const item = await tx.inventoryItem.create({
          data: {
            companyId: membership.companyId,
            sku: body.sku.trim().toUpperCase(),
            name: body.name.trim(),
            description: body.description?.trim() || null,
            unit: body.unit?.trim() || "each",
            unitCost: new Prisma.Decimal(body.unitCost ?? "0"),
            reorderPoint: body.reorderPoint === undefined ? null : new Prisma.Decimal(body.reorderPoint),
          },
        });
        await tx.auditLog.create({
          data: { companyId: membership.companyId, actorUserId, action: "inventory.item_created", entityType: "InventoryItem", entityId: item.id, metadata: { sku: item.sku } },
        });
        return item;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("An inventory item with this SKU already exists");
        throw error;
      }
    });
  }

  updateItem(userId: string, companyId: string, actorUserId: string, itemId: string, body: UpdateInventoryItemDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const current = await tx.inventoryItem.findFirst({ where: { id: itemId, companyId: membership.companyId } });
      if (!current) throw new NotFoundException("Inventory item not found");
      const data: Prisma.InventoryItemUpdateInput = {};
      if (body.name !== undefined) data.name = body.name.trim();
      if (body.description !== undefined) data.description = body.description.trim() || null;
      if (body.unit !== undefined) data.unit = body.unit.trim();
      if (body.unitCost !== undefined) data.unitCost = new Prisma.Decimal(body.unitCost);
      if (body.reorderPoint !== undefined) data.reorderPoint = new Prisma.Decimal(body.reorderPoint);
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (!Object.keys(data).length) throw new BadRequestException("At least one item field is required");
      const updated = await tx.inventoryItem.update({ where: { id: current.id }, data });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "inventory.item_updated", entityType: "InventoryItem", entityId: current.id, metadata: { changedFields: Object.keys(data) } } });
      return updated;
    });
  }

  async archiveItem(userId: string, companyId: string, actorUserId: string, itemId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId, companyId: membership.companyId } });
      if (!item) throw new NotFoundException("Inventory item not found");
      const balances = await tx.stockBalance.findMany({ where: { companyId: membership.companyId, productId: item.id }, select: { quantity: true } });
      if (balances.some(({ quantity }) => quantity.greaterThan(0))) throw new BadRequestException("An item with stock on hand cannot be archived");
      const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { isActive: false } });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "inventory.item_archived", entityType: "InventoryItem", entityId: item.id, metadata: { sku: item.sku } } });
      return updated;
    });
  }

  listWarehouses(userId: string, companyId: string, query: InventoryListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const search = query.q?.trim();
    const where: Prisma.WarehouseWhereInput = {
      companyId,
      ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { location: { contains: search, mode: "insensitive" } }] } : {}),
    };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [data, total] = await Promise.all([
        tx.warehouse.findMany({
          where: { ...where, companyId: membership.companyId },
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { stockBalances: { select: { productId: true, quantity: true } } },
        }),
        tx.warehouse.count({ where: { ...where, companyId: membership.companyId } }),
      ]);
      return { data: data.map(({ stockBalances, ...warehouse }) => ({ ...warehouse, productCount: new Set(stockBalances.filter(({ quantity }) => quantity.greaterThan(0)).map(({ productId }) => productId)).size })), page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  createWarehouse(userId: string, companyId: string, actorUserId: string, body: CreateWarehouseDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      try {
        const warehouse = await tx.warehouse.create({ data: { companyId: membership.companyId, code: body.code.trim().toUpperCase(), name: body.name.trim(), location: body.location?.trim() || null } });
        await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "inventory.warehouse_created", entityType: "Warehouse", entityId: warehouse.id, metadata: { code: warehouse.code } } });
        return warehouse;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A warehouse with this code already exists");
        throw error;
      }
    });
  }

  updateWarehouse(userId: string, companyId: string, actorUserId: string, warehouseId: string, body: UpdateWarehouseDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const current = await tx.warehouse.findFirst({ where: { id: warehouseId, companyId: membership.companyId } });
      if (!current) throw new NotFoundException("Warehouse not found");
      const data: Prisma.WarehouseUpdateInput = {};
      if (body.name !== undefined) data.name = body.name.trim();
      if (body.location !== undefined) data.location = body.location.trim() || null;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (!Object.keys(data).length) throw new BadRequestException("At least one warehouse field is required");
      const updated = await tx.warehouse.update({ where: { id: current.id }, data });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "inventory.warehouse_updated", entityType: "Warehouse", entityId: current.id, metadata: { changedFields: Object.keys(data) } } });
      return updated;
    });
  }

  async archiveWarehouse(userId: string, companyId: string, actorUserId: string, warehouseId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, companyId: membership.companyId } });
      if (!warehouse) throw new NotFoundException("Warehouse not found");
      const balances = await tx.stockBalance.findMany({ where: { companyId: membership.companyId, warehouseId: warehouse.id }, select: { quantity: true } });
      if (balances.some(({ quantity }) => quantity.greaterThan(0))) throw new BadRequestException("A warehouse with stock on hand cannot be archived");
      const updated = await tx.warehouse.update({ where: { id: warehouse.id }, data: { isActive: false } });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "inventory.warehouse_archived", entityType: "Warehouse", entityId: warehouse.id, metadata: { code: warehouse.code } } });
      return updated;
    });
  }

  async summary(userId: string, companyId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [itemCount, warehouseCount, movementCount, stock, reorderItems] = await Promise.all([
        tx.inventoryItem.count({ where: { companyId: membership.companyId, isActive: true } }),
        tx.warehouse.count({ where: { companyId: membership.companyId, isActive: true } }),
        tx.inventoryMovement.count({ where: { companyId: membership.companyId } }),
        tx.stockBalance.aggregate({ where: { companyId: membership.companyId }, _sum: { quantity: true } }),
        tx.inventoryItem.findMany({ where: { companyId: membership.companyId, isActive: true, reorderPoint: { not: null } }, select: { reorderPoint: true, stockBalances: { select: { quantity: true } } } }),
      ]);
      const lowStockCount = reorderItems.filter((item) => {
        const total = item.stockBalances.reduce((sum, balance) => sum.add(balance.quantity), new Prisma.Decimal(0));
        return total.lessThanOrEqualTo(item.reorderPoint ?? 0);
      }).length;
      return { itemCount, warehouseCount, movementCount, totalUnits: (stock._sum.quantity ?? new Prisma.Decimal(0)).toString(), lowStockCount };
    });
  }

  async receiveGoods(userId: string, companyId: string, actorUserId: string, body: GoodsReceiptDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: body.warehouseId, companyId: membership.companyId, isActive: true } });
      if (!warehouse) throw new BadRequestException("An active warehouse in the current company is required");
      for (const line of body.lines) this.assertPositiveQuantity(line.quantity);
      const productIds = [...new Set(body.lines.map(({ productId }) => productId))];
      const items = await tx.inventoryItem.findMany({ where: { id: { in: productIds }, companyId: membership.companyId, isActive: true } });
      if (items.length !== productIds.length) throw new BadRequestException("Every receipt item must be active in the current company");
      const itemMap = new Map(items.map((item) => [item.id, item]));
      const movements = [];
      for (const line of body.lines) {
        const quantity = new Prisma.Decimal(line.quantity);
        const item = itemMap.get(line.productId)!;
        const unitCost = line.unitCost === undefined ? item.unitCost : new Prisma.Decimal(line.unitCost);
        await tx.stockBalance.upsert({
          where: { companyId_productId_warehouseId: { companyId: membership.companyId, productId: item.id, warehouseId: warehouse.id } },
          create: { companyId: membership.companyId, productId: item.id, warehouseId: warehouse.id, quantity },
          update: { quantity: { increment: quantity } },
        });
        movements.push(await tx.inventoryMovement.create({
          data: { companyId: membership.companyId, productId: item.id, warehouseId: warehouse.id, actorUserId, type: "RECEIPT", quantity, unitCost, reference: body.reference?.trim() || null, notes: body.notes?.trim() || null },
        }));
      }
      await tx.auditLog.create({
        data: { companyId: membership.companyId, actorUserId, action: "inventory.goods_received", entityType: "InventoryMovement", entityId: movements[0]?.id, metadata: { warehouseId: warehouse.id, reference: body.reference?.trim() || null, lineCount: movements.length, productIds } },
      });
      return { status: "received", movementCount: movements.length, reference: body.reference?.trim() || null };
    });
  }

  async transferStock(userId: string, companyId: string, actorUserId: string, body: StockTransferDto) {
    if (body.fromWarehouseId === body.toWarehouseId) throw new BadRequestException("Choose two different warehouses for a transfer");
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const warehouseIds = [body.fromWarehouseId, body.toWarehouseId];
      const warehouses = await tx.warehouse.findMany({ where: { id: { in: warehouseIds }, companyId: membership.companyId, isActive: true } });
      if (warehouses.length !== 2) throw new BadRequestException("Both warehouses must be active and belong to the current company");
      for (const line of body.lines) this.assertPositiveQuantity(line.quantity);
      const productIds = [...new Set(body.lines.map(({ productId }) => productId))];
      const items = await tx.inventoryItem.findMany({ where: { id: { in: productIds }, companyId: membership.companyId, isActive: true } });
      if (items.length !== productIds.length) throw new BadRequestException("Every transfer item must be active in the current company");
      const itemMap = new Map(items.map((item) => [item.id, item]));
      let movementCount = 0;
      for (const line of body.lines) {
        const quantity = new Prisma.Decimal(line.quantity);
        const item = itemMap.get(line.productId)!;
        const source = await tx.stockBalance.updateMany({
          where: { companyId: membership.companyId, productId: item.id, warehouseId: body.fromWarehouseId, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (source.count !== 1) throw new BadRequestException(`Insufficient stock for ${item.sku}`);
        await tx.stockBalance.upsert({
          where: { companyId_productId_warehouseId: { companyId: membership.companyId, productId: item.id, warehouseId: body.toWarehouseId } },
          create: { companyId: membership.companyId, productId: item.id, warehouseId: body.toWarehouseId, quantity },
          update: { quantity: { increment: quantity } },
        });
        await tx.inventoryMovement.createMany({
          data: [
            { companyId: membership.companyId, productId: item.id, warehouseId: body.fromWarehouseId, actorUserId, type: "TRANSFER_OUT", quantity, unitCost: item.unitCost, reference: body.reference?.trim() || null, notes: body.notes?.trim() || null },
            { companyId: membership.companyId, productId: item.id, warehouseId: body.toWarehouseId, actorUserId, type: "TRANSFER_IN", quantity, unitCost: item.unitCost, reference: body.reference?.trim() || null, notes: body.notes?.trim() || null },
          ],
        });
        movementCount += 2;
      }
      await tx.auditLog.create({
        data: { companyId: membership.companyId, actorUserId, action: "inventory.stock_transferred", entityType: "InventoryMovement", metadata: { fromWarehouseId: body.fromWarehouseId, toWarehouseId: body.toWarehouseId, reference: body.reference?.trim() || null, lineCount: body.lines.length } },
      });
      return { status: "transferred", movementCount, reference: body.reference?.trim() || null };
    });
  }

  listMovements(userId: string, companyId: string, query: InventoryListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const search = query.q?.trim();
    const where: Prisma.InventoryMovementWhereInput = {
      companyId,
      ...(search ? { OR: [
        { reference: { contains: search, mode: "insensitive" } },
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { warehouse: { name: { contains: search, mode: "insensitive" } } },
      ] } : {}),
    };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [data, total] = await Promise.all([
        tx.inventoryMovement.findMany({
          where: { ...where, companyId: membership.companyId },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { product: { select: { sku: true, name: true, unit: true } }, warehouse: { select: { code: true, name: true } }, actor: { select: { name: true } } },
        }),
        tx.inventoryMovement.count({ where: { ...where, companyId: membership.companyId } }),
      ]);
      return { data, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  private assertPositiveQuantity(value: string) {
    if (!new Prisma.Decimal(value).greaterThan(0)) throw new BadRequestException("Inventory quantities must be greater than zero");
  }
}
