import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { RolesController } from "./roles.controller.js";

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [RolesController] })
export class RolesModule {}
