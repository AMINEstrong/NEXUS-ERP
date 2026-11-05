import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [InventoryController], providers: [InventoryService] })
export class InventoryModule {}
