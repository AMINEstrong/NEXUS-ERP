import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
