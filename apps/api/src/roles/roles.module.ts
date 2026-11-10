import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { RolesController } from "./roles.controller.js";
import { RolesService } from "./roles.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
