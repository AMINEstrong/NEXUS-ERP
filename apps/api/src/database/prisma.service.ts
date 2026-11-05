import { ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../generated/prisma/client.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async withUserContext<T>(userId: string, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      return action(tx);
    });
  }

  async withTenantContext<T>(
    userId: string,
    requestedCompanyId: string,
    action: (
      tx: Prisma.TransactionClient,
      membership: { id: string; companyId: string; roleId: string },
    ) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      const membership = await tx.membership.findFirst({
        where: { userId, companyId: requestedCompanyId, status: "ACTIVE" },
        select: { id: true, companyId: true, roleId: true },
      });
      if (!membership) throw new ForbiddenException("Active membership in the requested company is required");

      await tx.$executeRaw`SELECT set_config('app.current_company_id', ${membership.companyId}, true)`;
      return action(tx, membership);
    });
  }
}
