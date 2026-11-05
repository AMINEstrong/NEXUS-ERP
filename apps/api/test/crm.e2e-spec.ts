import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";

jest.setTimeout(30_000);

describe("CRM API", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseUrl: string;
  let userId: string | null = null;
  const companyIds: string[] = [];
  const suffix = randomUUID();
  const email = `crm-${suffix}@nexus.local`;
  const password = `Nexus-crm-${suffix}-D9!`;
  async function request(path: string, options: RequestInit = {}) {
    return fetch(`${baseUrl}/api/v1${path}`, { ...options, headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers ?? {}) } });
  }
  function getCookie(response: Response) { return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? ""; }
  async function readJson<T>(response: Response) { return await response.json() as T; }

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
          await tx.crmActivity.deleteMany({ where: { companyId } });
          await tx.crmOpportunity.deleteMany({ where: { companyId } });
          await tx.crmCustomer.deleteMany({ where: { companyId } });
          await tx.company.delete({ where: { id: companyId } });
        }).catch(() => undefined);
      }
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
    if (app) await app.close();
  });

  it("manages customers, opportunities and activities inside the active company", async () => {
    const registration = await request("/auth/register", { method: "POST", body: JSON.stringify({ name: "CRM Test Owner", email, password, companyName: `CRM Tenant ${suffix.slice(0, 8)}` }) });
    expect(registration.status).toBe(201);
    const registered = await readJson<{ user: { id: string }; company: { id: string }; developmentVerificationUrl: string }>(registration);
    userId = registered.user.id; companyIds.push(registered.company.id);
    const verificationToken = new URL(registered.developmentVerificationUrl).searchParams.get("token");
    expect((await request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verificationToken }) })).status).toBe(201);
    const login = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    expect(login.status).toBe(201);
    const authHeaders = { cookie: getCookie(login) };

    const customerResponse = await request("/crm/customers", { method: "POST", headers: authHeaders, body: JSON.stringify({ code: "PROSPECT-01", name: "Northstar Manufacturing", type: "PROSPECT", contactName: "Samira" }) });
    expect(customerResponse.status).toBe(201);
    const customer = await readJson<{ id: string; code: string }>(customerResponse);
    expect(customer.code).toBe("PROSPECT-01");
    expect((await request("/crm/customers", { method: "POST", headers: authHeaders, body: JSON.stringify({ code: "PROSPECT-01", name: "Duplicate" }) })).status).toBe(409);

    const opportunityResponse = await request("/crm/opportunities", { method: "POST", headers: authHeaders, body: JSON.stringify({ customerId: customer.id, reference: "OPP-CRM-01", title: "Manufacturing expansion", estimatedValue: "12500.00", probability: 50 }) });
    expect(opportunityResponse.status).toBe(201);
    const opportunity = await readJson<{ id: string; stage: string; customer: { id: string } }>(opportunityResponse);
    expect(opportunity).toMatchObject({ stage: "QUALIFICATION", customer: { id: customer.id } });

    const activityResponse = await request("/crm/activities", { method: "POST", headers: authHeaders, body: JSON.stringify({ opportunityId: opportunity.id, type: "CALL", subject: "Review requirements" }) });
    expect(activityResponse.status).toBe(201);
    const activity = await readJson<{ id: string; customer: { id: string } }>(activityResponse);
    expect(activity.customer.id).toBe(customer.id);

    const update = await request(`/crm/opportunities/${opportunity.id}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ stage: "PROPOSAL", probability: 70 }) });
    expect(update.status).toBe(200);
    expect(await readJson(update)).toMatchObject({ stage: "PROPOSAL", probability: 70 });
    expect((await request(`/crm/activities/${activity.id}/complete`, { method: "PATCH", headers: authHeaders })).status).toBe(200);
    const summaryResponse = await request("/crm/summary", { headers: authHeaders });
    expect(await readJson(summaryResponse)).toMatchObject({ prospectCount: 1, openOpportunityCount: 1, pipelineValue: "12500", pendingActivityCount: 0 });

    const otherCompanyResponse = await request("/companies", { method: "POST", headers: authHeaders, body: JSON.stringify({ companyName: `Other CRM Tenant ${suffix.slice(0, 8)}`, countryCode: "MA", currencyCode: "MAD" }) });
    expect(otherCompanyResponse.status).toBe(201);
    const otherCompany = await readJson<{ id: string }>(otherCompanyResponse);
    companyIds.push(otherCompany.id);
    expect(await readJson<{ total: number }>(await request("/crm/customers", { headers: authHeaders }))).toMatchObject({ total: 0 });
    const crossCompany = await request("/crm/opportunities", { method: "POST", headers: authHeaders, body: JSON.stringify({ customerId: customer.id, reference: "OPP-CROSS-01", title: "Should be rejected" }) });
    expect(crossCompany.status).toBe(400);
  });
});
