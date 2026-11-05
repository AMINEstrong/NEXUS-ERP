-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "email_verified_at" TIMESTAMPTZ(6),
  "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
  "mfa_secret" VARCHAR(255),
  "password_changed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "companies" (
  "id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "legal_name" VARCHAR(240),
  "country_code" CHAR(2) NOT NULL DEFAULT 'MA',
  "currency_code" CHAR(3) NOT NULL DEFAULT 'MAD',
  "default_locale" VARCHAR(12) NOT NULL DEFAULT 'fr-MA',
  "time_zone" VARCHAR(80) NOT NULL DEFAULT 'Africa/Casablanca',
  "fiscal_year_start_month" SMALLINT NOT NULL DEFAULT 1,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
  "invited_at" TIMESTAMPTZ(6),
  "joined_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
  "id" UUID NOT NULL,
  "key" VARCHAR(140) NOT NULL,
  "module" VARCHAR(80) NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "description" VARCHAR(240),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plans" (
  "id" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500),
  "trial_days" SMALLINT NOT NULL DEFAULT 0,
  "usage_limits" JSONB NOT NULL DEFAULT '{}',
  "modules" JSONB NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "billing_period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trial_ends_at" TIMESTAMPTZ(6),
  "current_period_start" TIMESTAMPTZ(6),
  "current_period_end" TIMESTAMPTZ(6),
  "canceled_at" TIMESTAMPTZ(6),
  "provider" VARCHAR(40),
  "provider_reference" VARCHAR(180),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(100) NOT NULL,
  "entity_type" VARCHAR(100) NOT NULL,
  "entity_id" VARCHAR(100),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
CREATE INDEX "companies_country_code_idx" ON "companies"("country_code");
CREATE UNIQUE INDEX "memberships_company_id_user_id_key" ON "memberships"("company_id", "user_id");
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");
CREATE INDEX "memberships_company_id_status_idx" ON "memberships"("company_id", "status");
CREATE UNIQUE INDEX "roles_company_id_key_key" ON "roles"("company_id", "key");
CREATE UNIQUE INDEX "roles_id_company_id_key" ON "roles"("id", "company_id");
CREATE INDEX "roles_company_id_idx" ON "roles"("company_id");
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");
CREATE INDEX "permissions_module_action_idx" ON "permissions"("module", "action");
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");
CREATE INDEX "role_permissions_company_id_idx" ON "role_permissions"("company_id");
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "subscriptions_company_id_status_idx" ON "subscriptions"("company_id", "status");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_company_id_fkey" FOREIGN KEY ("role_id", "company_id") REFERENCES "roles"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_company_id_fkey" FOREIGN KEY ("role_id", "company_id") REFERENCES "roles"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant policies use context set only by the API after it validates the active membership.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "companies_tenant_isolation" ON "companies"
  USING ("id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "memberships_user_or_tenant_scope" ON "memberships"
  USING (
    "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR "company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "roles_tenant_isolation" ON "roles"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_tenant_isolation" ON "role_permissions"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_tenant_isolation" ON "subscriptions"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
  USING ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO nexus_app;
