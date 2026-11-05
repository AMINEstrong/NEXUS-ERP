import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";

const decimalZero = () => new Prisma.Decimal(0);
const monthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  summary(userId: string, companyId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenantId = membership.companyId;
      const grants = await tx.rolePermission.findMany({
        where: { companyId: tenantId, roleId: membership.roleId },
        select: { permission: { select: { key: true } } },
      });
      const permissions = new Set(grants.map(({ permission }) => permission.key));
      const canReadSales = permissions.has("sales.read");
      const canReadInventory = permissions.has("inventory.read");
      const canReadCrm = permissions.has("crm.read");

      const now = new Date();
      const currentMonth = monthStart(now);
      const previousMonth = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 1, 1));
      const sixMonthStart = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 5, 1));
      const trend = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(Date.UTC(sixMonthStart.getUTCFullYear(), sixMonthStart.getUTCMonth() + index, 1));
        return {
          key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
          label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
          revenue: decimalZero(),
          sales: 0,
        };
      });

      const [invoices, openInvoiceTotals, pendingOrderCount, productCount, stockRows, customerCount, recentInvoices, recentMovements, recentActivities] = await Promise.all([
        canReadSales ? tx.salesInvoice.findMany({
          where: { companyId: tenantId, issuedAt: { gte: sixMonthStart }, status: { not: "VOID" } },
          select: { id: true, number: true, total: true, issuedAt: true, status: true, customer: { select: { name: true } } },
        }) : Promise.resolve([]),
        canReadSales ? tx.salesInvoice.aggregate({ where: { companyId: tenantId, status: { in: ["OPEN", "PARTIALLY_PAID"] } }, _sum: { total: true, paidAmount: true } }) : Promise.resolve(null),
        canReadSales ? tx.salesOrder.count({ where: { companyId: tenantId, status: { in: ["OPEN", "PARTIALLY_DELIVERED"] } } }) : Promise.resolve(null),
        canReadInventory ? tx.inventoryItem.count({ where: { companyId: tenantId, isActive: true } }) : Promise.resolve(null),
        canReadInventory ? tx.stockBalance.findMany({ where: { companyId: tenantId }, select: { productId: true, quantity: true, product: { select: { unitCost: true, reorderPoint: true, name: true, sku: true } } } }) : Promise.resolve([]),
        canReadCrm ? tx.crmCustomer.count({ where: { companyId: tenantId, isActive: true, type: "CUSTOMER" } }) : Promise.resolve(null),
        canReadSales ? tx.salesInvoice.findMany({ where: { companyId: tenantId }, orderBy: { issuedAt: "desc" }, take: 5, select: { id: true, number: true, total: true, issuedAt: true, customer: { select: { name: true } } } }) : Promise.resolve([]),
        canReadInventory ? tx.inventoryMovement.findMany({ where: { companyId: tenantId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, quantity: true, createdAt: true, product: { select: { name: true, sku: true } } } }) : Promise.resolve([]),
        canReadCrm ? tx.crmActivity.findMany({ where: { companyId: tenantId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, subject: true, type: true, createdAt: true, customer: { select: { name: true } } } }) : Promise.resolve([]),
      ]);

      const monthlyRevenue = new Map(trend.map((month) => [month.key, month]));
      let currentRevenue = decimalZero();
      let previousRevenue = decimalZero();
      let currentSalesCount = 0;
      let previousSalesCount = 0;
      for (const invoice of invoices) {
        const key = `${invoice.issuedAt.getUTCFullYear()}-${String(invoice.issuedAt.getUTCMonth() + 1).padStart(2, "0")}`;
        const bucket = monthlyRevenue.get(key);
        if (bucket) {
          bucket.revenue = bucket.revenue.add(invoice.total);
          bucket.sales += 1;
        }
        if (invoice.issuedAt >= currentMonth) {
          currentRevenue = currentRevenue.add(invoice.total);
          currentSalesCount += 1;
        } else if (invoice.issuedAt >= previousMonth) {
          previousRevenue = previousRevenue.add(invoice.total);
          previousSalesCount += 1;
        }
      }

      const balancesByProduct = new Map<string, { quantity: Prisma.Decimal; cost: Prisma.Decimal; reorderPoint: Prisma.Decimal | null; name: string; sku: string }>();
      let inventoryValue = decimalZero();
      for (const row of stockRows) {
        inventoryValue = inventoryValue.add(row.quantity.mul(row.product.unitCost));
        const existing = balancesByProduct.get(row.productId);
        if (existing) existing.quantity = existing.quantity.add(row.quantity);
        else balancesByProduct.set(row.productId, { quantity: row.quantity, cost: row.product.unitCost, reorderPoint: row.product.reorderPoint, name: row.product.name, sku: row.product.sku });
      }
      const lowStockProducts = [...balancesByProduct.values()].filter((item) => item.reorderPoint !== null && item.quantity.lessThanOrEqualTo(item.reorderPoint));
      const outstanding = openInvoiceTotals ? (openInvoiceTotals._sum.total ?? decimalZero()).sub(openInvoiceTotals._sum.paidAmount ?? decimalZero()) : null;

      const metrics = [] as Array<{ key: string; label: string; value: string | number; previousValue: string | number | null; detail: string; icon: string; href: string }>;
      if (canReadSales) {
        metrics.push(
          { key: "revenue", label: "Revenue this month", value: currentRevenue.toFixed(2), previousValue: previousRevenue.toFixed(2), detail: "Invoiced revenue · month over month", icon: "↗", href: "/app/sales" },
          { key: "sales", label: "Sales this month", value: currentSalesCount, previousValue: previousSalesCount, detail: "Invoices issued · month over month", icon: "▤", href: "/app/sales" },
          { key: "orders", label: "Pending sales orders", value: pendingOrderCount ?? 0, previousValue: null, detail: "Open or partially delivered", icon: "◷", href: "/app/sales" },
          { key: "receivables", label: "Outstanding invoices", value: outstanding?.toFixed(2) ?? "0.00", previousValue: null, detail: "Unpaid balance across open invoices", icon: "◈", href: "/app/sales" },
        );
      }
      if (canReadCrm) metrics.push({ key: "customers", label: "Active customers", value: customerCount ?? 0, previousValue: null, detail: "Customer records in this company", icon: "◎", href: "/app/crm" });
      if (canReadInventory) {
        metrics.push(
          { key: "products", label: "Active products", value: productCount ?? 0, previousValue: null, detail: "Inventory catalog", icon: "▦", href: "/app/inventory" },
          { key: "inventory", label: "Inventory value", value: inventoryValue.toFixed(2), previousValue: null, detail: "On-hand quantity × current unit cost", icon: "◫", href: "/app/inventory" },
          { key: "low-stock", label: "Low-stock products", value: lowStockProducts.length, previousValue: null, detail: "At or below configured reorder point", icon: "⚑", href: "/app/inventory" },
        );
      }

      const activities = [
        ...recentInvoices.map((invoice) => ({ id: `invoice-${invoice.id}`, kind: "sales", title: `Invoice ${invoice.number}`, description: `${invoice.customer.name} · ${invoice.total.toFixed(2)}`, occurredAt: invoice.issuedAt.toISOString() })),
        ...recentMovements.map((movement) => ({ id: `stock-${movement.id}`, kind: "inventory", title: `${movement.type.replaceAll("_", " ")} · ${movement.product.name}`, description: `${movement.product.sku} · ${movement.quantity.toString()} units`, occurredAt: movement.createdAt.toISOString() })),
        ...recentActivities.map((activity) => ({ id: `crm-${activity.id}`, kind: "crm", title: activity.subject, description: `${activity.type.toLowerCase()}${activity.customer ? ` · ${activity.customer.name}` : ""}`, occurredAt: activity.createdAt.toISOString() })),
      ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);

      return {
        companyName: (await tx.company.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, currencyCode: true } })).name,
        currencyCode: (await tx.company.findUniqueOrThrow({ where: { id: tenantId }, select: { currencyCode: true } })).currencyCode,
        metrics,
        trend: trend.map(({ key, label, revenue, sales }) => ({ key, label, revenue: revenue.toFixed(2), sales })),
        activities,
        generatedAt: now.toISOString(),
        hasSalesAccess: canReadSales,
        hasInventoryAccess: canReadInventory,
        hasCrmAccess: canReadCrm,
      };
    });
  }
}
