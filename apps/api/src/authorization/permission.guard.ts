import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantContextService } from "../database/tenant-context.service.js";
import { REQUIRED_PERMISSIONS } from "./require-permissions.decorator.js";
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

    const granted = await this.tenants.run(request.auth.userId, companyId, (tx, membership) =>
      tx.rolePermission.findMany({
        where: { companyId: membership.companyId, roleId: membership.roleId },
        select: { permission: { select: { key: true } } },
      }),
    );
    const keys = new Set(granted.map(({ permission }) => permission.key));
    if (!required.every((permission) => keys.has(permission))) {
      throw new ForbiddenException("The active role does not allow this action");
    }
    return true;
  }
}
