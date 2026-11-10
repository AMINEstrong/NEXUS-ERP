import { describe, expect, it } from "@jest/globals";
import { resolveTrustProxy, validateEnv } from "./env.js";

const hardenedProduction = {
  NODE_ENV: "production",
  WEB_ORIGIN: "https://erp.example.ma",
  DATABASE_URL: "postgresql://nexus_app:6f1c7f5e9b2a4d8c@db:5432/nexus_erp?schema=public",
  COOKIE_SECURE: "true",
  EMAIL_PROVIDER: "smtp",
  EMAIL_FROM: "NEXUS ERP <no-reply@erp.example.ma>",
  SMTP_HOST: "smtp.erp.example.ma",
  SMTP_PORT: "587",
  SMTP_USER: "nexus-mailer",
  SMTP_PASSWORD: "not-a-real-secret",
};

describe("validateEnv", () => {
  it("accepts a hardened production configuration", () => {
    const env = validateEnv({ ...hardenedProduction });

    expect(env.NODE_ENV).toBe("production");
    expect(env.COOKIE_SECURE).toBe("true");
    expect(env.SESSION_COOKIE_NAME).toBe("nexus.sid");
    expect(env.TRUST_PROXY).toBe("false");
  });

  it("rejects production without secure cookies", () => {
    expect(() => validateEnv({ ...hardenedProduction, COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
  });

  it("rejects production without a secure web origin", () => {
    expect(() => validateEnv({ ...hardenedProduction, WEB_ORIGIN: "http://erp.example.ma" })).toThrow(/WEB_ORIGIN/);
  });

  it("rejects production credentials that still use development defaults", () => {
    expect(() =>
      validateEnv({ ...hardenedProduction, DATABASE_URL: "postgresql://nexus_app:nexus_app_dev_only@db:5432/nexus_erp" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("allows development defaults outside production", () => {
    const env = validateEnv({
      NODE_ENV: "development",
      WEB_ORIGIN: "http://localhost:3001",
      DATABASE_URL: "postgresql://nexus_app:nexus_app_dev_only@localhost:5432/nexus_erp?schema=public",
      COOKIE_SECURE: "false",
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.COOKIE_SECURE).toBe("false");
  });

  it("rejects malformed cookie names", () => {
    expect(() => validateEnv({ ...hardenedProduction, SESSION_COOKIE_NAME: "nexus sid; Path=/" })).toThrow(/SESSION_COOKIE_NAME/);
  });

  it("defaults e-mail delivery to the non-delivering log transport outside production", () => {
    const env = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://nexus_app:nexus_app_dev_only@localhost:5432/nexus_erp?schema=public",
    });

    expect(env.EMAIL_PROVIDER).toBe("log");
    expect(env.EMAIL_FROM).toBe("NEXUS ERP <no-reply@nexus.local>");
    expect(env.EMAIL_TIMEOUT_MS).toBe(10_000);
    expect(env.EMAIL_MAX_ATTEMPTS).toBe(3);
  });

  it("refuses the log e-mail transport in production", () => {
    expect(() =>
      validateEnv({ ...hardenedProduction, EMAIL_PROVIDER: "log" }),
    ).toThrow(/EMAIL_PROVIDER/);
  });

  it("requires SMTP host and credentials for the SMTP transport", () => {
    expect(() => validateEnv({ ...hardenedProduction, SMTP_HOST: "" })).toThrow(/SMTP_HOST/);
    expect(() => validateEnv({ ...hardenedProduction, SMTP_USER: "" })).toThrow(/SMTP_USER/);
    expect(() => validateEnv({ ...hardenedProduction, SMTP_PASSWORD: "" })).toThrow(/SMTP_USER/);
  });

  it("requires an API key for hosted e-mail providers", () => {
    expect(() =>
      validateEnv({ ...hardenedProduction, EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "short" }),
    ).toThrow(/EMAIL_API_KEY/);
    expect(() =>
      validateEnv({ ...hardenedProduction, EMAIL_PROVIDER: "sendgrid", EMAIL_API_KEY: "" }),
    ).toThrow(/EMAIL_API_KEY/);
  });

  it("accepts a hosted provider with an API key", () => {
    const env = validateEnv({
      ...hardenedProduction,
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_0123456789abcdef",
    });

    expect(env.EMAIL_PROVIDER).toBe("resend");
    expect(env.SMTP_HOST).toBe("smtp.erp.example.ma");
  });

  it("refuses a .local sender domain in production", () => {
    expect(() =>
      validateEnv({ ...hardenedProduction, EMAIL_FROM: "NEXUS ERP <no-reply@nexus.local>" }),
    ).toThrow(/EMAIL_FROM/);
  });

  it("rejects malformed sender and reply-to addresses", () => {
    expect(() => validateEnv({ ...hardenedProduction, EMAIL_FROM: "not-an-address" })).toThrow(/EMAIL_FROM/);
    expect(() => validateEnv({ ...hardenedProduction, EMAIL_REPLY_TO: "support[at]example" })).toThrow(/EMAIL_REPLY_TO/);
  });

  it("rejects an unsafe e-mail timeout or retry count", () => {
    expect(() => validateEnv({ ...hardenedProduction, EMAIL_TIMEOUT_MS: "10" })).toThrow(/EMAIL_TIMEOUT_MS/);
    expect(() => validateEnv({ ...hardenedProduction, EMAIL_MAX_ATTEMPTS: "9" })).toThrow(/EMAIL_MAX_ATTEMPTS/);
  });
});

describe("resolveTrustProxy", () => {
  it("disables proxy trust by default", () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy("false")).toBe(false);
    expect(resolveTrustProxy("0")).toBe(false);
  });

  it("accepts a hop count", () => {
    expect(resolveTrustProxy("1")).toBe(1);
  });

  it("accepts an explicit proxy list", () => {
    expect(resolveTrustProxy("loopback, 10.0.0.0/8")).toEqual(["loopback", "10.0.0.0/8"]);
  });
});
