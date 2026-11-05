import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { resolve } from "node:path";
import { z } from "zod";
import { AuthModule } from "./auth/auth.module.js";
import { CompaniesModule } from "./companies/companies.module.js";
import { RolesModule } from "./roles/roles.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { CrmModule } from "./crm/crm.module.js";
import { SalesModule } from "./sales/sales.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default("nexus.sid"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")],
      validate: (config) => EnvSchema.parse(config),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CompaniesModule,
    RolesModule,
    InventoryModule,
    CrmModule,
    SalesModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
