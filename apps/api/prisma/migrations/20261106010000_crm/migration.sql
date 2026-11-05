CREATE TYPE "CrmCustomerType" AS ENUM ('CUSTOMER', 'PROSPECT');
CREATE TYPE "CrmOpportunityStage" AS ENUM ('QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'TASK', 'NOTE');

CREATE TABLE "crm_customers" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "type" "CrmCustomerType" NOT NULL DEFAULT 'PROSPECT',
  "contact_name" VARCHAR(160),
  "email" VARCHAR(320),
  "phone" VARCHAR(40),
  "website" VARCHAR(240),
  "city" VARCHAR(120),
  "country_code" CHAR(2),
  "notes" VARCHAR(2000),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "crm_customers_company_id_code_key" ON "crm_customers"("company_id", "code");
CREATE UNIQUE INDEX "crm_customers_id_company_id_key" ON "crm_customers"("id", "company_id");
CREATE INDEX "crm_customers_company_name_idx" ON "crm_customers"("company_id", "name");
CREATE INDEX "crm_customers_company_type_active_idx" ON "crm_customers"("company_id", "type", "is_active");

CREATE TABLE "crm_opportunities" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "reference" VARCHAR(40) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "stage" "CrmOpportunityStage" NOT NULL DEFAULT 'QUALIFICATION',
  "estimated_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "probability" SMALLINT NOT NULL DEFAULT 10,
  "expected_close_at" DATE,
  "notes" VARCHAR(2000),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crm_opportunities_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "crm_customers"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "crm_opportunities_value_nonnegative" CHECK ("estimated_value" >= 0),
  CONSTRAINT "crm_opportunities_probability_range" CHECK ("probability" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "crm_opportunities_company_reference_key" ON "crm_opportunities"("company_id", "reference");
CREATE UNIQUE INDEX "crm_opportunities_id_company_id_key" ON "crm_opportunities"("id", "company_id");
CREATE INDEX "crm_opportunities_company_stage_active_idx" ON "crm_opportunities"("company_id", "stage", "is_active");
CREATE INDEX "crm_opportunities_company_close_date_idx" ON "crm_opportunities"("company_id", "expected_close_at");

CREATE TABLE "crm_activities" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "customer_id" UUID,
  "opportunity_id" UUID,
  "type" "CrmActivityType" NOT NULL,
  "subject" VARCHAR(180) NOT NULL,
  "body" VARCHAR(2000),
  "due_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crm_activities_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "crm_customers"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crm_activities_opportunity_id_company_id_fkey" FOREIGN KEY ("opportunity_id", "company_id") REFERENCES "crm_opportunities"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crm_activities_link_check" CHECK ("customer_id" IS NOT NULL OR "opportunity_id" IS NOT NULL)
);
CREATE INDEX "crm_activities_company_due_complete_idx" ON "crm_activities"("company_id", "due_at", "completed_at");
CREATE INDEX "crm_activities_company_customer_created_idx" ON "crm_activities"("company_id", "customer_id", "created_at");
CREATE INDEX "crm_activities_company_opportunity_idx" ON "crm_activities"("company_id", "opportunity_id");

ALTER TABLE "crm_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_customers_tenant_isolation" ON "crm_customers"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
ALTER TABLE "crm_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_opportunities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_opportunities_tenant_isolation" ON "crm_opportunities"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities_tenant_isolation" ON "crm_activities"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "crm_customers", "crm_opportunities", "crm_activities" TO nexus_app;
