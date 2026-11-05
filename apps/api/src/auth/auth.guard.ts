import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parse } from "cookie";
import { AuthService } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.get<string>("SESSION_COOKIE_NAME", "nexus.sid");
    const token = parse(request.headers.cookie ?? "")[cookieName];
    if (!token) throw new UnauthorizedException("Authentication required");
    request.auth = await this.auth.resolveSession(token);
    return true;
  }
}
