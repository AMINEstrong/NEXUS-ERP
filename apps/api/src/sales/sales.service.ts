import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { SalesPaymentMethod } from "../../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { CreateSalesInvoiceDto, CreateSalesQuotationDto, DeliverSalesOrderDto, RecordSalesPaymentDto, SalesListQueryDto } from "./sales.dto.js";

type Tx = Prisma.TransactionClient;
const roundMoney = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string, companyId: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenant = membership.companyId;
      const [quotationCount, openQuotationCount, orderCount, invoiceCount, receivable] = await Promise.all([
        tx.salesQuotation.count({ where: { companyId: tenant } }),
        tx.salesQuotation.count({ where: { companyId: tenant, status: { in: ["DRAFT", "SENT"] } } }),
        tx.salesOrder.count({ where: { companyId: tenant, status: { not: "CANCELLED" } } }),
        tx.salesInvoice.count({ where: { companyId: tenant, status: { in: ["OPEN", "PARTIALLY_PAID"] } } }),
        tx.salesInvoice.aggregate({ where: { companyId: tenant, status: { in: ["OPEN", "PARTIALLY_PAID"] } }, _sum: { total: true, paidAmount: true } }),
      ]);
      const gross = receivable._sum.total ?? new Prisma.Decimal(0);
      const paid = receivable._sum.paidAmount ?? new Prisma.Decimal(0);
      return { quotationCount, openQuotationCount, orderCount, openInvoiceCount: invoiceCount, receivables: gross.sub(paid).toFixed(2) };
    });
  }

  listQuotations(userId: string, companyId: string, query: SalesListQueryDto) {
    const page = Math.max(1, query.page || 1), pageSize = Math.min(100, Math.max(1, query.pageSize || 20)), search = query.q?.trim();
    const where: Prisma.SalesQuotationWhereInput = { companyId, ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { customer: { name: { contains: search, mode: "insensitive" } } }] } : {}) };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenantWhere = { ...where, companyId: membership.companyId };
      const [data, total] = await Promise.all([
        tx.salesQuotation.findMany({ where: tenantWhere, include: { customer: { select: { id: true, code: true, name: true } }, opportunity: { select: { id: true, reference: true, title: true } }, lines: { include: { product: { select: { sku: true, name: true, unit: true } } }, orderBy: { lineNumber: "asc" } }, order: { select: { id: true, number: true, status: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
        tx.salesQuotation.count({ where: tenantWhere }),
      ]);
      return { data, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  listOrders(userId: string, companyId: string, query: SalesListQueryDto) {
    const page = Math.max(1, query.page || 1), pageSize = Math.min(100, Math.max(1, query.pageSize || 20)), search = query.q?.trim();
    const where: Prisma.SalesOrderWhereInput = { companyId, ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { customer: { name: { contains: search, mode: "insensitive" } } }] } : {}) };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenantWhere = { ...where, companyId: membership.companyId };
      const [data, total] = await Promise.all([
        tx.salesOrder.findMany({ where: tenantWhere, include: { customer: { select: { id: true, code: true, name: true } }, quotation: { select: { id: true, number: true } }, lines: { include: { product: { select: { sku: true, name: true, unit: true } }, deliveries: { select: { quantity: true } }, invoices: { select: { quantity: true } } }, orderBy: { lineNumber: "asc" } }, deliveries: { select: { id: true, number: true, deliveredAt: true } }, invoices: { select: { id: true, number: true, status: true, total: true, paidAmount: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
        tx.salesOrder.count({ where: tenantWhere }),
      ]);
      return { data, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  listInvoices(userId: string, companyId: string, query: SalesListQueryDto) {
    const page = Math.max(1, query.page || 1), pageSize = Math.min(100, Math.max(1, query.pageSize || 20)), search = query.q?.trim();
    const where: Prisma.SalesInvoiceWhereInput = { companyId, ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { customer: { name: { contains: search, mode: "insensitive" } } }] } : {}) };
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenantWhere = { ...where, companyId: membership.companyId };
      const [data, total] = await Promise.all([
        tx.salesInvoice.findMany({
          where: tenantWhere,
          include: {
            customer: { select: { id: true, code: true, name: true } },
            order: { select: { id: true, number: true } },
            lines: { include: { product: { select: { sku: true, name: true, unit: true } } }, orderBy: { lineNumber: "asc" } },
            payments: { orderBy: { receivedAt: "desc" }, include: { journalEntry: { include: { lines: { include: { account: { select: { code: true, name: true, type: true } } } } } } } },
            journalEntry: { include: { lines: { include: { account: { select: { code: true, name: true, type: true } } } } } },
          },
          orderBy: { issuedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        }),
        tx.salesInvoice.count({ where: tenantWhere }),
      ]);
      return { data, page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
    });
  }

  createQuotation(userId: string, companyId: string, actorUserId: string, body: CreateSalesQuotationDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenant = membership.companyId;
      const customer = await tx.crmCustomer.findFirst({ where: { id: body.customerId, companyId: tenant, isActive: true } });
      if (!customer) throw new BadRequestException("Choose an active customer in this company");
      if (customer.type !== "CUSTOMER") throw new BadRequestException("Convert this prospect to a customer before creating a quotation");
      const opportunity = body.opportunityId ? await tx.crmOpportunity.findFirst({ where: { id: body.opportunityId, companyId: tenant, isActive: true } }) : null;
      if (body.opportunityId && (!opportunity || opportunity.customerId !== customer.id)) throw new BadRequestException("Choose an active opportunity belonging to this customer");
      const productIds = [...new Set(body.lines.map((line) => line.productId))];
      const products = await tx.inventoryItem.findMany({ where: { id: { in: productIds }, companyId: tenant, isActive: true } });
      if (products.length !== productIds.length) throw new BadRequestException("Every quotation item must be active in the current company");
      const productMap = new Map(products.map((product) => [product.id, product]));
      const lines = body.lines.map((line, index) => {
        const quantity = new Prisma.Decimal(line.quantity), unitPrice = new Prisma.Decimal(line.unitPrice), taxRate = new Prisma.Decimal(line.taxRate ?? "0");
        if (!quantity.greaterThan(0) || unitPrice.isNegative() || taxRate.isNegative() || taxRate.greaterThan(100)) throw new BadRequestException("Quotation quantities, prices, and tax rates must be valid and non-negative");
        const product = productMap.get(line.productId)!;
        const subtotal = roundMoney(quantity.mul(unitPrice)), taxAmount = roundMoney(subtotal.mul(taxRate).div(100));
        return { lineNumber: index + 1, productId: product.id, description: line.description?.trim() || product.name, quantity, unitPrice, taxRate, subtotal, taxAmount, total: subtotal.add(taxAmount) };
      });
      const subtotal = lines.reduce((sum, line) => sum.add(line.subtotal), new Prisma.Decimal(0));
      const taxTotal = lines.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0));
      const number = await this.nextNumber(tx, tenant, "QUO");
      const company = await tx.company.findUniqueOrThrow({ where: { id: tenant }, select: { currencyCode: true } });
      const quotation = await tx.salesQuotation.create({ data: { companyId: tenant, customerId: customer.id, opportunityId: opportunity?.id ?? null, number, currencyCode: company.currencyCode, subtotal, taxTotal, total: subtotal.add(taxTotal), validUntil: body.validUntil ? new Date(`${body.validUntil.slice(0, 10)}T00:00:00.000Z`) : null, notes: body.notes?.trim() || null, lines: { create: lines } }, include: { customer: { select: { id: true, code: true, name: true } }, lines: { include: { product: { select: { sku: true, name: true, unit: true } } } } } });
      await tx.auditLog.create({ data: { companyId: tenant, actorUserId, action: "sales.quotation_created", entityType: "SalesQuotation", entityId: quotation.id, metadata: { number, lineCount: lines.length, total: quotation.total.toString() } } });
      return quotation;
    });
  }

  sendQuotation(userId: string, companyId: string, actorUserId: string, id: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const current = await tx.salesQuotation.findFirst({ where: { id, companyId: membership.companyId } });
      if (!current) throw new NotFoundException("Sales quotation not found");
      if (current.status !== "DRAFT") throw new ConflictException("Only draft quotations can be sent");
      const quotation = await tx.salesQuotation.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "sales.quotation_sent", entityType: "SalesQuotation", entityId: id, metadata: { number: quotation.number } } });
      return quotation;
    });
  }

  convertQuotation(userId: string, companyId: string, actorUserId: string, id: string) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      await tx.$queryRaw`SELECT id FROM sales_quotations WHERE id = ${id} AND company_id = ${membership.companyId} FOR UPDATE`;
      const quotation = await tx.salesQuotation.findFirst({ where: { id, companyId: membership.companyId }, include: { lines: true } });
      if (!quotation) throw new NotFoundException("Sales quotation not found");
      if (quotation.status !== "SENT") throw new ConflictException("Send a draft quotation before converting it to an order");
      const number = await this.nextNumber(tx, membership.companyId, "ORD");
      const order = await tx.salesOrder.create({ data: { companyId: membership.companyId, quotationId: quotation.id, customerId: quotation.customerId, number, currencyCode: quotation.currencyCode, subtotal: quotation.subtotal, taxTotal: quotation.taxTotal, total: quotation.total, notes: quotation.notes, lines: { create: quotation.lines.map((line) => ({ quotationLineId: line.id, productId: line.productId, lineNumber: line.lineNumber, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, subtotal: line.subtotal, taxAmount: line.taxAmount, total: line.total })) } }, include: { customer: { select: { id: true, code: true, name: true } }, lines: { include: { product: { select: { sku: true, name: true, unit: true } } } } } });
      await tx.salesQuotation.update({ where: { id: quotation.id }, data: { status: "CONVERTED" } });
      await tx.auditLog.create({ data: { companyId: membership.companyId, actorUserId, action: "sales.quotation_converted", entityType: "SalesOrder", entityId: order.id, metadata: { quotationId: quotation.id, quotationNumber: quotation.number, orderNumber: number } } });
      return order;
    });
  }

  deliverOrder(userId: string, companyId: string, actorUserId: string, orderId: string, body: DeliverSalesOrderDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenant = membership.companyId;
      await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${orderId} AND company_id = ${tenant} FOR UPDATE`;
      const order = await tx.salesOrder.findFirst({ where: { id: orderId, companyId: tenant }, include: { lines: { include: { product: true } } } });
      if (!order) throw new NotFoundException("Sales order not found");
      if (!["OPEN", "PARTIALLY_DELIVERED"].includes(order.status)) throw new ConflictException("This order cannot receive another delivery");
      const warehouse = await tx.warehouse.findFirst({ where: { id: body.warehouseId, companyId: tenant, isActive: true } });
      if (!warehouse) throw new BadRequestException("Choose an active warehouse in this company");
      if (new Set(body.lines.map((line) => line.orderLineId)).size !== body.lines.length) throw new BadRequestException("Each order line can occur only once per delivery");
      const lineMap = new Map(order.lines.map((line) => [line.id, line]));
      for (const entry of body.lines) {
        const orderLine = lineMap.get(entry.orderLineId), quantity = new Prisma.Decimal(entry.quantity);
        if (!quantity.greaterThan(0) || !orderLine) throw new BadRequestException("Choose valid order lines and positive quantities");
        if (orderLine.deliveredQuantity.add(quantity).greaterThan(orderLine.quantity)) throw new BadRequestException(`Delivery quantity exceeds the remaining ordered quantity for ${orderLine.product.sku}`);
      }
      const number = await this.nextNumber(tx, tenant, "DLV");
      const delivery = await tx.salesDelivery.create({ data: { companyId: tenant, orderId, warehouseId: warehouse.id, number, notes: body.notes?.trim() || null } });
      for (const entry of body.lines) {
        const orderLine = lineMap.get(entry.orderLineId)!;
        const quantity = new Prisma.Decimal(entry.quantity);
        const stock = await tx.stockBalance.updateMany({ where: { companyId: tenant, productId: orderLine.productId, warehouseId: warehouse.id, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
        if (stock.count !== 1) throw new BadRequestException(`Insufficient stock for ${orderLine.product.sku} in ${warehouse.name}`);
        await tx.salesDeliveryLine.create({ data: { companyId: tenant, deliveryId: delivery.id, orderLineId: orderLine.id, productId: orderLine.productId, quantity } });
        await tx.salesOrderLine.update({ where: { id: orderLine.id }, data: { deliveredQuantity: { increment: quantity } } });
        await tx.inventoryMovement.create({ data: { companyId: tenant, productId: orderLine.productId, warehouseId: warehouse.id, actorUserId, type: "ISSUE", quantity, unitCost: orderLine.product.unitCost, reference: number, notes: `Sales delivery for ${order.number}` } });
      }
      const refreshed = await tx.salesOrderLine.findMany({ where: { orderId, companyId: tenant } });
      await tx.salesOrder.update({ where: { id: orderId }, data: { status: this.orderStatus(refreshed) } });
      await tx.auditLog.create({ data: { companyId: tenant, actorUserId, action: "sales.order_delivered", entityType: "SalesDelivery", entityId: delivery.id, metadata: { orderNumber: order.number, deliveryNumber: number, warehouseId: warehouse.id, lineCount: body.lines.length } } });
      return tx.salesDelivery.findUniqueOrThrow({ where: { id: delivery.id }, include: { warehouse: { select: { code: true, name: true } }, lines: { include: { product: { select: { sku: true, name: true } } } } } });
    });
  }

  createInvoice(userId: string, companyId: string, actorUserId: string, orderId: string, body: CreateSalesInvoiceDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenant = membership.companyId;
      await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${orderId} AND company_id = ${tenant} FOR UPDATE`;
      const order = await tx.salesOrder.findFirst({ where: { id: orderId, companyId: tenant }, include: { lines: { include: { product: true } }, customer: true } });
      if (!order) throw new NotFoundException("Sales order not found");
      if (order.status === "CANCELLED") throw new ConflictException("Cancelled orders cannot be invoiced");
      const requested = body.lines;
      if (requested && new Set(requested.map((line) => line.orderLineId)).size !== requested.length) throw new BadRequestException("Each order line can occur only once per invoice");
      const available = order.lines.map((line) => ({ line, quantity: line.deliveredQuantity.sub(line.invoicedQuantity) })).filter(({ quantity }) => quantity.greaterThan(0));
      const chosen = requested ? requested.map((entry) => {
        const found = available.find(({ line }) => line.id === entry.orderLineId), quantity = new Prisma.Decimal(entry.quantity);
        if (!found || !quantity.greaterThan(0) || quantity.greaterThan(found.quantity)) throw new BadRequestException("Invoice quantities must be positive and cannot exceed delivered uninvoiced quantities");
        return { ...found, quantity };
      }) : available;
      if (!chosen.length) throw new ConflictException("There are no delivered quantities available to invoice");
      const invoiceLines = chosen.map(({ line, quantity }, index) => {
        const subtotal = roundMoney(quantity.mul(line.unitPrice)), taxAmount = roundMoney(subtotal.mul(line.taxRate).div(100));
        return { orderLineId: line.id, productId: line.productId, lineNumber: index + 1, description: line.description, quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, subtotal, taxAmount, total: subtotal.add(taxAmount) };
      });
      const subtotal = invoiceLines.reduce((sum, line) => sum.add(line.subtotal), new Prisma.Decimal(0));
      const taxTotal = invoiceLines.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0));
      const total = subtotal.add(taxTotal), invoiceId = randomUUID(), number = await this.nextNumber(tx, tenant, "INV");
      const accounts = await this.ensureAccounts(tx, tenant);
      const journalReference = await this.nextNumber(tx, tenant, "JE");
      const journal = await tx.journalEntry.create({ data: { companyId: tenant, reference: journalReference, sourceType: "SALES_INVOICE", sourceId: invoiceId, description: `Sales invoice ${number}`, lines: { create: [
        { accountId: accounts.receivable.id, description: `Accounts receivable · ${number}`, debit: total, credit: 0 },
        { accountId: accounts.revenue.id, description: `Sales revenue · ${number}`, debit: 0, credit: subtotal },
        ...(taxTotal.greaterThan(0) ? [{ accountId: accounts.tax.id, description: `Output tax · ${number}`, debit: new Prisma.Decimal(0), credit: taxTotal }] : []),
      ] } } });
      const invoice = await tx.salesInvoice.create({ data: { id: invoiceId, companyId: tenant, orderId, customerId: order.customerId, journalEntryId: journal.id, number, currencyCode: order.currencyCode, subtotal, taxTotal, total, dueAt: new Date(`${body.dueAt.slice(0, 10)}T00:00:00.000Z`), notes: body.notes?.trim() || null, lines: { create: invoiceLines } }, include: { customer: { select: { id: true, code: true, name: true } }, lines: { include: { product: { select: { sku: true, name: true, unit: true } } } }, journalEntry: { include: { lines: { include: { account: { select: { code: true, name: true } } } } } } } });
      for (const { line, quantity } of chosen) await tx.salesOrderLine.update({ where: { id: line.id }, data: { invoicedQuantity: { increment: quantity } } });
      const refreshed = await tx.salesOrderLine.findMany({ where: { orderId, companyId: tenant } });
      await tx.salesOrder.update({ where: { id: orderId }, data: { status: this.orderStatus(refreshed) } });
      await tx.auditLog.create({ data: { companyId: tenant, actorUserId, action: "sales.invoice_issued", entityType: "SalesInvoice", entityId: invoice.id, metadata: { number, orderNumber: order.number, journalReference, total: total.toFixed(2) } } });
      return invoice;
    });
  }

  recordPayment(userId: string, companyId: string, actorUserId: string, invoiceId: string, body: RecordSalesPaymentDto) {
    return this.prisma.withTenantContext(userId, companyId, async (tx, membership) => {
      const tenant = membership.companyId;
      await tx.$queryRaw`SELECT id FROM sales_invoices WHERE id = ${invoiceId} AND company_id = ${tenant} FOR UPDATE`;
      const invoice = await tx.salesInvoice.findFirst({ where: { id: invoiceId, companyId: tenant } });
      if (!invoice) throw new NotFoundException("Sales invoice not found");
      if (invoice.status === "VOID" || invoice.status === "PAID") throw new ConflictException("This invoice cannot receive another payment");
      const amount = new Prisma.Decimal(body.amount), remaining = invoice.total.sub(invoice.paidAmount);
      if (!amount.greaterThan(0) || amount.greaterThan(remaining)) throw new BadRequestException(`Payment must be positive and no more than the remaining balance of ${remaining.toFixed(2)}`);
      const paymentId = randomUUID(), number = await this.nextNumber(tx, tenant, "PAY"), accounts = await this.ensureAccounts(tx, tenant);
      const method = body.method as SalesPaymentMethod;
      const cashAccount = method === "CASH" ? accounts.cash : accounts.bank;
      const journalReference = await this.nextNumber(tx, tenant, "JE");
      const journal = await tx.journalEntry.create({ data: { companyId: tenant, reference: journalReference, sourceType: "CUSTOMER_PAYMENT", sourceId: paymentId, description: `Customer payment ${number}`, lines: { create: [
        { accountId: cashAccount.id, description: `${method.replaceAll("_", " ")} received · ${number}`, debit: amount, credit: 0 },
        { accountId: accounts.receivable.id, description: `Accounts receivable · ${invoice.number}`, debit: 0, credit: amount },
      ] } } });
      const payment = await tx.salesPayment.create({ data: { id: paymentId, companyId: tenant, invoiceId, journalEntryId: journal.id, number, method, amount, externalReference: body.externalReference?.trim() || null, notes: body.notes?.trim() || null } });
      const paidAmount = invoice.paidAmount.add(amount), status = paidAmount.equals(invoice.total) ? "PAID" : "PARTIALLY_PAID";
      await tx.salesInvoice.update({ where: { id: invoiceId }, data: { paidAmount, status } });
      await tx.auditLog.create({ data: { companyId: tenant, actorUserId, action: "sales.payment_received", entityType: "SalesPayment", entityId: payment.id, metadata: { number, invoiceNumber: invoice.number, amount: amount.toFixed(2), method } } });
      return { ...payment, invoice: { id: invoice.id, number: invoice.number, total: invoice.total, paidAmount, status } };
    });
  }

  private orderStatus(lines: Array<{ quantity: Prisma.Decimal; deliveredQuantity: Prisma.Decimal; invoicedQuantity: Prisma.Decimal }>) {
    if (lines.some((line) => line.invoicedQuantity.greaterThan(0))) return lines.every((line) => line.invoicedQuantity.equals(line.quantity)) ? "INVOICED" : "PARTIALLY_INVOICED";
    return lines.every((line) => line.deliveredQuantity.equals(line.quantity)) ? "DELIVERED" : lines.some((line) => line.deliveredQuantity.greaterThan(0)) ? "PARTIALLY_DELIVERED" : "OPEN";
  }

  private async ensureAccounts(tx: Tx, companyId: string) {
    const seeds = [
      { code: "1000", name: "Cash on Hand", type: "ASSET" as const },
      { code: "1010", name: "Operating Bank", type: "ASSET" as const },
      { code: "1100", name: "Trade Receivables", type: "ASSET" as const },
      { code: "2200", name: "Output Tax Payable", type: "LIABILITY" as const },
      { code: "4000", name: "Sales Revenue", type: "REVENUE" as const },
    ];
    const accounts = await Promise.all(seeds.map((seed) => tx.accountingAccount.upsert({ where: { companyId_code: { companyId, code: seed.code } }, update: {}, create: { companyId, ...seed, isSystem: true } })));
    return { cash: accounts[0]!, bank: accounts[1]!, receivable: accounts[2]!, tax: accounts[3]!, revenue: accounts[4]! };
  }

  private async nextNumber(tx: Tx, companyId: string, prefix: string) {
    const year = new Date().getUTCFullYear(), key = `${prefix}-${year}`;
    const rows = await tx.$queryRaw<{ last_value: number }[]>`INSERT INTO document_sequences (id, company_id, sequence_key, last_value, updated_at) VALUES (${randomUUID()}::uuid, ${companyId}::uuid, ${key}, 1, NOW()) ON CONFLICT (company_id, sequence_key) DO UPDATE SET last_value = document_sequences.last_value + 1, updated_at = NOW() RETURNING last_value`;
    return `${prefix}-${year}-${String(rows[0]!.last_value).padStart(5, "0")}`;
  }
}
