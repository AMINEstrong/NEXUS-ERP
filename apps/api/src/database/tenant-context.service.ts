import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(
    userId: string,
    requestedCompanyId: string,
    action: (
      tx: Prisma.TransactionClient,
      membership: { id: string; companyId: string; roleId: string },
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenantContext(userId, requestedCompanyId, action);
  }
}
