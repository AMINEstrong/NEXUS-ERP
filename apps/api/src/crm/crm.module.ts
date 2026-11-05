import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { CrmController } from "./crm.controller.js";
import { CrmService } from "./crm.service.js";

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [CrmController], providers: [CrmService] })
export class CrmModule {}
