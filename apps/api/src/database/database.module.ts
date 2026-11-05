import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { TenantContextService } from "./tenant-context.service.js";

@Global()
@Module({ providers: [PrismaService, TenantContextService], exports: [PrismaService, TenantContextService] })
export class DatabaseModule {}
