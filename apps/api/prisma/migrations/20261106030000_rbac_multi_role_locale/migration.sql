-- Multi-role membership, effective permission union, and per-user language.
-- Existing single-role memberships stay valid: membership.role_id remains the
-- primary role and is backfilled into membership_roles so every member starts
-- with exactly the access they had before this migration.

ALTER TABLE "users" ADD COLUMN "locale" VARCHAR(12) NOT NULL DEFAULT 'en';

-- Composite unique key required by the tenant-safe composite foreign keys below.
CREATE UNIQUE INDEX "memberships_id_company_id_key" ON "memberships"("id", "company_id");

CREATE TABLE "membership_roles" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "assigned_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_roles_membership_id_role_id_key" ON "membership_roles"("membership_id", "role_id");
CREATE INDEX "membership_roles_company_id_idx" ON "membership_roles"("company_id");
CREATE INDEX "membership_roles_role_id_idx" ON "membership_roles"("role_id");

ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_company_id_fkey"
  FOREIGN KEY ("membership_id", "company_id") REFERENCES "memberships"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_company_id_fkey"
  FOREIGN KEY ("role_id", "company_id") REFERENCES "roles"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill every existing membership's primary role as its first linked role.
INSERT INTO "membership_roles" ("id", "company_id", "membership_id", "role_id", "created_at")
SELECT gen_random_uuid(), "company_id", "id", "role_id", "created_at" FROM "memberships"
ON CONFLICT ("membership_id", "role_id") DO NOTHING;

ALTER TABLE "membership_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "membership_roles_tenant_isolation" ON "membership_roles"
  USING (
    "company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid
    OR "membership_id" IN (
      SELECT "id" FROM "memberships"
      WHERE "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK ("company_id" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_roles" TO nexus_app;
