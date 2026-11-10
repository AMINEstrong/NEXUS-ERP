import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module.js";
import { validateEnv } from "./config/env.js";
import { CompaniesModule } from "./companies/companies.module.js";
import { RolesModule } from "./roles/roles.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { CrmModule } from "./crm/crm.module.js";
import { SalesModule } from "./sales/sales.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")],
      validate: validateEnv,
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
