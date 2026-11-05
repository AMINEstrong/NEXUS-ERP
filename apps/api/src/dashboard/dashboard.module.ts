import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
