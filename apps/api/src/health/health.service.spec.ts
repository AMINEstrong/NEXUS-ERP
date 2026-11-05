import { ServiceUnavailableException } from "@nestjs/common";
import { jest } from "@jest/globals";
import { HealthService } from "./health.service.js";

describe("HealthService", () => {
  it("reports the API and database as ready after a successful query", async () => {
    const prisma = { $queryRaw: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(1) };
    const health = new HealthService(prisma as never);

    await expect(health.check()).resolves.toMatchObject({ status: "ok", database: "ready" });
  });

  it("returns a service unavailable error when the database probe fails", async () => {
    const prisma = { $queryRaw: jest.fn<(...args: any[]) => Promise<any>>().mockRejectedValue(new Error("connection refused")) };
    const health = new HealthService(prisma as never);

    await expect(health.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
