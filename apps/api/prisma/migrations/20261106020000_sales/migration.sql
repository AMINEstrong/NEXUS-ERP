-- CreateEnum
CREATE TYPE "SalesQuotationStatus" AS ENUM ('DRAFT', 'SENT', 'CONVERTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_DELIVERED', 'DELIVERED', 'PARTIALLY_INVOICED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "SalesPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountingAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('SALES_INVOICE', 'CUSTOMER_PAYMENT');

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sequence_key" VARCHAR(40) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "AccountingAccountType" NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounting_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "source_type" "JournalSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "description" VARCHAR(240),
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "opportunity_id" UUID,
    "number" VARCHAR(40) NOT NULL,
    "status" "SalesQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currency_code" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valid_until" DATE,
    "notes" VARCHAR(2000),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotation_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "line_number" SMALLINT NOT NULL,
    "product_id" UUID NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sales_quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'OPEN',
    "currency_code" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "quotation_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_number" SMALLINT NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "delivered_quantity" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "invoiced_quantity" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_deliveries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_delivery_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,

    CONSTRAINT "sales_delivery_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "currency_code" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_total" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" DATE NOT NULL,
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_number" SMALLINT NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "method" "SalesPaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "external_reference" VARCHAR(120),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(1000),

    CONSTRAINT "sales_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_company_id_sequence_key_key" ON "document_sequences"("company_id", "sequence_key");

-- CreateIndex
CREATE INDEX "accounting_accounts_company_id_type_is_active_idx" ON "accounting_accounts"("company_id", "type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_accounts_company_id_code_key" ON "accounting_accounts"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_accounts_id_company_id_key" ON "accounting_accounts"("id", "company_id");

-- CreateIndex
CREATE INDEX "journal_entries_company_id_posted_at_idx" ON "journal_entries"("company_id", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_company_id_reference_key" ON "journal_entries"("company_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_company_id_source_type_source_id_key" ON "journal_entries"("company_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_id_company_id_key" ON "journal_entries"("id", "company_id");

-- CreateIndex
CREATE INDEX "journal_lines_company_id_journal_entry_id_idx" ON "journal_lines"("company_id", "journal_entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_company_id_account_id_idx" ON "journal_lines"("company_id", "account_id");

-- CreateIndex
CREATE INDEX "sales_quotations_company_id_status_created_at_idx" ON "sales_quotations"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "sales_quotations_company_id_customer_id_created_at_idx" ON "sales_quotations"("company_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotations_company_id_number_key" ON "sales_quotations"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotations_id_company_id_key" ON "sales_quotations"("id", "company_id");

-- CreateIndex
CREATE INDEX "sales_quotation_lines_company_id_product_id_idx" ON "sales_quotation_lines"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotation_lines_id_company_id_key" ON "sales_quotation_lines"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotation_lines_quotation_id_line_number_key" ON "sales_quotation_lines"("quotation_id", "line_number");

-- CreateIndex
CREATE INDEX "sales_orders_company_id_status_created_at_idx" ON "sales_orders"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "sales_orders_company_id_customer_id_created_at_idx" ON "sales_orders"("company_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_quotation_id_company_id_key" ON "sales_orders"("quotation_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_company_id_number_key" ON "sales_orders"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_id_company_id_key" ON "sales_orders"("id", "company_id");

-- CreateIndex
CREATE INDEX "sales_order_lines_company_id_product_id_idx" ON "sales_order_lines"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_lines_id_company_id_key" ON "sales_order_lines"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_lines_order_id_line_number_key" ON "sales_order_lines"("order_id", "line_number");

-- CreateIndex
CREATE INDEX "sales_deliveries_company_id_delivered_at_idx" ON "sales_deliveries"("company_id", "delivered_at");

-- CreateIndex
CREATE INDEX "sales_deliveries_company_id_order_id_idx" ON "sales_deliveries"("company_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_deliveries_company_id_number_key" ON "sales_deliveries"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_deliveries_id_company_id_key" ON "sales_deliveries"("id", "company_id");

-- CreateIndex
CREATE INDEX "sales_delivery_lines_company_id_delivery_id_idx" ON "sales_delivery_lines"("company_id", "delivery_id");

-- CreateIndex
CREATE INDEX "sales_delivery_lines_company_id_order_line_id_idx" ON "sales_delivery_lines"("company_id", "order_line_id");

-- CreateIndex
CREATE INDEX "sales_invoices_company_id_status_due_at_idx" ON "sales_invoices"("company_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "sales_invoices_company_id_customer_id_issued_at_idx" ON "sales_invoices"("company_id", "customer_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_company_id_number_key" ON "sales_invoices"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_journal_entry_id_company_id_key" ON "sales_invoices"("journal_entry_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_id_company_id_key" ON "sales_invoices"("id", "company_id");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_company_id_product_id_idx" ON "sales_invoice_lines"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_lines_invoice_id_line_number_key" ON "sales_invoice_lines"("invoice_id", "line_number");

-- CreateIndex
CREATE INDEX "sales_payments_company_id_received_at_idx" ON "sales_payments"("company_id", "received_at");

-- CreateIndex
CREATE INDEX "sales_payments_company_id_invoice_id_idx" ON "sales_payments"("company_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_payments_company_id_number_key" ON "sales_payments"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_payments_journal_entry_id_company_id_key" ON "sales_payments"("journal_entry_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_payments_id_company_id_key" ON "sales_payments"("id", "company_id");

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_company_id_fkey" FOREIGN KEY ("journal_entry_id", "company_id") REFERENCES "journal_entries"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_company_id_fkey" FOREIGN KEY ("account_id", "company_id") REFERENCES "accounting_accounts"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "crm_customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_opportunity_id_company_id_fkey" FOREIGN KEY ("opportunity_id", "company_id") REFERENCES "crm_opportunities"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_quotation_id_company_id_fkey" FOREIGN KEY ("quotation_id", "company_id") REFERENCES "sales_quotations"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_product_id_company_id_fkey" FOREIGN KEY ("product_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_company_id_fkey" FOREIGN KEY ("quotation_id", "company_id") REFERENCES "sales_quotations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "crm_customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_company_id_fkey" FOREIGN KEY ("order_id", "company_id") REFERENCES "sales_orders"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_quotation_line_id_company_id_fkey" FOREIGN KEY ("quotation_line_id", "company_id") REFERENCES "sales_quotation_lines"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_id_company_id_fkey" FOREIGN KEY ("product_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_order_id_company_id_fkey" FOREIGN KEY ("order_id", "company_id") REFERENCES "sales_orders"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_warehouse_id_company_id_fkey" FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_delivery_id_company_id_fkey" FOREIGN KEY ("delivery_id", "company_id") REFERENCES "sales_deliveries"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_order_line_id_company_id_fkey" FOREIGN KEY ("order_line_id", "company_id") REFERENCES "sales_order_lines"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_product_id_company_id_fkey" FOREIGN KEY ("product_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_order_id_company_id_fkey" FOREIGN KEY ("order_id", "company_id") REFERENCES "sales_orders"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "crm_customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_journal_entry_id_company_id_fkey" FOREIGN KEY ("journal_entry_id", "company_id") REFERENCES "journal_entries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoice_id_company_id_fkey" FOREIGN KEY ("invoice_id", "company_id") REFERENCES "sales_invoices"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_order_line_id_company_id_fkey" FOREIGN KEY ("order_line_id", "company_id") REFERENCES "sales_order_lines"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_product_id_company_id_fkey" FOREIGN KEY ("product_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_invoice_id_company_id_fkey" FOREIGN KEY ("invoice_id", "company_id") REFERENCES "sales_invoices"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_journal_entry_id_company_id_fkey" FOREIGN KEY ("journal_entry_id", "company_id") REFERENCES "journal_entries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_last_value_check" CHECK ("last_value" >= 0);
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_code_nonempty_check" CHECK (length(trim("code")) > 0);
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_balanced_side_check" CHECK ("debit" >= 0 AND "credit" >= 0 AND (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)));
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_amounts_check" CHECK ("subtotal" >= 0 AND "tax_total" >= 0 AND "total" = "subtotal" + "tax_total");
ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_amounts_check" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "tax_rate" BETWEEN 0 AND 100 AND "subtotal" >= 0 AND "tax_amount" >= 0 AND "total" = "subtotal" + "tax_amount");
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_amounts_check" CHECK ("subtotal" >= 0 AND "tax_total" >= 0 AND "total" = "subtotal" + "tax_total");
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_quantities_check" CHECK ("quantity" > 0 AND "delivered_quantity" >= 0 AND "delivered_quantity" <= "quantity" AND "invoiced_quantity" >= 0 AND "invoiced_quantity" <= "delivered_quantity");
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_amounts_check" CHECK ("unit_price" >= 0 AND "tax_rate" BETWEEN 0 AND 100 AND "subtotal" >= 0 AND "tax_amount" >= 0 AND "total" = "subtotal" + "tax_amount");
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_amounts_check" CHECK ("subtotal" >= 0 AND "tax_total" >= 0 AND "total" = "subtotal" + "tax_total" AND "paid_amount" >= 0 AND "paid_amount" <= "total");
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_amounts_check" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "tax_rate" BETWEEN 0 AND 100 AND "subtotal" >= 0 AND "tax_amount" >= 0 AND "total" = "subtotal" + "tax_amount");
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_amount_check" CHECK ("amount" > 0);

DO $$
DECLARE tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'document_sequences', 'accounting_accounts', 'journal_entries', 'journal_lines',
    'sales_quotations', 'sales_quotation_lines', 'sales_orders', 'sales_order_lines',
    'sales_deliveries', 'sales_delivery_lines', 'sales_invoices', 'sales_invoice_lines', 'sales_payments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid) WITH CHECK (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid)',
      tenant_table || '_tenant_policy', tenant_table
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "document_sequences", "accounting_accounts", "journal_entries", "journal_lines",
  "sales_quotations", "sales_quotation_lines", "sales_orders", "sales_order_lines",
  "sales_deliveries", "sales_delivery_lines", "sales_invoices", "sales_invoice_lines", "sales_payments"
TO nexus_app;

