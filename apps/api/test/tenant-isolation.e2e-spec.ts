import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaService } from "../src/database/prisma.service.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const connectionString = process.env.DATABASE_URL;
const companyA = "10000000-0000-4000-8000-000000000001";
const companyB = "10000000-0000-4000-8000-000000000002";
const demoEmail = process.env.DEMO_USER_EMAIL;

describe("PostgreSQL tenant row-level security", () => {
  let prisma: PrismaClient;
  let scopedPrisma: PrismaService;
  let companyAId: string;
  let companyBId: string;
  let demoUserId: string;

  beforeAll(async () => {
    if (!connectionString) throw new Error("DATABASE_URL is required; start Docker and apply migrations first");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    scopedPrisma = new PrismaService();
    await prisma.$connect();
    const demoUser = await prisma.user.findFirst({ where: { email: demoEmail }, select: { id: true } });
    if (!demoUser) throw new Error("Seed the demo user before running tenant integration tests");
    demoUserId = demoUser.id;
    companyAId = companyA;
    companyBId = companyB;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (scopedPrisma) await scopedPrisma.$disconnect();
  });

  it("exposes only the active tenant company to a scoped request", async () => {
    const result = await scopedPrisma.withTenantContext(demoUserId, companyAId, (tx) =>
      tx.company.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    );

    expect(result.map(({ id }) => id)).toEqual([companyAId]);
    expect(result.map(({ id }) => id)).not.toContain(companyBId);
  });

  it("fails closed when no tenant context is set", async () => {
    const result = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM companies ORDER BY id`;
    expect(result).toEqual([]);
  });

  it("rejects a company context when the authenticated user has no active membership", async () => {
    await expect(
      scopedPrisma.withTenantContext("10000000-0000-4000-8000-000000000099", companyAId, async () => "should not run"),
    ).rejects.toThrow("Active membership in the requested company is required");
  });
});
