import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url:
      process.env.MIGRATION_DATABASE_URL ??
      "postgresql://nexus_migrator:nexus_migrator_dev_only@localhost:5432/nexus_erp?schema=public",
  },
});
