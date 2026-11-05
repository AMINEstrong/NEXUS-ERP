import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";

jest.setTimeout(30_000);

describe("Inventory API", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseUrl: string;
  let userId: string | null = null;
  const companyIds: string[] = [];
  const suffix = randomUUID();
  const email = `inventory-${suffix}@nexus.local`;
  const password = `Nexus-inventory-${suffix}-C7!`;

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
    if (userId && prisma) {
      for (const companyId of [...companyIds].reverse()) {
        await prisma.withTenantContext(userId, companyId, async (tx) => {
          await tx.inventoryMovement.deleteMany({ where: { companyId } });
          await tx.stockBalance.deleteMany({ where: { companyId } });
          await tx.inventoryItem.deleteMany({ where: { companyId } });
          await tx.warehouse.deleteMany({ where: { companyId } });
          await tx.company.delete({ where: { id: companyId } });
        }).catch(() => undefined);
      }
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
    if (app) await app.close();
  });

  it("creates a catalog, receives and transfers stock atomically, and keeps other-company data isolated", async () => {
    const registration = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Inventory Test Owner", email, password, companyName: `Inventory Tenant ${suffix.slice(0, 8)}` }),
    });
    expect(registration.status).toBe(201);
    const registered = await readJson<{ user: { id: string }; company: { id: string }; developmentVerificationUrl?: string }>(registration);
    userId = registered.user.id;
    companyIds.push(registered.company.id);

    const verificationToken = new URL(registered.developmentVerificationUrl!).searchParams.get("token");
    const verified = await request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verificationToken }) });
    expect(verified.status).toBe(201);

    const login = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    expect(login.status).toBe(201);
    const cookie = getCookie(login);
    const authHeaders = { cookie };

    const primaryWarehouseResponse = await request("/inventory/warehouses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ code: "MAIN", name: "Main warehouse", location: "Casablanca" }),
    });
    expect(primaryWarehouseResponse.status).toBe(201);
    const primaryWarehouse = await readJson<{ id: string }>(primaryWarehouseResponse);

    const secondaryWarehouseResponse = await request("/inventory/warehouses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ code: "STORE-2", name: "Retail store stockroom" }),
    });
    expect(secondaryWarehouseResponse.status).toBe(201);
    const secondaryWarehouse = await readJson<{ id: string }>(secondaryWarehouseResponse);

    const productResponse = await request("/inventory/items", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ sku: "brg-6204", name: "Bearing 6204", unit: "each", unitCost: "25.50", reorderPoint: "15.000" }),
    });
    expect(productResponse.status).toBe(201);
    const product = await readJson<{ id: string; sku: string }>(productResponse);
    expect(product.sku).toBe("BRG-6204");

    const duplicate = await request("/inventory/items", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ sku: "BRG-6204", name: "Duplicate bearing", unitCost: "25" }),
    });
    expect(duplicate.status).toBe(409);

    const receipt = await request("/inventory/receipts", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ warehouseId: primaryWarehouse.id, reference: "GRN-TEST-001", lines: [{ productId: product.id, quantity: "12.500", unitCost: "24.75" }] }),
    });
    expect(receipt.status).toBe(201);
    expect(await readJson(receipt)).toMatchObject({ status: "received", movementCount: 1 });

    const beforeTransfer = await request("/inventory/summary", { headers: authHeaders });
    expect(await readJson(beforeTransfer)).toMatchObject({ itemCount: 1, warehouseCount: 2, movementCount: 1, totalUnits: "12.5", lowStockCount: 1 });

    const transfer = await request("/inventory/transfers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ fromWarehouseId: primaryWarehouse.id, toWarehouseId: secondaryWarehouse.id, reference: "TRF-TEST-001", lines: [{ productId: product.id, quantity: "4.250" }] }),
    });
    expect(transfer.status).toBe(201);
    expect(await readJson(transfer)).toMatchObject({ status: "transferred", movementCount: 2 });

    const itemsResponse = await request("/inventory/items?q=6204&page=1&pageSize=10", { headers: authHeaders });
    expect(itemsResponse.status).toBe(200);
    const items = await readJson<{ data: Array<{ stockBalances: Array<{ quantity: string; warehouse: { id: string } }> }>; total: number }>(itemsResponse);
    expect(items.total).toBe(1);
    const quantities = new Map(items.data[0]!.stockBalances.map(({ quantity, warehouse }) => [warehouse.id, Number(quantity)]));
    expect(quantities.get(primaryWarehouse.id)).toBe(8.25);
    expect(quantities.get(secondaryWarehouse.id)).toBe(4.25);

    const insufficient = await request("/inventory/transfers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ fromWarehouseId: primaryWarehouse.id, toWarehouseId: secondaryWarehouse.id, lines: [{ productId: product.id, quantity: "99" }] }),
    });
    expect(insufficient.status).toBe(400);
    const movementList = await request("/inventory/movements?page=1&pageSize=10", { headers: authHeaders });
    expect((await readJson<{ data: Array<{ type: string }> }>(movementList)).data.map(({ type }) => type)).toEqual(["TRANSFER_IN", "TRANSFER_OUT", "RECEIPT"]);

    const archiveInUse = await request(`/inventory/items/${product.id}`, { method: "DELETE", headers: authHeaders });
    expect(archiveInUse.status).toBe(400);

    const createOtherCompany = await request("/companies", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ companyName: `Other Inventory Tenant ${suffix.slice(0, 8)}`, countryCode: "MA", currencyCode: "MAD" }),
    });
    expect(createOtherCompany.status).toBe(201);
    const otherCompany = await readJson<{ id: string }>(createOtherCompany);
    companyIds.push(otherCompany.id);
    const otherTenantItems = await request("/inventory/items", { headers: authHeaders });
    expect(otherTenantItems.status).toBe(200);
    expect(await readJson<{ total: number }>(otherTenantItems)).toMatchObject({ total: 0 });
    const crossTenantReceipt = await request("/inventory/receipts", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ warehouseId: primaryWarehouse.id, lines: [{ productId: product.id, quantity: "1" }] }),
    });
    expect(crossTenantReceipt.status).toBe(400);
  });
});
