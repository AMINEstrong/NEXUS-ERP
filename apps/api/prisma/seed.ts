import * as argon2 from "argon2";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const connectionString = process.env.DATABASE_URL;
const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
const password = process.env.DEMO_USER_PASSWORD;

if (!connectionString) throw new Error("DATABASE_URL is required to seed the development database");
if (!email || !password || password.length < 12) {
  throw new Error("Set DEMO_USER_EMAIL and a unique DEMO_USER_PASSWORD of at least 12 characters before seeding");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const companySeeds = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Atlas Manufacturing",
    slug: "atlas-manufacturing",
    warehouseId: "20000000-0000-4000-8000-000000000001",
    receivingWarehouseId: "20000000-0000-4000-8000-000000000002",
    crm: { customerId: "50000000-0000-4000-8000-000000000001", prospectId: "50000000-0000-4000-8000-000000000003", opportunityId: "60000000-0000-4000-8000-000000000001", activityId: "70000000-0000-4000-8000-000000000001", quotationId: "80000000-0000-4000-8000-000000000001", quotationNumber: "QUO-2026-00001", code: "ATLAS-IND", name: "Atlas Industrial Supply", contactName: "Nadia El Amrani", email: "nadia@example.test", city: "Casablanca", prospectCode: "ATLAS-PROSPECT", prospectName: "Sahara Equipment Group", reference: "OPP-ATLAS-001", title: "Warehouse automation rollout", value: "185000.00" },
    items: [
      { id: "30000000-0000-4000-8000-000000000001", movementId: "40000000-0000-4000-8000-000000000001", sku: "MFG-VALVE-015", name: "Demo pressure valve", unit: "each", unitCost: "425.00", reorderPoint: "10", quantity: "24" },
      { id: "30000000-0000-4000-8000-000000000002", movementId: "40000000-0000-4000-8000-000000000002", sku: "MFG-SEAL-008", name: "Demo sealing ring", unit: "each", unitCost: "18.50", reorderPoint: "30", quantity: "18" },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Rif Commerce",
    slug: "rif-commerce",
    warehouseId: "20000000-0000-4000-8000-000000000003",
    receivingWarehouseId: "20000000-0000-4000-8000-000000000004",
    crm: { customerId: "50000000-0000-4000-8000-000000000002", prospectId: "50000000-0000-4000-8000-000000000004", opportunityId: "60000000-0000-4000-8000-000000000002", activityId: "70000000-0000-4000-8000-000000000002", quotationId: "80000000-0000-4000-8000-000000000002", quotationNumber: "QUO-2026-00001", code: "RIF-RETAIL", name: "Rif Retail Group", contactName: "Youssef Benali", email: "youssef@example.test", city: "Tangier", prospectCode: "RIF-PROSPECT", prospectName: "Northern Coast Markets", reference: "OPP-RIF-001", title: "Regional retail supply agreement", value: "72000.00" },
    items: [
      { id: "30000000-0000-4000-8000-000000000003", movementId: "40000000-0000-4000-8000-000000000003", sku: "RIF-PACK-KIT", name: "Demo packing kit", unit: "pack", unitCost: "32.00", reorderPoint: "20", quantity: "46" },
      { id: "30000000-0000-4000-8000-000000000004", movementId: "40000000-0000-4000-8000-000000000004", sku: "RIF-CABLE-USB", name: "Demo USB cable", unit: "each", unitCost: "49.90", reorderPoint: "15", quantity: "9" },
    ],
  },
];
const permissionModules = ["platform", "company", "inventory", "sales", "purchasing", "finance", "hr", "crm", "projects", "reports", "notifications", "administration"];
const permissionActions = ["create", "read", "update", "delete", "approve", "export", "manage"];
const roleSeeds = [
  { key: "company_owner", name: "Company Owner", modules: permissionModules.filter((module) => module !== "platform"), actions: permissionActions },
  { key: "company_admin", name: "Company Admin", modules: permissionModules.filter((module) => module !== "platform"), actions: permissionActions },
  { key: "general_manager", name: "General Manager", modules: ["company", "inventory", "sales", "purchasing", "finance", "hr", "crm", "projects", "reports", "notifications"], actions: ["create", "read", "update", "approve", "export"] },
  { key: "accountant", name: "Accountant", modules: ["finance", "sales", "purchasing", "reports"], actions: ["create", "read", "update", "approve", "export"] },
  { key: "hr_manager", name: "HR Manager", modules: ["hr", "reports"], actions: ["create", "read", "update", "approve", "export"] },
  { key: "sales_manager", name: "Sales Manager", modules: ["sales", "crm", "reports"], actions: ["create", "read", "update", "approve", "export"] },
  { key: "inventory_manager", name: "Inventory Manager", modules: ["inventory", "purchasing", "reports"], actions: ["create", "read", "update", "approve", "export"] },
  { key: "employee", name: "Employee", modules: ["company", "notifications"], actions: ["read"] },
];
const planSeeds = [
  { code: "free_trial", name: "Free Trial", trialDays: 14, usageLimits: { users: 5, companies: 1 }, modules: ["company", "inventory", "sales", "crm"] },
  { code: "starter", name: "Starter", trialDays: 0, usageLimits: { users: 10 }, modules: ["company", "inventory", "sales", "crm"] },
  { code: "professional", name: "Professional", trialDays: 0, usageLimits: { users: 50 }, modules: permissionModules.filter((module) => !["platform", "administration"].includes(module)) },
  { code: "enterprise", name: "Enterprise", trialDays: 0, usageLimits: {}, modules: permissionModules.filter((module) => module !== "platform") },
];

async function seed() {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "NEXUS Demo Owner", emailVerifiedAt: new Date() },
    create: {
      email,
      name: "NEXUS Demo Owner",
      passwordHash: await argon2.hash(password!, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      emailVerifiedAt: new Date(),
    },
  });

  const permissions: { id: string; module: string; action: string }[] = [];
  for (const module of permissionModules) {
    for (const action of permissionActions) {
      const key = `${module}.${action}`;
      permissions.push(await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, module, action },
      }));
    }
  }

  const plans = new Map<string, string>();
  for (const plan of planSeeds) {
    const saved = await prisma.plan.upsert({ where: { code: plan.code }, update: plan, create: plan });
    plans.set(plan.code, saved.id);
  }

  for (const companySeed of companySeeds) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${user.id}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_company_id', ${companySeed.id}, true)`;

      const company = await tx.company.upsert({
        where: { slug: companySeed.slug },
        update: { name: companySeed.name },
        create: {
          id: companySeed.id,
          name: companySeed.name,
          slug: companySeed.slug,
          countryCode: "MA",
          currencyCode: "MAD",
          defaultLocale: "fr-MA",
          timeZone: "Africa/Casablanca",
        },
      });

      const savedRoles = new Map<string, string>();
      for (const roleSeed of roleSeeds) {
        const role = await tx.role.upsert({
          where: { companyId_key: { companyId: company.id, key: roleSeed.key } },
          update: { name: roleSeed.name, isSystem: true },
          create: { companyId: company.id, key: roleSeed.key, name: roleSeed.name, isSystem: true },
        });
        savedRoles.set(roleSeed.key, role.id);

        for (const permission of permissions.filter((permission) => roleSeed.modules.includes(permission.module) && roleSeed.actions.includes(permission.action))) {
            await tx.rolePermission.upsert({
              where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
              update: { companyId: company.id },
              create: { companyId: company.id, roleId: role.id, permissionId: permission.id },
            });
        }
      }

      const ownerRoleId = savedRoles.get("company_owner")!;
      const membership = await tx.membership.upsert({
        where: { companyId_userId: { companyId: company.id, userId: user.id } },
        update: { roleId: ownerRoleId, status: "ACTIVE", joinedAt: new Date() },
        create: { companyId: company.id, userId: user.id, roleId: ownerRoleId, status: "ACTIVE", joinedAt: new Date() },
      });
      await tx.membershipRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: ownerRoleId } },
        update: {},
        create: { companyId: company.id, membershipId: membership.id, roleId: ownerRoleId, assignedByUserId: user.id },
      });

      await tx.subscription.upsert({
        where: { id: companySeed.id },
        update: {},
        create: {
          id: companySeed.id,
          companyId: company.id,
          planId: plans.get("free_trial")!,
          status: "TRIALING",
          startedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      const mainWarehouse = await tx.warehouse.upsert({
        where: { companyId_code: { companyId: company.id, code: "MAIN" } },
        update: {},
        create: { id: companySeed.warehouseId, companyId: company.id, code: "MAIN", name: `${company.name} Main Warehouse`, location: "Morocco" },
      });
      await tx.warehouse.upsert({
        where: { companyId_code: { companyId: company.id, code: "RECEIVING" } },
        update: {},
        create: { id: companySeed.receivingWarehouseId, companyId: company.id, code: "RECEIVING", name: `${company.name} Receiving`, location: "Morocco" },
      });

      for (const itemSeed of companySeed.items) {
        const item = await tx.inventoryItem.upsert({
          where: { companyId_sku: { companyId: company.id, sku: itemSeed.sku } },
          update: {},
          create: {
            id: itemSeed.id,
            companyId: company.id,
            sku: itemSeed.sku,
            name: itemSeed.name,
            unit: itemSeed.unit,
            unitCost: itemSeed.unitCost,
            reorderPoint: itemSeed.reorderPoint,
          },
        });
        await tx.stockBalance.upsert({
          where: { companyId_productId_warehouseId: { companyId: company.id, productId: item.id, warehouseId: mainWarehouse.id } },
          update: {},
          create: { companyId: company.id, productId: item.id, warehouseId: mainWarehouse.id, quantity: itemSeed.quantity },
        });
        await tx.inventoryMovement.upsert({
          where: { id: itemSeed.movementId },
          update: {},
          create: {
            id: itemSeed.movementId,
            companyId: company.id,
            productId: item.id,
            warehouseId: mainWarehouse.id,
            actorUserId: user.id,
            type: "ADJUSTMENT",
            quantity: itemSeed.quantity,
            unitCost: itemSeed.unitCost,
            reference: "DEMO-OPENING-STOCK",
            notes: "Seeded demo opening balance for local testing",
          },
        });
      }

      const crmCustomer = await tx.crmCustomer.upsert({
        where: { companyId_code: { companyId: company.id, code: companySeed.crm.code } },
        update: {},
        create: { id: companySeed.crm.customerId, companyId: company.id, code: companySeed.crm.code, name: companySeed.crm.name, type: "CUSTOMER", contactName: companySeed.crm.contactName, email: companySeed.crm.email, city: companySeed.crm.city, countryCode: "MA" },
      });
      await tx.crmCustomer.upsert({
        where: { companyId_code: { companyId: company.id, code: companySeed.crm.prospectCode } },
        update: {},
        create: { id: companySeed.crm.prospectId, companyId: company.id, code: companySeed.crm.prospectCode, name: companySeed.crm.prospectName, type: "PROSPECT", city: "Morocco", countryCode: "MA", notes: "Seeded demonstration prospect" },
      });
      const crmOpportunity = await tx.crmOpportunity.upsert({
        where: { companyId_reference: { companyId: company.id, reference: companySeed.crm.reference } },
        update: {},
        create: { id: companySeed.crm.opportunityId, companyId: company.id, customerId: crmCustomer.id, reference: companySeed.crm.reference, title: companySeed.crm.title, stage: "PROPOSAL", estimatedValue: companySeed.crm.value, probability: 65, expectedCloseAt: new Date("2026-12-15T00:00:00.000Z"), notes: "Seeded demonstration opportunity" },
      });
      await tx.crmActivity.upsert({
        where: { id: companySeed.crm.activityId },
        update: {},
        create: { id: companySeed.crm.activityId, companyId: company.id, customerId: crmCustomer.id, opportunityId: crmOpportunity.id, type: "TASK", subject: "Confirm proposal review meeting", body: "Demonstration follow-up activity; update or complete it during testing.", dueAt: new Date("2026-11-12T10:00:00.000Z") },
      });

      const sampleItem = companySeed.items[0]!;
      const unitPrice = (Number(sampleItem.unitCost) * 1.35).toFixed(2);
      const subtotal = (Number(unitPrice) * 2).toFixed(2);
      const taxAmount = (Number(subtotal) * 0.2).toFixed(2);
      const total = (Number(subtotal) + Number(taxAmount)).toFixed(2);
      await tx.salesQuotation.upsert({
        where: { companyId_number: { companyId: company.id, number: companySeed.crm.quotationNumber } },
        update: {},
        create: {
          id: companySeed.crm.quotationId,
          companyId: company.id,
          customerId: crmCustomer.id,
          number: companySeed.crm.quotationNumber,
          status: "DRAFT",
          currencyCode: "MAD",
          subtotal,
          taxTotal: taxAmount,
          total,
          validUntil: new Date("2026-12-31T00:00:00.000Z"),
          notes: "Demo quotation: send it, convert it to an order, then complete the inventory and payment workflow.",
          lines: {
            create: {
              lineNumber: 1,
              productId: (await tx.inventoryItem.findUniqueOrThrow({ where: { companyId_sku: { companyId: company.id, sku: sampleItem.sku } } })).id,
              description: sampleItem.name,
              quantity: "2.000",
              unitPrice,
              taxRate: "20.00",
              subtotal,
              taxAmount,
              total,
            },
          },
        },
      });

    });
  }

  console.log(`Seeded ${companySeeds.length} demo companies, sample inventory, CRM and sales quotations, and ${permissionModules.length * permissionActions.length} permissions for ${email}.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
