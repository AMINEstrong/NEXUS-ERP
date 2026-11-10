import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import {
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  ResendVerificationDto,
  SelectCompanyDto,
  VerifyEmailDto,
} from "./token.dto.js";
import { LoginDto } from "./login.dto.js";
import { RegisterDto } from "./register.dto.js";
import { UpdateLocaleDto } from "../roles/role.dto.js";
import type { AuthenticatedRequest } from "./auth.types.js";

@ApiTags("authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  private get cookieName() {
    return this.config.get<string>("SESSION_COOKIE_NAME", "nexus.sid");
  }

  private get cookieOptions() {
    // Defence in depth: environment validation already refuses to boot a
    // production API without COOKIE_SECURE=true, but never issue an insecure
    // session cookie in production even if that validation is bypassed.
    const isProduction = this.config.get<string>("NODE_ENV") === "production";
    const secure = isProduction || this.config.get<string>("COOKIE_SECURE", "false") === "true";
    const ttl = this.config.get<number>("SESSION_TTL_HOURS", 12) * 60 * 60 * 1000;
    return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: ttl };
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Register an owner account and initialize its company workspace" })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Create an authenticated browser session" })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body.email, body.password);
    response.cookie(this.cookieName, result.token, this.cookieOptions);
    return { user: result.user, expiresAt: result.expiresAt };
  }

  @Post("verify-email")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Verify an account with a one-time token" })
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(body.token);
  }

  @Post("verification/resend")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: "Send another verification link without revealing whether the account exists" })
  resendVerification(@Body() body: ResendVerificationDto) {
    return this.auth.resendVerification(body.email);
  }

  @Post("password-reset/request")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Request a one-time password reset link" })
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(body.email);
  }

  @Post("password-reset/confirm")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Set a new password using a valid one-time token" })
  resetPassword(@Body() body: PasswordResetConfirmDto) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
  @ApiOperation({ summary: "Get the signed-in user and company memberships" })
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.currentUser(request.auth!.userId, request.auth!.activeCompanyId);
  }

  @Patch("me/locale")
  @UseGuards(AuthGuard)
  @ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
  @ApiOperation({ summary: "Persist the signed-in user's interface language" })
  updateLocale(@Body() body: UpdateLocaleDto, @Req() request: AuthenticatedRequest) {
    return this.auth.updateLocale(request.auth!.userId, body.locale);
  }

  @Post("active-company")
  @UseGuards(AuthGuard)
  @ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
  @ApiOperation({ summary: "Select a company after verifying the authenticated user's membership" })
  selectCompany(@Body() body: SelectCompanyDto, @Req() request: AuthenticatedRequest) {
    return this.auth.selectCompany(request.auth!.userId, request.auth!.sessionId, body.companyId);
  }

  @Get("sessions")
  @UseGuards(AuthGuard)
  @ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
  @ApiOperation({ summary: "List active sessions belonging to the signed-in user" })
  sessions(@Req() request: AuthenticatedRequest) {
    return this.auth.listSessions(request.auth!.userId, request.auth!.sessionId);
  }

  @Delete("sessions/:sessionId")
  @UseGuards(AuthGuard)
  @ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
  @ApiOperation({ summary: "Revoke one of the signed-in user's sessions" })
  async revokeSession(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.revokeSession(request.auth!.userId, sessionId);
    if (sessionId === request.auth!.sessionId) {
      response.clearCookie(this.cookieName, { ...this.cookieOptions, maxAge: undefined });
    }
    return { status: "session_revoked" };
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  @ApiCookieAuth(process.env.SESSION_COOKIE_NAME ?? "nexus.sid")
  @ApiOperation({ summary: "Revoke the current browser session" })
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.auth!.sessionId);
    response.clearCookie(this.cookieName, { ...this.cookieOptions, maxAge: undefined });
    return { status: "signed_out" };
  }
}
