import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/database/prisma.service.js";

jest.setTimeout(30_000);

type Json = Record<string, any>;

async function startApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") throw new Error("The test API did not open a TCP port");
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function post(baseUrl: string, path: string, body: unknown) {
  return fetch(`${baseUrl}/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T = Json>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("E-mail verification and password reset API", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseUrl: string;
  let userId: string;
  const companyIds: string[] = [];
  const suffix = randomUUID();
  const email = `email-${suffix}@nexus.local`;
  const password = `Nexus-mail-${suffix}-A9!`;
  const newPassword = `Nexus-mail-${suffix}-B8!`;

  beforeAll(async () => {
    ({ app, baseUrl } = await startApp());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (userId && prisma) {
      for (const companyId of [...companyIds].reverse()) {
        await prisma.withTenantContext(userId, companyId, (tx) => tx.company.delete({ where: { id: companyId } })).catch(() => undefined);
      }
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
    if (app) await app.close();
  });

  it("expires an old verification link, rotates it on resend and rejects reuse", async () => {
    const registration = await post(baseUrl, "/auth/register", {
      name: "Mail Owner",
      email,
      password,
      companyName: `NEXUS Mail ${suffix.slice(0, 8)}`,
      defaultLocale: "ar-MA",
    });
    expect(registration.status).toBe(201);
    const registered = await json(registration);
    userId = registered.user.id;
    companyIds.push(registered.company.id);

    const firstToken = new URL(registered.developmentVerificationUrl).searchParams.get("token");
    expect(firstToken).toBeTruthy();

    // Simulate an expired token without waiting 24 hours.
    await prisma.emailVerificationToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await post(baseUrl, "/auth/verify-email", { token: firstToken });
    expect(expired.status).toBe(400);

    const resent = await post(baseUrl, "/auth/verification/resend", { email });
    expect(resent.status).toBe(201);
    const resentBody = await json(resent);
    expect(resentBody.status).toBe("if_account_exists");
    const secondToken = new URL(resentBody.developmentVerificationUrl).searchParams.get("token");
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);

    const verified = await post(baseUrl, "/auth/verify-email", { token: secondToken });
    expect(verified.status).toBe(201);
    expect(await json(verified)).toEqual({ status: "email_verified" });

    // One-time use: the same token cannot verify twice.
    const reused = await post(baseUrl, "/auth/verify-email", { token: secondToken });
    expect(reused.status).toBe(400);

    const invalid = await post(baseUrl, "/auth/verify-email", { token: "not-a-real-verification-token" });
    expect(invalid.status).toBe(400);
  });

  it("keeps verification resend responses generic for unknown and verified accounts", async () => {
    const unknown = await post(baseUrl, "/auth/verification/resend", { email: `missing-${suffix}@nexus.local` });
    expect(unknown.status).toBe(201);
    expect(await json(unknown)).toEqual({ status: "if_account_exists" });

    const verified = await post(baseUrl, "/auth/verification/resend", { email });
    expect(verified.status).toBe(201);
    expect(await json(verified)).toEqual({ status: "if_account_exists" });
  });

  it("keeps password reset requests generic and rejects token reuse", async () => {
    const unknown = await post(baseUrl, "/auth/password-reset/request", { email: `missing-${suffix}@nexus.local` });
    expect(unknown.status).toBe(201);
    expect(await json(unknown)).toEqual({ status: "if_account_exists" });

    const request = await post(baseUrl, "/auth/password-reset/request", { email });
    expect(request.status).toBe(201);
    const requestBody = await json(request);
    expect(requestBody.status).toBe("if_account_exists");
    const token = new URL(requestBody.developmentResetUrl).searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await post(baseUrl, "/auth/password-reset/confirm", { token, password: newPassword });
    expect(reset.status).toBe(201);
    expect(await json(reset)).toEqual({ status: "password_reset" });

    const reused = await post(baseUrl, "/auth/password-reset/confirm", { token, password });
    expect(reused.status).toBe(400);

    const invalid = await post(baseUrl, "/auth/password-reset/confirm", { token: "not-a-real-reset-token", password });
    expect(invalid.status).toBe(400);

    const signIn = await post(baseUrl, "/auth/login", { email, password: newPassword });
    expect(signIn.status).toBe(201);
  });
});

describe("Authentication e-mail rate limiting", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await startApp());
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("limits verification resend to three requests per minute", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await post(baseUrl, "/auth/verification/resend", { email: `rate-${attempt}@nexus.local` });
      statuses.push(response.status);
      await response.text();
    }

    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses[3]).toBe(429);
  });

  it("limits password reset requests to five per minute", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await post(baseUrl, "/auth/password-reset/request", { email: `rate-reset-${attempt}@nexus.local` });
      statuses.push(response.status);
      await response.text();
    }

    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });
});
