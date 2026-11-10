import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantContextService } from "../database/tenant-context.service.js";
import { REQUIRED_PERMISSIONS } from "./require-permissions.decorator.js";
import { resolveEffectiveAccess } from "./effective-permissions.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenants: TenantContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw new UnauthorizedException("Authentication required");
    const companyId = request.auth.activeCompanyId;
    if (!companyId) throw new ForbiddenException("Select an active company to continue");

    if (!request.auth.effectivePermissions) {
      const access = await this.tenants.run(request.auth.userId, companyId, (tx, membership) => resolveEffectiveAccess(tx, membership));
      request.auth.effectivePermissions = access.permissionKeys;
    }

    const keys = new Set(request.auth.effectivePermissions);
    if (!required.every((permission) => keys.has(permission))) {
      throw new ForbiddenException("Your effective roles do not allow this action");
    }
    return true;
  }
}
