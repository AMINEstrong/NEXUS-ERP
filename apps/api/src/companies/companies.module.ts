import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { CompaniesController } from "./companies.controller.js";

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [CompaniesController] })
export class CompaniesModule {}
