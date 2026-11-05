import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ready", timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable", database: "unavailable" });
    }
  }
}
