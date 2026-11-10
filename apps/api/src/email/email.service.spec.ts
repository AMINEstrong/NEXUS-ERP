import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jest } from "@jest/globals";
import { EmailService, maskEmail } from "./email.service.js";
import type { DeliveryReceipt, EmailTransport, OutboundEmail } from "./email.transports.js";
import { EmailDeliveryError } from "./email.transports.js";

const token = "sensitive-verification-token-value";
const url = `https://erp.example.ma/verify-email?token=${token}`;

function fakeTransport(send: EmailTransport["send"]): EmailTransport {
  return { name: "fake", send };
}

function configWith(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, fallback: unknown) => (key in overrides ? overrides[key] : fallback)),
  } as unknown as ConfigService;
}

function captureLogs() {
  const entries: string[] = [];
  const record = (...args: unknown[]) => entries.push(args.map(String).join(" "));
  jest.spyOn(Logger.prototype, "log").mockImplementation(record);
  jest.spyOn(Logger.prototype, "warn").mockImplementation(record);
  jest.spyOn(Logger.prototype, "error").mockImplementation(record);
  jest.spyOn(Logger.prototype, "debug").mockImplementation(record);
  jest.spyOn(Logger.prototype, "verbose").mockImplementation(record);
  return entries;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("maskEmail", () => {
  it("masks the local part but keeps the domain", () => {
    expect(maskEmail("owner@example.test")).toBe("o***@example.test");
    expect(maskEmail("a@example.test")).toBe("a***@example.test");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});

describe("EmailService", () => {
  it("delivers the rendered message with the configured sender", async () => {
    const send = jest.fn<(...args: [OutboundEmail]) => Promise<DeliveryReceipt>>().mockResolvedValue({ messageId: "abc" });
    const service = new EmailService(configWith({ EMAIL_FROM: "NEXUS ERP <no-reply@erp.example.ma>", EMAIL_REPLY_TO: "help@erp.example.ma" }), fakeTransport(send));

    await service.send({ to: "owner@example.test", template: "email-verification", subject: "Hello", html: `<a href="${url}">${url}</a>`, text: url });

    expect(send).toHaveBeenCalledWith({
      to: "owner@example.test",
      from: "NEXUS ERP <no-reply@erp.example.ma>",
      replyTo: "help@erp.example.ma",
      subject: "Hello",
      html: `<a href="${url}">${url}</a>`,
      text: url,
    });
  });

  it("logs delivery metadata without tokens, URLs or full addresses", async () => {
    const entries = captureLogs();
    const send = jest.fn<(...args: [OutboundEmail]) => Promise<DeliveryReceipt>>().mockResolvedValue({ messageId: "abc" });
    const service = new EmailService(configWith(), fakeTransport(send));

    await service.send({ to: "owner@example.test", template: "password-reset", subject: "Reset", html: url, text: url });

    const log = entries.join("\n");
    expect(log).toContain("email delivered");
    expect(log).toContain("template=password-reset");
    expect(log).toContain("o***@example.test");
    expect(log).not.toContain(token);
    expect(log).not.toContain("https://erp.example.ma");
    expect(log).not.toContain("owner@example.test");
  });

  it("retries a transient provider failure and records the retry without leaking data", async () => {
    const entries = captureLogs();
    const send = jest
      .fn<(...args: [OutboundEmail]) => Promise<DeliveryReceipt>>()
      .mockRejectedValueOnce(new EmailDeliveryError("Network failure", "fake", true))
      .mockResolvedValueOnce({ messageId: "abc" });
    const service = new EmailService(configWith({ EMAIL_MAX_ATTEMPTS: 3 }), fakeTransport(send));

    await service.send({ to: "owner@example.test", template: "email-verification", subject: "Hello", html: url, text: url });

    expect(send).toHaveBeenCalledTimes(2);
    const log = entries.join("\n");
    expect(log).toContain("email delivery retry");
    expect(log).toContain("attempt=1");
    expect(log).toContain("email delivered");
    expect(log).not.toContain(token);
    expect(log).not.toContain("https://erp.example.ma");
  });

  it("throws after exhausting retries on a retryable failure", async () => {
    const entries = captureLogs();
    const send = jest
      .fn<(...args: [OutboundEmail]) => Promise<DeliveryReceipt>>()
      .mockRejectedValue(new EmailDeliveryError("Provider responded with HTTP 503", "fake", true, 503));
    const service = new EmailService(configWith({ EMAIL_MAX_ATTEMPTS: 2 }), fakeTransport(send));

    await expect(
      service.send({ to: "owner@example.test", template: "email-verification", subject: "Hello", html: url, text: url }),
    ).rejects.toBeInstanceOf(EmailDeliveryError);

    expect(send).toHaveBeenCalledTimes(2);
    const log = entries.join("\n");
    expect(log).toContain("email delivery failed");
    expect(log).toContain("status=503");
    expect(log).not.toContain(token);
  });

  it("does not retry a permanent provider rejection", async () => {
    const entries = captureLogs();
    const send = jest
      .fn<(...args: [OutboundEmail]) => Promise<DeliveryReceipt>>()
      .mockRejectedValue(new EmailDeliveryError("Provider responded with HTTP 422", "fake", false, 422));
    const service = new EmailService(configWith({ EMAIL_MAX_ATTEMPTS: 3 }), fakeTransport(send));

    await expect(
      service.send({ to: "owner@example.test", template: "email-verification", subject: "Hello", html: url, text: url }),
    ).rejects.toThrow("HTTP 422");

    expect(send).toHaveBeenCalledTimes(1);
    expect(entries.join("\n")).toContain("attempts=1");
  });

  it("wraps an unexpected transport error without exposing its message", async () => {
    const entries = captureLogs();
    const send = jest
      .fn<(...args: [OutboundEmail]) => Promise<DeliveryReceipt>>()
      .mockRejectedValue(new Error(`socket blew up while sending to owner@example.test with ${token}`));
    const service = new EmailService(configWith(), fakeTransport(send));

    await expect(
      service.send({ to: "owner@example.test", template: "email-verification", subject: "Hello", html: url, text: url }),
    ).rejects.toThrow(/Unexpected e-mail delivery failure/);

    const log = entries.join("\n");
    expect(log).toContain("email delivery failed");
    expect(log).not.toContain(token);
    expect(log).not.toContain("owner@example.test");
  });
});
