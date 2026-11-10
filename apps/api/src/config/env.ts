import { z } from "zod";

const BooleanFlag = z.enum(["true", "false"]);

/**
 * Known development credentials that must never reach a production deployment.
 * The API refuses to start when one of these markers is found in DATABASE_URL
 * while NODE_ENV=production.
 */
const DEV_SECRET_PATTERN = /(?:dev_only|changeme|change_me|password123|secret123)/i;
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailAddressOf(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function isEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(emailAddressOf(value));
}

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
    WEB_ORIGIN: z.string().url().default("http://localhost:3001"),
    DATABASE_URL: z.string().min(1),
    SESSION_COOKIE_NAME: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, "SESSION_COOKIE_NAME may only contain letters, digits, dots, underscores and dashes")
      .default("nexus.sid"),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
    COOKIE_SECURE: BooleanFlag.default("false"),
    /**
     * Express "trust proxy" value. Accepts false/0, true, a hop count, or a
     * comma-separated list of IPs/subnets (for example "loopback" or
     * "10.0.0.0/8"). Leave as false when the API is directly exposed.
     */
    TRUST_PROXY: z.string().trim().max(255).default("false"),
    /**
     * Transactional email. "log" is a development-only transport that writes
     * delivery metadata without sending anything. Production requires "smtp"
     * with credentials, or "resend"/"sendgrid" with EMAIL_API_KEY.
     */
    EMAIL_PROVIDER: z.enum(["log", "smtp", "resend", "sendgrid"]).default("log"),
    EMAIL_FROM: z.string().trim().min(3).max(320).default("NEXUS ERP <no-reply@nexus.local>"),
    EMAIL_REPLY_TO: z.string().trim().max(320).default(""),
    EMAIL_API_KEY: z.string().default(""),
    EMAIL_API_URL: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? undefined : value),
      z.string().url().optional(),
    ),
    EMAIL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    SMTP_HOST: z.string().trim().max(255).default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: BooleanFlag.default("false"),
    SMTP_REQUIRE_TLS: BooleanFlag.default("true"),
    SMTP_USER: z.string().trim().max(320).default(""),
    SMTP_PASSWORD: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    if (!isEmailAddress(env.EMAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "EMAIL_FROM must contain a valid e-mail address (for example \"NEXUS ERP <no-reply@example.com>\").",
      });
    }

    if (env.EMAIL_REPLY_TO && !isEmailAddress(env.EMAIL_REPLY_TO)) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_REPLY_TO"],
        message: "EMAIL_REPLY_TO must be a valid e-mail address or be left empty.",
      });
    }

    if (env.EMAIL_PROVIDER === "smtp" && !env.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST must be set when EMAIL_PROVIDER=smtp.",
      });
    }

    if (env.EMAIL_PROVIDER !== "log" && env.EMAIL_PROVIDER !== "smtp" && env.EMAIL_API_KEY.trim().length < 8) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_API_KEY"],
        message: "EMAIL_API_KEY must be set when EMAIL_PROVIDER is resend or sendgrid.",
      });
    }

    if (env.NODE_ENV !== "production") return;

    if (env.COOKIE_SECURE !== "true") {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: 'COOKIE_SECURE must be "true" when NODE_ENV=production. Session cookies must not travel over plain HTTP.',
      });
    }

    if (!/^https:\/\//i.test(env.WEB_ORIGIN)) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "WEB_ORIGIN must use https:// when NODE_ENV=production.",
      });
    }

    if (DEV_SECRET_PATTERN.test(env.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message:
          "DATABASE_URL still references a known development password. Set a unique production secret instead of a *_dev_only value.",
      });
    }

    if (env.EMAIL_PROVIDER === "log") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message:
          'EMAIL_PROVIDER cannot be "log" when NODE_ENV=production: verification and password-reset e-mails would never be delivered.',
      });
    }

    if (env.EMAIL_PROVIDER === "smtp" && (!env.SMTP_USER || !env.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "SMTP_USER and SMTP_PASSWORD must be set for a production SMTP relay.",
      });
    }

    if (emailAddressOf(env.EMAIL_FROM).toLowerCase().endsWith(".local")) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "EMAIL_FROM must use a real, deliverable domain in production (the .local development default is not allowed).",
      });
    }
  });


export type AppEnv = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("\n  - ");
    throw new Error(`Invalid NEXUS environment configuration. The API will not start:\n  - ${details}`);
  }
  return result.data;
}

/**
 * Translate the TRUST_PROXY environment value into an Express-compatible
 * setting. Invalid or ambiguous values are treated as explicit IP/subnet lists
 * so Express validates them at startup instead of silently trusting everyone.
 */
export function resolveTrustProxy(value: string | undefined): boolean | number | string[] {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw || raw === "false" || raw === "0") return false;
  if (raw === "true") return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
