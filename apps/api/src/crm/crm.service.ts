import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import type { CrmActivityType, CrmOpportunityStage } from "../../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { CreateCrmActivityDto, CreateCrmCustomerDto, CreateCrmOpportunityDto, CrmListQueryDto, UpdateCrmCustomerDto, UpdateCrmOpportunityDto } from "./crm.dto.js";

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string, companyId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [customers, prospects, openOpportunities, openValue, pendingActivities] = await Promise.all([
        tx.crmCustomer.count({ where: { companyId: membership.companyId, type: "CUSTOMER", isActive: true } }),
        tx.crmCustomer.count({ where: { companyId: membership.companyId, type: "PROSPECT", isActive: true } }),
        tx.crmOpportunity.count({ where: { companyId: membership.companyId, isActive: true, stage: { notIn: ["WON", "LOST"] } } }),
        tx.crmOpportunity.aggregate({ where: { companyId: membership.companyId, isActive: true, stage: { notIn: ["WON", "LOST"] } }, _sum: { estimatedValue: true } }),
        tx.crmActivity.count({ where: { companyId: membership.companyId, completedAt: null } }),
      ]);
      return { customerCount: customers, prospectCount: prospects, openOpportunityCount: openOpportunities, pipelineValue: (openValue._sum.estimatedValue ?? new Prisma.Decimal(0)).toString(), pendingActivityCount: pendingActivities };
    });
  }

  listCustomers(userId: string, companyId: string, query: CrmListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const search = query.q?.trim();
    const where: Prisma.CrmCustomerWhereInput = { companyId, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { contactName: { contains: search, mode: "insensitive" } }] } : {}) };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [data, total] = await Promise.all([
        tx.crmCustomer.findMany({ where: { ...where, companyId: membership.companyId }, orderBy: [{ isActive: "desc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { opportunities: true, activities: true } } } }),
        tx.crmCustomer.count({ where: { ...where, companyId: membership.companyId } }),
      ]);
      return { data, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  createCustomer(userId: string, companyId: string, actorUserId: string, body: CreateCrmCustomerDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      try {
        const customer = await tx.crmCustomer.create({ data: { companyId: membership.companyId, code: body.code.trim().toUpperCase(), name: body.name.trim(), type: body.type ?? "PROSPECT", contactName: body.contactName?.trim() || null, email: body.email?.trim().toLowerCase() || null, phone: body.phone?.trim() || null, website: body.website?.trim() || null, city: body.city?.trim() || null, countryCode: body.countryCode?.trim().toUpperCase() || null, notes: body.notes?.trim() || null } });
        await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "crm.customer_created", entityType: "CrmCustomer", entityId: customer.id, metadata: { code: customer.code, type: customer.type } } });
        return customer;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A CRM record with this code already exists");
        throw error;
      }
    });
  }

  updateCustomer(userId: string, companyId: string, actorUserId: string, id: string, body: UpdateCrmCustomerDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const current = await tx.crmCustomer.findFirst({ where: { id, companyId: membership.companyId } });
      if (!current) throw new NotFoundException("CRM customer not found");
      const data: Prisma.CrmCustomerUpdateInput = {};
      if (body.name !== undefined) data.name = body.name.trim();
      if (body.type !== undefined) data.type = body.type;
      if (body.contactName !== undefined) data.contactName = body.contactName.trim() || null;
      if (body.email !== undefined) data.email = body.email.trim().toLowerCase() || null;
      if (body.phone !== undefined) data.phone = body.phone.trim() || null;
      if (body.website !== undefined) data.website = body.website.trim() || null;
      if (body.city !== undefined) data.city = body.city.trim() || null;
      if (body.countryCode !== undefined) data.countryCode = body.countryCode.trim().toUpperCase() || null;
      if (body.notes !== undefined) data.notes = body.notes.trim() || null;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (!Object.keys(data).length) throw new BadRequestException("At least one CRM customer field is required");
      const customer = await tx.crmCustomer.update({ where: { id: current.id }, data });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "crm.customer_updated", entityType: "CrmCustomer", entityId: current.id, metadata: { changedFields: Object.keys(data) } } });
      return customer;
    });
  }

  listOpportunities(userId: string, companyId: string, query: CrmListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const search = query.q?.trim();
    const where: Prisma.CrmOpportunityWhereInput = { companyId, ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { customer: { name: { contains: search, mode: "insensitive" } } }] } : {}) };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [data, total] = await Promise.all([
        tx.crmOpportunity.findMany({ where: { ...where, companyId: membership.companyId }, orderBy: [{ isActive: "desc" }, { expectedCloseAt: "asc" }, { updatedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { id: true, code: true, name: true, type: true } }, _count: { select: { activities: true } } } }),
        tx.crmOpportunity.count({ where: { ...where, companyId: membership.companyId } }),
      ]);
      return { data, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  createOpportunity(userId: string, companyId: string, actorUserId: string, body: CreateCrmOpportunityDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const customer = await tx.crmCustomer.findFirst({ where: { id: body.customerId, companyId: membership.companyId, isActive: true } });
      if (!customer) throw new BadRequestException("Choose an active customer or prospect in this company");
      try {
        const opportunity = await tx.crmOpportunity.create({ data: { companyId: membership.companyId, customerId: customer.id, reference: body.reference.trim().toUpperCase(), title: body.title.trim(), stage: (body.stage ?? "QUALIFICATION") as CrmOpportunityStage, estimatedValue: new Prisma.Decimal(body.estimatedValue ?? "0"), probability: body.probability ?? 10, expectedCloseAt: body.expectedCloseAt ? new Date(`${body.expectedCloseAt.slice(0, 10)}T00:00:00.000Z`) : null, notes: body.notes?.trim() || null }, include: { customer: { select: { id: true, code: true, name: true } } } });
        await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "crm.opportunity_created", entityType: "CrmOpportunity", entityId: opportunity.id, metadata: { reference: opportunity.reference, customerId: customer.id } } });
        return opportunity;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("An opportunity with this reference already exists");
        throw error;
      }
    });
  }

  updateOpportunity(userId: string, companyId: string, actorUserId: string, id: string, body: UpdateCrmOpportunityDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const current = await tx.crmOpportunity.findFirst({ where: { id, companyId: membership.companyId } });
      if (!current) throw new NotFoundException("CRM opportunity not found");
      if (body.customerId) {
        const customer = await tx.crmCustomer.findFirst({ where: { id: body.customerId, companyId: membership.companyId, isActive: true } });
        if (!customer) throw new BadRequestException("Choose an active customer or prospect in this company");
      }
      const data: Prisma.CrmOpportunityUncheckedUpdateInput = {};
      if (body.customerId !== undefined) data.customerId = body.customerId;
      if (body.title !== undefined) data.title = body.title.trim();
      if (body.stage !== undefined) data.stage = body.stage as CrmOpportunityStage;
      if (body.estimatedValue !== undefined) data.estimatedValue = new Prisma.Decimal(body.estimatedValue);
      if (body.probability !== undefined) data.probability = body.probability;
      if (body.expectedCloseAt !== undefined) data.expectedCloseAt = body.expectedCloseAt ? new Date(`${body.expectedCloseAt.slice(0, 10)}T00:00:00.000Z`) : null;
      if (body.notes !== undefined) data.notes = body.notes.trim() || null;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (!Object.keys(data).length) throw new BadRequestException("At least one opportunity field is required");
      const opportunity = await tx.crmOpportunity.update({ where: { id: current.id }, data, include: { customer: { select: { id: true, code: true, name: true } } } });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "crm.opportunity_updated", entityType: "CrmOpportunity", entityId: current.id, metadata: { changedFields: Object.keys(data) } } });
      return opportunity;
    });
  }

  listActivities(userId: string, companyId: string, query: CrmListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const search = query.q?.trim();
    const where: Prisma.CrmActivityWhereInput = { companyId, ...(search ? { OR: [{ subject: { contains: search, mode: "insensitive" } }, { body: { contains: search, mode: "insensitive" } }, { customer: { name: { contains: search, mode: "insensitive" } } }] } : {}) };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const [data, total] = await Promise.all([
        tx.crmActivity.findMany({ where: { ...where, companyId: membership.companyId }, orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { id: true, code: true, name: true } }, opportunity: { select: { id: true, reference: true, title: true } } } }),
        tx.crmActivity.count({ where: { ...where, companyId: membership.companyId } }),
      ]);
      return { data, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  createActivity(userId: string, companyId: string, actorUserId: string, body: CreateCrmActivityDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      if (!body.customerId && !body.opportunityId) throw new BadRequestException("Link the activity to a customer or opportunity");
      const opportunity = body.opportunityId ? await tx.crmOpportunity.findFirst({ where: { id: body.opportunityId, companyId: membership.companyId, isActive: true } }) : null;
      if (body.opportunityId && !opportunity) throw new BadRequestException("Choose an active opportunity in this company");
      const customerId = body.customerId ?? opportunity?.customerId;
      if (body.customerId && opportunity && body.customerId !== opportunity.customerId) throw new BadRequestException("The customer must match the selected opportunity");
      if (!customerId || !await tx.crmCustomer.findFirst({ where: { id: customerId, companyId: membership.companyId, isActive: true }, select: { id: true } })) throw new BadRequestException("Choose an active customer or prospect in this company");
      const activity = await tx.crmActivity.create({ data: { companyId: membership.companyId, customerId, opportunityId: opportunity?.id ?? null, type: body.type as CrmActivityType, subject: body.subject.trim(), body: body.body?.trim() || null, dueAt: body.dueAt ? new Date(body.dueAt) : null }, include: { customer: { select: { id: true, code: true, name: true } }, opportunity: { select: { id: true, reference: true, title: true } } } });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "crm.activity_created", entityType: "CrmActivity", entityId: activity.id, metadata: { type: activity.type, customerId } } });
      return activity;
    });
  }

  completeActivity(userId: string, companyId: string, actorUserId: string, id: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const current = await tx.crmActivity.findFirst({ where: { id, companyId: membership.companyId } });
      if (!current) throw new NotFoundException("CRM activity not found");
      const activity = await tx.crmActivity.update({ where: { id: current.id }, data: { completedAt: current.completedAt ? null : new Date() } });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: activity.completedAt ? "crm.activity_completed" : "crm.activity_reopened", entityType: "CrmActivity", entityId: activity.id, metadata: {} } });
      return activity;
    });
  }
}
