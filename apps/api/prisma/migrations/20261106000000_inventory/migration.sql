-- Tenant-scoped item catalog, warehouses, balances and append-only movements.
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

CREATE TABLE "inventory_items" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "sku" VARCHAR(60) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" VARCHAR(1000),
  "unit" VARCHAR(16) NOT NULL DEFAULT 'each',
  "unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reorder_point" DECIMAL(14,3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_items_company_id_sku_key" ON "inventory_items"("company_id", "sku");
CREATE UNIQUE INDEX "inventory_items_id_company_id_key" ON "inventory_items"("id", "company_id");
CREATE INDEX "inventory_items_company_id_name_idx" ON "inventory_items"("company_id", "name");
CREATE INDEX "inventory_items_company_id_is_active_idx" ON "inventory_items"("company_id", "is_active");

CREATE TABLE "warehouses" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "code" VARCHAR(24) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "location" VARCHAR(180),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "warehouses_company_id_code_key" ON "warehouses"("company_id", "code");
CREATE UNIQUE INDEX "warehouses_id_company_id_key" ON "warehouses"("id", "company_id");
CREATE INDEX "warehouses_company_id_is_active_idx" ON "warehouses"("company_id", "is_active");

CREATE TABLE "stock_balances" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "quantity" DECIMAL(16,3) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_balances_product_id_company_id_fkey" FOREIGN KEY ("product_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_balances_warehouse_id_company_id_fkey" FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_balances_quantity_nonnegative" CHECK ("quantity" >= 0)
);
CREATE UNIQUE INDEX "stock_balances_company_product_warehouse_key" ON "stock_balances"("company_id", "product_id", "warehouse_id");
CREATE INDEX "stock_balances_company_warehouse_idx" ON "stock_balances"("company_id", "warehouse_id");

CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(16,3) NOT NULL,
  "unit_cost" DECIMAL(14,2),
  "reference" VARCHAR(100),
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_product_id_company_id_fkey" FOREIGN KEY ("product_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_warehouse_id_company_id_fkey" FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_quantity_positive" CHECK ("quantity" > 0)
);
CREATE INDEX "inventory_movements_company_created_idx" ON "inventory_movements"("company_id", "created_at");
CREATE INDEX "inventory_movements_company_product_created_idx" ON "inventory_movements"("company_id", "product_id", "created_at");
CREATE INDEX "inventory_movements_company_warehouse_created_idx" ON "inventory_movements"("company_id", "warehouse_id", "created_at");

ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_items_tenant_isolation" ON "inventory_items"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_tenant_isolation" ON "warehouses"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "stock_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_balances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stock_balances_tenant_isolation" ON "stock_balances"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_movements_tenant_isolation" ON "inventory_movements"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "inventory_items", "warehouses", "stock_balances", "inventory_movements" TO nexus_app;
