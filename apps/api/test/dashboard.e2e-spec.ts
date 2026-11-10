import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";

jest.setTimeout(60_000);

type Access = { sales: boolean; crm: boolean; inventory: boolean; finance: boolean };
type Kpi = { key: string; value: number; available: boolean; status: string; changePct: number | null };
type Overview = {
  company: { id: string; currencyCode: string };
  period: { key: string; granularity: string; buckets: string[] };
  access: Access;
  hasBusinessAccess: boolean;
  expenseTracking: { available: boolean; accountCount: number };
  kpis: Kpi[];
  charts: {
    revenueOverTime: Array<{ revenue: number; invoices: number }>;
    salesPerformance: Array<{ invoiced: number; collected: number }>;
    ordersByStatus: Array<{ status: string; count: number; value: number }>;
    monthlyExpenses: Array<{ value: number }>;
    topProducts: Array<{ name: string; sku: string; revenue: number; quantity: number }>;
    inventoryDistribution: Array<{ name: string; code: string; value: number }>;
    customerGrowth: Array<{ customers: number; prospects: number }>;
  };
  widgets: {
    recentSales: Array<{ id: string; number: string; balance: number }>;
    recentOrders: Array<{ id: string; number: string }>;
    recentCustomers: Array<{ id: string }>;
    lowStock: Array<{ id: string; onHand: number }>;
    pendingInvoices: Array<{ id: string; number: string }>;
    activities: Array<{ id: string }>;
  };
  notifications: Array<{ id: string; severity: string; title: string }>;
};
type NotificationResponse = { generatedAt: string; items: Overview["notifications"] };
type SearchResponse = { query: string; groups: Array<{ key: string; label: string; items: Array<{ id: string; title: string }> }> };

describe("Dashboard API", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseUrl: string;
  let userId: string | null = null;
  const companyIds: string[] = [];
  const suffix = randomUUID();
  const email = `dashboard-${suffix}@nexus.local`;
  const password = `Nexus-dashboard-${suffix}-F4!`;
  const kpi = (overview: Overview, key: string) => {
    const found = overview.kpis.find((entry) => entry.key === key);
    if (!found) throw new Error(`KPI ${key} is missing from the dashboard response`);
    return found;
  };

  async function request(path: string, options: RequestInit = {}) {
    return fetch(`${baseUrl}/api/v1${path}`, {
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) },
    });
  }

  function getCookie(response: Response) {
    return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }

  async function readJson<T>(response: Response) {
    return (await response.json()) as T;
  }

  async function cleanupCompany(companyId: string) {
    if (!userId) return;
    await prisma.withTenantContext(userId, companyId, async (tx) => {
      await tx.salesPayment.deleteMany({ where: { companyId } });
      await tx.salesInvoiceLine.deleteMany({ where: { companyId } });
      await tx.salesInvoice.deleteMany({ where: { companyId } });
      await tx.journalLine.deleteMany({ where: { companyId } });
      await tx.journalEntry.deleteMany({ where: { companyId } });
      await tx.salesDeliveryLine.deleteMany({ where: { companyId } });
      await tx.salesDelivery.deleteMany({ where: { companyId } });
      await tx.salesOrderLine.deleteMany({ where: { companyId } });
      await tx.salesOrder.deleteMany({ where: { companyId } });
      await tx.salesQuotationLine.deleteMany({ where: { companyId } });
      await tx.salesQuotation.deleteMany({ where: { companyId } });
      await tx.inventoryMovement.deleteMany({ where: { companyId } });
      await tx.stockBalance.deleteMany({ where: { companyId } });
      await tx.inventoryItem.deleteMany({ where: { companyId } });
      await tx.warehouse.deleteMany({ where: { companyId } });
      await tx.crmActivity.deleteMany({ where: { companyId } });
      await tx.crmOpportunity.deleteMany({ where: { companyId } });
      await tx.crmCustomer.deleteMany({ where: { companyId } });
      await tx.accountingAccount.deleteMany({ where: { companyId } });
      await tx.documentSequence.deleteMany({ where: { companyId } });
      await tx.auditLog.deleteMany({ where: { companyId } });
      await tx.rolePermission.deleteMany({ where: { companyId } });
      await tx.membership.deleteMany({ where: { companyId } });
      await tx.role.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
    }).catch(() => undefined);
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("The test API did not open a TCP port");
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const companyId of [...companyIds].reverse()) await cleanupCompany(companyId);
    if (userId && prisma) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    if (app) await app.close();
  });

  it("serves tenant-scoped KPIs, charts, widgets, notifications and search from live records", async () => {
    const registration = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Dashboard Test Owner", email, password, companyName: `Dashboard Tenant ${suffix.slice(0, 8)}` }),
    });
    expect(registration.status).toBe(201);
    const registered = await readJson<{ user: { id: string }; company: { id: string }; developmentVerificationUrl: string }>(registration);
    userId = registered.user.id;
    companyIds.push(registered.company.id);
    const companyId = registered.company.id;
    const verificationToken = new URL(registered.developmentVerificationUrl).searchParams.get("token");
    expect((await request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verificationToken }) })).status).toBe(201);
    const login = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    expect(login.status).toBe(201);
    const authHeaders = { cookie: getCookie(login) };

    const customerResponse = await request("/crm/customers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ code: "DASH-CUST-01", name: "Meridian Fabrication", type: "CUSTOMER", contactName: "Amina", city: "Rabat" }),
    });
    expect(customerResponse.status).toBe(201);
    const customer = await readJson<{ id: string; code: string }>(customerResponse);

    const warehouseResponse = await request("/inventory/warehouses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ code: "DASH-MAIN", name: "Dashboard main warehouse", location: "Casablanca" }),
    });
    expect(warehouseResponse.status).toBe(201);
    const warehouse = await readJson<{ id: string }>(warehouseResponse);

    const productResponse = await request("/inventory/items", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ sku: "DASH-BRG-01", name: "Dashboard bearing", unit: "each", unitCost: "25.50", reorderPoint: "10.000" }),
    });
    expect(productResponse.status).toBe(201);
    const product = await readJson<{ id: string; sku: string }>(productResponse);

    const receipt = await request("/inventory/receipts", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ warehouseId: warehouse.id, reference: "DASH-GRN-01", lines: [{ productId: product.id, quantity: "5.000", unitCost: "25.50" }] }),
    });
    expect(receipt.status).toBe(201);

    const quotationResponse = await request("/sales/quotations", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ customerId: customer.id, notes: "Dashboard end-to-end quotation", lines: [{ productId: product.id, quantity: "2.000", unitPrice: "50.00" }] }),
    });
    expect(quotationResponse.status).toBe(201);
    const quotation = await readJson<{ id: string; number: string }>(quotationResponse);
    expect((await request(`/sales/quotations/${quotation.id}/send`, { method: "POST", headers: authHeaders })).status).toBe(201);
    const orderResponse = await request(`/sales/quotations/${quotation.id}/convert`, { method: "POST", headers: authHeaders });
    expect(orderResponse.status).toBe(201);
    const order = await readJson<{ id: string; number: string; lines: Array<{ id: string }> }>(orderResponse);
    const deliveryResponse = await request(`/sales/orders/${order.id}/deliver`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ warehouseId: warehouse.id, lines: [{ orderLineId: order.lines[0]!.id, quantity: "2.000" }] }),
    });
    expect(deliveryResponse.status).toBe(201);

    const overdueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const invoiceResponse = await request(`/sales/orders/${order.id}/invoices`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ dueAt: overdueDate }),
    });
    expect(invoiceResponse.status).toBe(201);
    const invoice = await readJson<{ id: string; number: string; subtotal: string; total: string }>(invoiceResponse);
    expect(invoice.subtotal).toBe("100");
    const payment = await request(`/sales/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ method: "CASH", amount: "30.00" }),
    });
    expect(payment.status).toBe(201);

    const secondQuotationResponse = await request("/sales/quotations", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ customerId: customer.id, lines: [{ productId: product.id, quantity: "2.000", unitPrice: "50.00" }] }),
    });
    expect(secondQuotationResponse.status).toBe(201);
    const secondQuotation = await readJson<{ id: string }>(secondQuotationResponse);
    expect((await request(`/sales/quotations/${secondQuotation.id}/send`, { method: "POST", headers: authHeaders })).status).toBe(201);
    const secondOrderResponse = await request(`/sales/quotations/${secondQuotation.id}/convert`, { method: "POST", headers: authHeaders });
    expect(secondOrderResponse.status).toBe(201);
    const secondOrder = await readJson<{ id: string; number: string; status: string }>(secondOrderResponse);
    expect(secondOrder.status).toBe("OPEN");

    const activityResponse = await request("/crm/activities", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ customerId: customer.id, type: "CALL", subject: "Dashboard follow-up", dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }),
    });
    expect(activityResponse.status).toBe(201);
    const activity = await readJson<{ id: string }>(activityResponse);

    const dashboardResponse = await request("/dashboard?range=30d", { headers: authHeaders });
    expect(dashboardResponse.status).toBe(200);
    const overview = await readJson<Overview>(dashboardResponse);

    expect(overview.company.id).toBe(companyId);
    expect(overview.access).toEqual({ sales: true, crm: true, inventory: true, finance: true });
    expect(overview.hasBusinessAccess).toBe(true);
    expect(overview.period).toMatchObject({ key: "30d", granularity: "day" });
    expect(overview.period.buckets).toHaveLength(30);
    expect(overview.expenseTracking).toMatchObject({ available: false, accountCount: 0 });

    expect(kpi(overview, "revenue")).toMatchObject({ value: 100, available: true });
    expect(kpi(overview, "sales")).toMatchObject({ value: 200, available: true });
    expect(kpi(overview, "orders")).toMatchObject({ value: 2, available: true });
    expect(kpi(overview, "pendingOrders")).toMatchObject({ value: 1, status: "warning" });
    expect(kpi(overview, "outstandingInvoices")).toMatchObject({ value: 70, status: "warning" });
    expect(kpi(overview, "customers")).toMatchObject({ value: 1, available: true });
    expect(kpi(overview, "products")).toMatchObject({ value: 1, available: true });
    expect(kpi(overview, "stockValue").value).toBeCloseTo(76.5, 2);
    expect(kpi(overview, "lowStock")).toMatchObject({ value: 1, status: "warning" });
    expect(kpi(overview, "expenses")).toMatchObject({ value: 0, available: false });

    expect(overview.charts.revenueOverTime.reduce((sum, point) => sum + point.revenue, 0)).toBeCloseTo(100, 2);
    expect(overview.charts.revenueOverTime.reduce((sum, point) => sum + point.invoices, 0)).toBe(1);
    expect(overview.charts.salesPerformance.reduce((sum, point) => sum + point.invoiced, 0)).toBeCloseTo(100, 2);
    expect(overview.charts.salesPerformance.reduce((sum, point) => sum + point.collected, 0)).toBeCloseTo(30, 2);
    expect(overview.charts.ordersByStatus.map((entry) => entry.status).sort()).toEqual(["INVOICED", "OPEN"]);
    expect(overview.charts.monthlyExpenses.every((point) => point.value === 0)).toBe(true);
    expect(overview.charts.topProducts[0]).toMatchObject({ sku: "DASH-BRG-01", revenue: 100, quantity: 2 });
    expect(overview.charts.inventoryDistribution.find((entry) => entry.code === "DASH-MAIN")?.value).toBeCloseTo(76.5, 2);
    expect(overview.charts.customerGrowth.reduce((sum, point) => sum + point.customers, 0)).toBe(1);

    expect(overview.widgets.recentSales.map((entry) => entry.number)).toEqual([invoice.number]);
    expect(overview.widgets.recentSales[0]!.balance).toBeCloseTo(70, 2);
    expect(overview.widgets.recentOrders.map((entry) => entry.number).sort()).toEqual([order.number, secondOrder.number].sort());
    expect(overview.widgets.recentCustomers.map((entry) => entry.id)).toEqual([customer.id]);
    expect(overview.widgets.lowStock.map((entry) => entry.id)).toEqual([product.id]);
    expect(overview.widgets.lowStock[0]!.onHand).toBeCloseTo(3, 2);
    expect(overview.widgets.pendingInvoices.map((entry) => entry.id)).toEqual([invoice.id]);
    expect(overview.widgets.activities.map((entry) => entry.id)).toEqual([activity.id]);

    expect(overview.notifications.map((entry) => entry.id).sort()).toEqual(["due-activities", "low-stock", "overdue-invoices", "pending-orders"]);
    expect(overview.notifications.find((entry) => entry.id === "overdue-invoices")?.severity).toBe("critical");

    const notificationsResponse = await request("/dashboard/notifications", { headers: authHeaders });
    expect(notificationsResponse.status).toBe(200);
    const notificationBody = await readJson<NotificationResponse>(notificationsResponse);
    expect(notificationBody.items.map((entry) => entry.id).sort()).toEqual(overview.notifications.map((entry) => entry.id).sort());

    const customerSearch = await request("/dashboard/search?q=DASH-CUST", { headers: authHeaders });
    expect(customerSearch.status).toBe(200);
    const customerResults = await readJson<SearchResponse>(customerSearch);
    expect(customerResults.groups.find((group) => group.key === "customers")?.items.map((entry) => entry.id)).toEqual([customer.id]);

    const invoiceSearch = await request(`/dashboard/search?q=${encodeURIComponent(invoice.number)}`, { headers: authHeaders });
    expect(invoiceSearch.status).toBe(200);
    const invoiceResults = await readJson<SearchResponse>(invoiceSearch);
    expect(invoiceResults.groups.find((group) => group.key === "invoices")?.items.map((entry) => entry.title)).toEqual([invoice.number]);

    expect((await request("/dashboard/search?q=D", { headers: authHeaders })).status).toBe(400);
    expect((await request("/dashboard?range=invalid", { headers: authHeaders })).status).toBe(400);
    expect((await request("/dashboard?range=90d", { headers: authHeaders })).status).toBe(200);

    const otherCompanyResponse = await request("/companies", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ companyName: `Other Dashboard Tenant ${suffix.slice(0, 8)}`, countryCode: "MA", currencyCode: "MAD" }),
    });
    expect(otherCompanyResponse.status).toBe(201);
    const otherCompany = await readJson<{ id: string }>(otherCompanyResponse);
    companyIds.push(otherCompany.id);

    const isolatedResponse = await request("/dashboard?range=30d", { headers: authHeaders });
    expect(isolatedResponse.status).toBe(200);
    const isolated = await readJson<Overview>(isolatedResponse);
    expect(isolated.company.id).toBe(otherCompany.id);
    expect(kpi(isolated, "revenue").value).toBe(0);
    expect(kpi(isolated, "orders").value).toBe(0);
    expect(kpi(isolated, "customers").value).toBe(0);
    expect(kpi(isolated, "products").value).toBe(0);
    expect(isolated.widgets.recentSales).toEqual([]);
    expect(isolated.widgets.recentCustomers).toEqual([]);
    expect(isolated.notifications).toEqual([]);
    expect(isolated.charts.topProducts).toEqual([]);
    expect((await readJson<SearchResponse>(await request("/dashboard/search?q=DASH-CUST", { headers: authHeaders }))).groups).toEqual([]);

    expect((await request("/auth/active-company", { method: "POST", headers: authHeaders, body: JSON.stringify({ companyId }) })).status).toBe(201);

    const roleResponse = await request("/roles", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ key: "dashboard_reader", name: "Dashboard Reader", description: "Reporting access limited to CRM", permissionKeys: ["reports.read", "crm.read"] }),
    });
    expect(roleResponse.status).toBe(201);
    const restrictedRole = await readJson<{ id: string }>(roleResponse);
    const me = await readJson<{ memberships: Array<{ membershipId: string; id: string }> }>(await request("/auth/me", { headers: authHeaders }));
    const membership = me.memberships.find((entry) => entry.id === companyId);
    expect(membership?.membershipId).toBeTruthy();
    await prisma.withTenantContext(userId, companyId, async (tx) => {
      await tx.membership.update({ where: { id: membership!.membershipId }, data: { roleId: restrictedRole.id } });
    });

    const restrictedResponse = await request("/dashboard?range=30d", { headers: authHeaders });
    expect(restrictedResponse.status).toBe(200);
    const restricted = await readJson<Overview>(restrictedResponse);
    expect(restricted.access).toEqual({ sales: false, crm: true, inventory: false, finance: false });
    expect(restricted.kpis.map((entry) => entry.key)).toEqual(["customers"]);
    expect(restricted.charts.revenueOverTime).toEqual([]);
    expect(restricted.charts.monthlyExpenses).toEqual([]);
    expect(restricted.widgets.recentSales).toEqual([]);
    expect(restricted.widgets.pendingInvoices).toEqual([]);
    expect(restricted.widgets.lowStock).toEqual([]);
    expect(restricted.widgets.recentCustomers.map((entry) => entry.id)).toEqual([customer.id]);
    expect(restricted.notifications.map((entry) => entry.id)).toEqual(["due-activities"]);
    expect((await readJson<SearchResponse>(await request(`/dashboard/search?q=${encodeURIComponent(invoice.number)}`, { headers: authHeaders }))).groups).toEqual([]);

    await prisma.withTenantContext(userId, companyId, async (tx) => {
      const ownerRole = await tx.role.findFirstOrThrow({ where: { companyId, key: "company_owner" }, select: { id: true } });
      await tx.membership.update({ where: { id: membership!.membershipId }, data: { roleId: ownerRole.id } });
    });
  });
});
