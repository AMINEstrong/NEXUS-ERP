import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { DashboardRange } from "./dashboard.dto.js";

type Tx = Prisma.TransactionClient;
type Granularity = "day" | "week" | "month";
type Direction = "up" | "down" | "flat";

type Period = {
  key: DashboardRange;
  label: string;
  from: Date;
  toExclusive: Date;
  previousFrom: Date;
  previousToExclusive: Date;
  granularity: Granularity;
};

type Bucket = { key: string; label: string };

type Access = {
  sales: boolean;
  crm: boolean;
  inventory: boolean;
  finance: boolean;
};

type Kpi = {
  key: string;
  label: string;
  value: number;
  format: "currency" | "number";
  previous: number | null;
  changePct: number | null;
  changeDirection: Direction | null;
  caption: string;
  captionKey?: string;
  captionParams?: Record<string, string | number>;
  status: "normal" | "warning" | "critical";
  available: boolean;
};

const RANGE_LABELS: Record<DashboardRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
  ytd: "Year to date",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addUtcMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function startOfUtcWeek(value: Date) {
  const day = value.getUTCDay();
  return addUtcDays(startOfUtcDay(value), -((day + 6) % 7));
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function money(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function count(value: unknown) {
  return Math.trunc(money(value));
}

function changePct(current: number, previous: number | null): { changePct: number | null; changeDirection: Direction | null } {
  if (previous === null) return { changePct: null, changeDirection: null };
  if (previous === 0) {
    if (current === 0) return { changePct: 0, changeDirection: "flat" };
    return { changePct: 100, changeDirection: "up" };
  }
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return { changePct: Math.round(value * 10) / 10, changeDirection: value > 0.05 ? "up" : value < -0.05 ? "down" : "flat" };
}

function buildPeriod(range: DashboardRange, now = new Date()) {
  const today = startOfUtcDay(now);
  const toExclusive = addUtcDays(today, 1);
  let from: Date;
  let granularity: Granularity;

  switch (range) {
    case "7d":
      from = addUtcDays(today, -6);
      granularity = "day";
      break;
    case "30d":
      from = addUtcDays(today, -29);
      granularity = "day";
      break;
    case "90d":
      from = addUtcDays(today, -89);
      granularity = "week";
      break;
    case "6m":
      from = addUtcMonths(startOfUtcMonth(today), -5);
      granularity = "month";
      break;
    case "12m":
      from = addUtcMonths(startOfUtcMonth(today), -11);
      granularity = "month";
      break;
    case "ytd":
    default:
      from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      granularity = "month";
      break;
  }

  const duration = toExclusive.getTime() - from.getTime();
  const previousToExclusive = new Date(from.getTime());
  const previousFrom = new Date(from.getTime() - duration);
  return { key: range, label: RANGE_LABELS[range], from, toExclusive, previousFrom, previousToExclusive, granularity };
}

function buildBuckets(period: Period, locale: string): Bucket[] {
  const formatter =
    period.granularity === "month"
      ? new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" })
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const first = period.granularity === "week" ? startOfUtcWeek(period.from) : period.granularity === "month" ? startOfUtcMonth(period.from) : startOfUtcDay(period.from);
  const buckets: Bucket[] = [];
  let cursor = first;
  while (cursor < period.toExclusive && buckets.length < 60) {
    buckets.push({ key: isoDate(cursor), label: formatter.format(cursor) });
    cursor =
      period.granularity === "day"
        ? addUtcDays(cursor, 1)
        : period.granularity === "week"
          ? addUtcDays(cursor, 7)
          : addUtcMonths(cursor, 1);
  }
  return buckets;
}

function emptySeries(buckets: Bucket[]) {
  return buckets.map((bucket) => ({ label: bucket.label, key: bucket.key }));
}

function bucketKey(value: Date | string) {
  return isoDate(value instanceof Date ? value : new Date(value));
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string, companyId: string, range: DashboardRange = "30d") {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenant = membership.companyId;
      const access = await this.permissionAccess(tx, membership.companyId, membership.roleId);
      const company = await tx.company.findFirst({
        where: { id: tenant, deletedAt: null },
        select: { id: true, name: true, currencyCode: true, defaultLocale: true, timeZone: true, fiscalYearStartMonth: true },
      });
      if (!company) throw new BadRequestException("The active company workspace is unavailable");

      const period = buildPeriod(range);
      const buckets = buildBuckets(period, company.defaultLocale || "en-GB");
      const locale = company.defaultLocale || "en-GB";

      const expenseAccountCount = await tx.accountingAccount.count({
        where: { companyId: tenant, type: "EXPENSE", isActive: true },
      });
      const expenseTrackingAvailable = expenseAccountCount > 0;

      const [
        salesKpis,
        crmKpis,
        inventoryKpis,
        financeKpis,
        revenueSeries,
        salesPerformance,
        ordersByStatus,
        expensesByMonth,
        topProducts,
        inventoryDistribution,
        customerGrowth,
        widgets,
        notifications,
      ] = await Promise.all([
        access.sales ? this.salesMetrics(tx, tenant, period) : Promise.resolve(null),
        access.crm ? this.crmMetrics(tx, tenant, period) : Promise.resolve(null),
        access.inventory ? this.inventoryMetrics(tx, tenant, period) : Promise.resolve(null),
        access.finance ? this.financeMetrics(tx, tenant, period, expenseTrackingAvailable) : Promise.resolve(null),
        access.sales ? this.revenueSeries(tx, tenant, period, buckets) : Promise.resolve([]),
        access.sales ? this.salesPerformance(tx, tenant, period, buckets) : Promise.resolve([]),
        access.sales ? this.ordersByStatus(tx, tenant, period) : Promise.resolve([]),
        access.finance ? this.expenseSeries(tx, tenant, period, buckets, expenseTrackingAvailable) : Promise.resolve([]),
        access.sales ? this.topProducts(tx, tenant, period) : Promise.resolve([]),
        access.inventory ? this.inventoryDistribution(tx, tenant) : Promise.resolve([]),
        access.crm ? this.customerGrowth(tx, tenant, period, buckets) : Promise.resolve([]),
        this.widgets(tx, tenant, access),
        this.notificationItems(tx, tenant, access),
      ]);

      const kpis = [...(salesKpis ?? []), ...(crmKpis ?? []), ...(inventoryKpis ?? []), ...(financeKpis ?? [])];
      const hasBusinessAccess = access.sales || access.crm || access.inventory || access.finance;

      return {
        generatedAt: new Date().toISOString(),
        company: {
          id: company.id,
          name: company.name,
          currencyCode: company.currencyCode,
          locale,
          timeZone: company.timeZone,
          fiscalYearStartMonth: company.fiscalYearStartMonth,
        },
        period: {
          key: period.key,
          label: period.label,
          from: period.from.toISOString(),
          to: period.toExclusive.toISOString(),
          previousFrom: period.previousFrom.toISOString(),
          previousTo: period.previousToExclusive.toISOString(),
          granularity: period.granularity,
          buckets: buckets.map((bucket) => bucket.label),
        },
        access,
        hasBusinessAccess,
        expenseTracking: {
          available: expenseTrackingAvailable,
          accountCount: expenseAccountCount,
          note: expenseTrackingAvailable
            ? "Expenses are aggregated from posted journal lines on active expense accounts."
            : "No active expense accounts have been configured, so expense and profit metrics are not shown.",
        },
        kpis,
        charts: {
          revenueOverTime: revenueSeries,
          salesPerformance,
          ordersByStatus,
          monthlyExpenses: expensesByMonth,
          topProducts,
          inventoryDistribution,
          customerGrowth,
        },
        widgets,
        notifications,
      };
    });
  }

  async notifications(userId: string, companyId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const access = await this.permissionAccess(tx, membership.companyId, membership.roleId);
      const items = await this.notificationItems(tx, membership.companyId, access);
      return { generatedAt: new Date().toISOString(), items };
    });
  }

  private async notificationItems(tx: Tx, tenant: string, access: Access) {
    const now = new Date();
    const nextWeek = addUtcDays(now, 7);
    const [lowStock, overdueInvoices, pendingOrders, openActivities, dueSoonActivities] = await Promise.all([
      access.inventory ? this.lowStockRows(tx, tenant, 100) : Promise.resolve([]),
      access.sales
        ? tx.$queryRaw<Array<{ count: string; balance: string }>>`
            SELECT COUNT(*)::text AS count, COALESCE(SUM(total - paid_amount), 0)::text AS balance
            FROM sales_invoices
            WHERE company_id = ${tenant}
              AND status::text IN ('OPEN', 'PARTIALLY_PAID')
              AND due_at < CURRENT_DATE
          `
        : Promise.resolve([{ count: "0", balance: "0" }]),
      access.sales
        ? tx.salesOrder.count({
            where: { companyId: tenant, status: { in: ["OPEN", "PARTIALLY_DELIVERED", "DELIVERED", "PARTIALLY_INVOICED"] } },
          })
        : Promise.resolve(0),
      access.crm
        ? tx.crmActivity.count({ where: { companyId: tenant, completedAt: null, dueAt: { not: null } } })
        : Promise.resolve(0),
      access.crm
        ? tx.crmActivity.count({ where: { companyId: tenant, completedAt: null, dueAt: { gte: now, lt: nextWeek } } })
        : Promise.resolve(0),
    ]);

    const overdue = overdueInvoices[0];
    const items: Array<{
      id: string;
      severity: "critical" | "warning" | "info";
      title: string;
      detail: string;
      titleKey?: string;
      titleParams?: Record<string, string | number>;
      detailKey?: string;
      detailParams?: Record<string, string | number>;
      href: string;
      createdAt: string;
    }> = [];
    const createdAt = now.toISOString();
    if (count(overdue?.count) > 0) {
      items.push({
        id: "overdue-invoices",
        severity: "critical",
        title: `${count(overdue?.count)} overdue invoice${count(overdue?.count) === 1 ? "" : "s"}`,
        titleKey: "Overdue invoices",
        titleParams: { count: count(overdue?.count) },
        detail: `${money(overdue?.balance).toFixed(2)} is past its due date and still outstanding.`,
        detailKey: "{amount} is past its due date and still outstanding.",
        detailParams: { amount: money(overdue?.balance).toFixed(2) },
        href: "/app/sales",
        createdAt,
      });
    }
    if (lowStock.length > 0) {
      items.push({
        id: "low-stock",
        severity: "warning",
        title: `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} at or below reorder point`,
        titleKey: "Items at or below reorder point",
        titleParams: { count: lowStock.length },
        detail: lowStock
          .slice(0, 3)
          .map((item) => `${item.sku} (${money(item.onHand)} on hand)`)
          .join(", "),
        detailKey: "Low-stock items: {items}",
        detailParams: {
          items: lowStock
            .slice(0, 3)
            .map((item) => `${item.sku} (${money(item.onHand)} on hand)`)
            .join(", "),
        },
        href: "/app/inventory",
        createdAt,
      });
    }
    if (pendingOrders > 0) {
      items.push({
        id: "pending-orders",
        severity: "info",
        title: `${pendingOrders} order${pendingOrders === 1 ? "" : "s"} awaiting fulfilment`,
        titleKey: "Orders awaiting fulfilment",
        titleParams: { count: pendingOrders },
        detail: "Open or partially fulfilled sales orders still need delivery or invoicing.",
        detailKey: "Open or partially fulfilled sales orders still need delivery or invoicing.",
        href: "/app/sales",
        createdAt,
      });
    }
    if (dueSoonActivities > 0) {
      items.push({
        id: "due-activities",
        severity: "warning",
        title: `${dueSoonActivities} follow-up${dueSoonActivities === 1 ? "" : "s"} due this week`,
        titleKey: "Follow-ups due this week",
        titleParams: { count: dueSoonActivities },
        detail: "CRM calls, tasks, meetings or emails are scheduled in the next seven days.",
        detailKey: "CRM calls, tasks, meetings or emails are scheduled in the next seven days.",
        href: "/app/crm",
        createdAt,
      });
    } else if (openActivities > 0) {
      items.push({
        id: "open-activities",
        severity: "info",
        title: `${openActivities} open CRM follow-up${openActivities === 1 ? "" : "s"}`,
        titleKey: "Open CRM follow-ups",
        titleParams: { count: openActivities },
        detail: "Review the follow-up queue to keep customer records current.",
        detailKey: "Review the follow-up queue to keep customer records current.",
        href: "/app/crm",
        createdAt,
      });
    }

    return items;
  }

  async search(userId: string, companyId: string, rawQuery: string) {
    const query = rawQuery.trim();
    if (query.length < 2) return { query, groups: [] };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenant = membership.companyId;
      const permissions = await this.permissionKeys(tx, tenant, membership.roleId);
      const canSales = permissions.has("sales.read");
      const canCrm = permissions.has("crm.read");
      const canInventory = permissions.has("inventory.read");

      const [customers, products, invoices, orders, quotations] = await Promise.all([
        canCrm
          ? tx.crmCustomer.findMany({
              where: {
                companyId: tenant,
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { code: { contains: query, mode: "insensitive" } },
                  { contactName: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              },
              select: { id: true, name: true, code: true, type: true, city: true },
              orderBy: { updatedAt: "desc" },
              take: 5,
            })
          : Promise.resolve([]),
        canInventory
          ? tx.inventoryItem.findMany({
              where: { companyId: tenant, OR: [{ name: { contains: query, mode: "insensitive" } }, { sku: { contains: query, mode: "insensitive" } }] },
              select: { id: true, name: true, sku: true, unit: true },
              orderBy: { name: "asc" },
              take: 5,
            })
          : Promise.resolve([]),
        canSales
          ? tx.salesInvoice.findMany({
              where: { companyId: tenant, number: { contains: query, mode: "insensitive" } },
              select: { id: true, number: true, status: true, total: true, currencyCode: true, customer: { select: { name: true } } },
              orderBy: { issuedAt: "desc" },
              take: 5,
            })
          : Promise.resolve([]),
        canSales
          ? tx.salesOrder.findMany({
              where: { companyId: tenant, number: { contains: query, mode: "insensitive" } },
              select: { id: true, number: true, status: true, total: true, currencyCode: true, customer: { select: { name: true } } },
              orderBy: { createdAt: "desc" },
              take: 5,
            })
          : Promise.resolve([]),
        canSales
          ? tx.salesQuotation.findMany({
              where: { companyId: tenant, number: { contains: query, mode: "insensitive" } },
              select: { id: true, number: true, status: true, total: true, currencyCode: true, customer: { select: { name: true } } },
              orderBy: { createdAt: "desc" },
              take: 5,
            })
          : Promise.resolve([]),
      ]);

      const groups = [
        {
          key: "customers",
          label: "Customers & prospects",
          items: customers.map((customer) => ({
            id: customer.id,
            title: customer.name,
            detail: `${customer.code} · ${customer.type}${customer.city ? ` · ${customer.city}` : ""}`,
            href: "/app/crm",
          })),
        },
        {
          key: "products",
          label: "Inventory items",
          items: products.map((product) => ({
            id: product.id,
            title: product.name,
            detail: `${product.sku} · ${product.unit}`,
            href: "/app/inventory",
          })),
        },
        {
          key: "invoices",
          label: "Invoices",
          items: invoices.map((invoice) => ({
            id: invoice.id,
            title: invoice.number,
            detail: `${invoice.customer.name} · ${invoice.status.replaceAll("_", " ")} · ${invoice.currencyCode} ${money(invoice.total).toFixed(2)}`,
            href: "/app/sales",
          })),
        },
        {
          key: "orders",
          label: "Sales orders",
          items: orders.map((order) => ({
            id: order.id,
            title: order.number,
            detail: `${order.customer.name} · ${order.status.replaceAll("_", " ")} · ${order.currencyCode} ${money(order.total).toFixed(2)}`,
            href: "/app/sales",
          })),
        },
        {
          key: "quotations",
          label: "Quotations",
          items: quotations.map((quotation) => ({
            id: quotation.id,
            title: quotation.number,
            detail: `${quotation.customer.name} · ${quotation.status.replaceAll("_", " ")} · ${quotation.currencyCode} ${money(quotation.total).toFixed(2)}`,
            href: "/app/sales",
          })),
        },
      ].filter((group) => group.items.length > 0);

      return { query, groups };
    });
  }

  private async permissionKeys(tx: Tx, companyId: string, roleId: string) {
    const rows = await tx.rolePermission.findMany({
      where: { companyId, roleId },
      select: { permission: { select: { key: true } } },
    });
    return new Set(rows.map((row) => row.permission.key));
  }

  private async permissionAccess(tx: Tx, companyId: string, roleId: string): Promise<Access> {
    const permissions = await this.permissionKeys(tx, companyId, roleId);
    return {
      sales: permissions.has("sales.read"),
      crm: permissions.has("crm.read"),
      inventory: permissions.has("inventory.read"),
      finance: permissions.has("finance.read"),
    };
  }

  private async salesMetrics(tx: Tx, tenant: string, period: Period): Promise<Kpi[]> {
    const [revenue, previousRevenue, sales, previousSales, orders, previousOrders, pendingOrders, outstanding] = await Promise.all([
      tx.salesInvoice.aggregate({
        where: { companyId: tenant, status: { not: "VOID" }, issuedAt: { gte: period.from, lt: period.toExclusive } },
        _sum: { subtotal: true },
      }),
      tx.salesInvoice.aggregate({
        where: { companyId: tenant, status: { not: "VOID" }, issuedAt: { gte: period.previousFrom, lt: period.previousToExclusive } },
        _sum: { subtotal: true },
      }),
      tx.salesOrder.aggregate({
        where: { companyId: tenant, status: { not: "CANCELLED" }, createdAt: { gte: period.from, lt: period.toExclusive } },
        _sum: { total: true },
      }),
      tx.salesOrder.aggregate({
        where: { companyId: tenant, status: { not: "CANCELLED" }, createdAt: { gte: period.previousFrom, lt: period.previousToExclusive } },
        _sum: { total: true },
      }),
      tx.salesOrder.count({
        where: { companyId: tenant, status: { not: "CANCELLED" }, createdAt: { gte: period.from, lt: period.toExclusive } },
      }),
      tx.salesOrder.count({
        where: { companyId: tenant, status: { not: "CANCELLED" }, createdAt: { gte: period.previousFrom, lt: period.previousToExclusive } },
      }),
      tx.salesOrder.count({
        where: { companyId: tenant, status: { in: ["OPEN", "PARTIALLY_DELIVERED", "DELIVERED", "PARTIALLY_INVOICED"] } },
      }),
      tx.salesInvoice.aggregate({
        where: { companyId: tenant, status: { in: ["OPEN", "PARTIALLY_PAID"] } },
        _sum: { total: true, paidAmount: true },
      }),
    ]);

    const revenueValue = money(revenue._sum.subtotal);
    const revenuePrevious = money(previousRevenue._sum.subtotal);
    const salesValue = money(sales._sum.total);
    const salesPrevious = money(previousSales._sum.total);
    const outstandingValue = money(outstanding._sum.total) - money(outstanding._sum.paidAmount);
    const revenueChange = changePct(revenueValue, revenuePrevious);
    const salesChange = changePct(salesValue, salesPrevious);
    const orderChange = changePct(orders, previousOrders);

    return [
      {
        key: "revenue",
        label: "Revenue",
        value: revenueValue,
        format: "currency",
        previous: revenuePrevious,
        ...revenueChange,
        caption: "Invoiced net revenue in period",
        status: "normal",
        available: true,
      },
      {
        key: "sales",
        label: "Sales volume",
        value: salesValue,
        format: "currency",
        previous: salesPrevious,
        ...salesChange,
        caption: "Non-cancelled order value created",
        status: "normal",
        available: true,
      },
      {
        key: "orders",
        label: "Orders",
        value: orders,
        format: "number",
        previous: previousOrders,
        ...orderChange,
        caption: "Orders created in period",
        status: "normal",
        available: true,
      },
      {
        key: "pendingOrders",
        label: "Pending orders",
        value: pendingOrders,
        format: "number",
        previous: null,
        changePct: null,
        changeDirection: null,
        caption: "Awaiting delivery or invoicing",
        status: pendingOrders > 0 ? "warning" : "normal",
        available: true,
      },
      {
        key: "outstandingInvoices",
        label: "Outstanding invoices",
        value: outstandingValue,
        format: "currency",
        previous: null,
        changePct: null,
        changeDirection: null,
        caption: "Open receivable balance",
        status: outstandingValue > 0 ? "warning" : "normal",
        available: true,
      },
    ];
  }

  private async crmMetrics(tx: Tx, tenant: string, period: Period): Promise<Kpi[]> {
    const [customers, previousCustomers, prospects] = await Promise.all([
      tx.crmCustomer.count({ where: { companyId: tenant, type: "CUSTOMER", isActive: true } }),
      tx.crmCustomer.count({ where: { companyId: tenant, type: "CUSTOMER", isActive: true, createdAt: { lt: period.previousToExclusive } } }),
      tx.crmCustomer.count({ where: { companyId: tenant, type: "PROSPECT", isActive: true } }),
    ]);
    const change = changePct(customers, previousCustomers);
    return [
      {
        key: "customers",
        label: "Customers",
        value: customers,
        format: "number",
        previous: previousCustomers,
        ...change,
        caption: `${prospects} active prospect${prospects === 1 ? "" : "s"} in pipeline`,
        captionKey: "Active prospects in pipeline",
        captionParams: { count: prospects },
        status: "normal",
        available: true,
      },
    ];
  }

  private async inventoryMetrics(tx: Tx, tenant: string, period: Period): Promise<Kpi[]> {
    const [products, previousProducts, stockValue, lowStock] = await Promise.all([
      tx.inventoryItem.count({ where: { companyId: tenant, isActive: true } }),
      tx.inventoryItem.count({ where: { companyId: tenant, isActive: true, createdAt: { lt: period.previousToExclusive } } }),
      tx.$queryRaw<Array<{ value: string }>>`
        SELECT COALESCE(SUM(sb.quantity * p.unit_cost), 0)::text AS value
        FROM stock_balances sb
        INNER JOIN inventory_items p ON p.id = sb.product_id AND p.company_id = sb.company_id
        WHERE sb.company_id = ${tenant} AND p.is_active = true
      `,
      this.lowStockRows(tx, tenant, 100),
    ]);
    const change = changePct(products, previousProducts);
    return [
      {
        key: "products",
        label: "Products",
        value: products,
        format: "number",
        previous: previousProducts,
        ...change,
        caption: "Active inventory catalog items",
        status: "normal",
        available: true,
      },
      {
        key: "stockValue",
        label: "Stock value",
        value: money(stockValue[0]?.value),
        format: "currency",
        previous: null,
        changePct: null,
        changeDirection: null,
        caption: "On-hand quantity at current unit cost",
        status: "normal",
        available: true,
      },
      {
        key: "lowStock",
        label: "Low stock",
        value: lowStock.length,
        format: "number",
        previous: null,
        changePct: null,
        changeDirection: null,
        caption: "At or below reorder point",
        status: lowStock.length > 0 ? "warning" : "normal",
        available: true,
      },
    ];
  }

  private async financeMetrics(tx: Tx, tenant: string, period: Period, available: boolean): Promise<Kpi[]> {
    if (!available) {
      return [
        {
          key: "expenses",
          label: "Expenses",
          value: 0,
          format: "currency",
          previous: null,
          changePct: null,
          changeDirection: null,
          caption: "No expense accounts configured",
          status: "normal",
          available: false,
        },
      ];
    }
    const [expenses, previousExpenses] = await Promise.all([
      tx.journalLine.aggregate({
        where: { companyId: tenant, account: { type: "EXPENSE" }, journalEntry: { postedAt: { gte: period.from, lt: period.toExclusive } } },
        _sum: { debit: true, credit: true },
      }),
      tx.journalLine.aggregate({
        where: {
          companyId: tenant,
          account: { type: "EXPENSE" },
          journalEntry: { postedAt: { gte: period.previousFrom, lt: period.previousToExclusive } },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const value = money(expenses._sum.debit) - money(expenses._sum.credit);
    const previous = money(previousExpenses._sum.debit) - money(previousExpenses._sum.credit);
    const change = changePct(value, previous);
    return [
      {
        key: "expenses",
        label: "Expenses",
        value,
        format: "currency",
        previous,
        ...change,
        caption: "Posted to active expense accounts",
        status: "normal",
        available: true,
      },
    ];
  }

  private async revenueSeries(tx: Tx, tenant: string, period: Period, buckets: Bucket[]) {
    const rows = await tx.$queryRaw<Array<{ bucket: Date; revenue: string; invoices: string }>>`
      SELECT date_trunc(${period.granularity}, issued_at) AS bucket,
             COALESCE(SUM(subtotal), 0)::text AS revenue,
             COUNT(*)::text AS invoices
      FROM sales_invoices
      WHERE company_id = ${tenant}
        AND status::text <> 'VOID'
        AND issued_at >= ${period.from}
        AND issued_at < ${period.toExclusive}
      GROUP BY 1
      ORDER BY 1
    `;
    const byKey = new Map(rows.map((row) => [bucketKey(row.bucket), row]));
    return emptySeries(buckets).map((bucket) => ({
      ...bucket,
      revenue: money(byKey.get(bucket.key)?.revenue),
      invoices: count(byKey.get(bucket.key)?.invoices),
    }));
  }

  private async salesPerformance(tx: Tx, tenant: string, period: Period, buckets: Bucket[]) {
    const [invoiced, collected] = await Promise.all([
      tx.$queryRaw<Array<{ bucket: Date; value: string }>>`
        SELECT date_trunc(${period.granularity}, issued_at) AS bucket, COALESCE(SUM(subtotal), 0)::text AS value
        FROM sales_invoices
        WHERE company_id = ${tenant}
          AND status::text <> 'VOID'
          AND issued_at >= ${period.from}
          AND issued_at < ${period.toExclusive}
        GROUP BY 1
        ORDER BY 1
      `,
      tx.$queryRaw<Array<{ bucket: Date; value: string }>>`
        SELECT date_trunc(${period.granularity}, received_at) AS bucket, COALESCE(SUM(amount), 0)::text AS value
        FROM sales_payments
        WHERE company_id = ${tenant}
          AND received_at >= ${period.from}
          AND received_at < ${period.toExclusive}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);
    const invoicedByKey = new Map(invoiced.map((row) => [bucketKey(row.bucket), row.value]));
    const collectedByKey = new Map(collected.map((row) => [bucketKey(row.bucket), row.value]));
    return emptySeries(buckets).map((bucket) => ({
      ...bucket,
      invoiced: money(invoicedByKey.get(bucket.key)),
      collected: money(collectedByKey.get(bucket.key)),
    }));
  }

  private async ordersByStatus(tx: Tx, tenant: string, period: Period) {
    const groups = await tx.salesOrder.groupBy({
      by: ["status"],
      where: { companyId: tenant, status: { not: "CANCELLED" }, createdAt: { gte: period.from, lt: period.toExclusive } },
      _count: { id: true },
      _sum: { total: true },
    });
    return groups
      .map((group) => ({ status: group.status, count: group._count.id, value: money(group._sum.total) }))
      .sort((left, right) => right.count - left.count);
  }

  private async expenseSeries(tx: Tx, tenant: string, period: Period, buckets: Bucket[], available: boolean) {
    if (!available) return emptySeries(buckets).map((bucket) => ({ ...bucket, value: 0 }));
    const rows = await tx.$queryRaw<Array<{ bucket: Date; value: string }>>`
      SELECT date_trunc(${period.granularity}, je.posted_at) AS bucket,
             COALESCE(SUM(jl.debit - jl.credit), 0)::text AS value
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.company_id = jl.company_id
      INNER JOIN accounting_accounts aa ON aa.id = jl.account_id AND aa.company_id = jl.company_id
      WHERE jl.company_id = ${tenant}
        AND aa.type::text = 'EXPENSE'
        AND aa.is_active = true
        AND je.posted_at >= ${period.from}
        AND je.posted_at < ${period.toExclusive}
      GROUP BY 1
      ORDER BY 1
    `;
    const byKey = new Map(rows.map((row) => [bucketKey(row.bucket), row.value]));
    return emptySeries(buckets).map((bucket) => ({ ...bucket, value: money(byKey.get(bucket.key)) }));
  }

  private async topProducts(tx: Tx, tenant: string, period: Period) {
    const rows = await tx.$queryRaw<Array<{ name: string; sku: string; revenue: string; quantity: string }>>`
      SELECT p.name, p.sku,
             COALESCE(SUM(l.subtotal), 0)::text AS revenue,
             COALESCE(SUM(l.quantity), 0)::text AS quantity
      FROM sales_invoice_lines l
      INNER JOIN sales_invoices i ON i.id = l.invoice_id AND i.company_id = l.company_id
      INNER JOIN inventory_items p ON p.id = l.product_id AND p.company_id = l.company_id
      WHERE l.company_id = ${tenant}
        AND i.status::text <> 'VOID'
        AND i.issued_at >= ${period.from}
        AND i.issued_at < ${period.toExclusive}
      GROUP BY p.id, p.name, p.sku
      ORDER BY SUM(l.subtotal) DESC
      LIMIT 5
    `;
    return rows.map((row) => ({ name: row.name, sku: row.sku, revenue: money(row.revenue), quantity: money(row.quantity) }));
  }

  private async inventoryDistribution(tx: Tx, tenant: string) {
    const rows = await tx.$queryRaw<Array<{ name: string; code: string; value: string }>>`
      SELECT w.name, w.code, COALESCE(SUM(sb.quantity * p.unit_cost), 0)::text AS value
      FROM warehouses w
      LEFT JOIN stock_balances sb ON sb.warehouse_id = w.id AND sb.company_id = w.company_id
      LEFT JOIN inventory_items p ON p.id = sb.product_id AND p.company_id = sb.company_id
      WHERE w.company_id = ${tenant} AND w.is_active = true
      GROUP BY w.id, w.name, w.code
      ORDER BY SUM(sb.quantity * p.unit_cost) DESC NULLS LAST
    `;
    return rows.map((row) => ({ name: row.name, code: row.code, value: money(row.value) }));
  }

  private async customerGrowth(tx: Tx, tenant: string, period: Period, buckets: Bucket[]) {
    const rows = await tx.$queryRaw<Array<{ bucket: Date; type: string; count: string }>>`
      SELECT date_trunc(${period.granularity}, created_at) AS bucket,
             type::text AS type,
             COUNT(*)::text AS count
      FROM crm_customers
      WHERE company_id = ${tenant}
        AND created_at >= ${period.from}
        AND created_at < ${period.toExclusive}
      GROUP BY 1, 2
      ORDER BY 1
    `;
    const customers = new Map<string, number>();
    const prospects = new Map<string, number>();
    for (const row of rows) {
      const key = bucketKey(row.bucket);
      if (row.type === "CUSTOMER") customers.set(key, count(row.count));
      else prospects.set(key, count(row.count));
    }
    return emptySeries(buckets).map((bucket) => ({
      ...bucket,
      customers: customers.get(bucket.key) ?? 0,
      prospects: prospects.get(bucket.key) ?? 0,
    }));
  }

  private async widgets(tx: Tx, tenant: string, access: Access) {
    const [recentSales, recentOrders, recentCustomers, lowStock, pendingInvoices, activities] = await Promise.all([
      access.sales
        ? tx.salesInvoice.findMany({
            where: { companyId: tenant },
            select: {
              id: true,
              number: true,
              status: true,
              total: true,
              paidAmount: true,
              currencyCode: true,
              issuedAt: true,
              dueAt: true,
              customer: { select: { name: true } },
            },
            orderBy: { issuedAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      access.sales
        ? tx.salesOrder.findMany({
            where: { companyId: tenant },
            select: {
              id: true,
              number: true,
              status: true,
              total: true,
              currencyCode: true,
              createdAt: true,
              customer: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      access.crm
        ? tx.crmCustomer.findMany({
            where: { companyId: tenant },
            select: { id: true, code: true, name: true, type: true, city: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      access.inventory ? this.lowStockRows(tx, tenant, 5) : Promise.resolve([]),
      access.sales
        ? tx.salesInvoice.findMany({
            where: { companyId: tenant, status: { in: ["OPEN", "PARTIALLY_PAID"] } },
            select: {
              id: true,
              number: true,
              status: true,
              total: true,
              paidAmount: true,
              currencyCode: true,
              issuedAt: true,
              dueAt: true,
              customer: { select: { name: true } },
            },
            orderBy: { dueAt: "asc" },
            take: 5,
          })
        : Promise.resolve([]),
      access.crm
        ? tx.crmActivity.findMany({
            where: { companyId: tenant, completedAt: null },
            select: {
              id: true,
              type: true,
              subject: true,
              dueAt: true,
              createdAt: true,
              customer: { select: { name: true } },
              opportunity: { select: { reference: true, title: true } },
            },
            orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
            take: 5,
          })
        : Promise.resolve([]),
    ]);

    return {
      recentSales: recentSales.map((invoice) => ({
        ...invoice,
        total: money(invoice.total),
        paidAmount: money(invoice.paidAmount),
        balance: money(invoice.total) - money(invoice.paidAmount),
      })),
      recentOrders: recentOrders.map((order) => ({ ...order, total: money(order.total) })),
      recentCustomers,
      lowStock,
      pendingInvoices: pendingInvoices.map((invoice) => ({
        ...invoice,
        total: money(invoice.total),
        paidAmount: money(invoice.paidAmount),
        balance: money(invoice.total) - money(invoice.paidAmount),
      })),
      activities,
    };
  }

  private async lowStockRows(tx: Tx, tenant: string, limit: number) {
    const rows = await tx.$queryRaw<Array<{ id: string; sku: string; name: string; unit: string; reorderPoint: string; onHand: string; shortage: string }>>`
      SELECT p.id, p.sku, p.name, p.unit,
             p.reorder_point::text AS "reorderPoint",
             COALESCE(SUM(sb.quantity), 0)::text AS "onHand",
             (p.reorder_point - COALESCE(SUM(sb.quantity), 0))::text AS shortage
      FROM inventory_items p
      LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.company_id = p.company_id
      WHERE p.company_id = ${tenant}
        AND p.is_active = true
        AND p.reorder_point IS NOT NULL
      GROUP BY p.id, p.sku, p.name, p.unit, p.reorder_point
      HAVING COALESCE(SUM(sb.quantity), 0) <= p.reorder_point
      ORDER BY (p.reorder_point - COALESCE(SUM(sb.quantity), 0)) DESC, p.name ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      reorderPoint: money(row.reorderPoint),
      onHand: money(row.onHand),
      shortage: money(row.shortage),
    }));
  }
}
