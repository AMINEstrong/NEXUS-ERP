import { ConfigService } from "@nestjs/config";
import { jest } from "@jest/globals";
import nodemailer from "nodemailer";
import {
  EmailDeliveryError,
  LogEmailTransport,
  ResendEmailTransport,
  SendGridEmailTransport,
  SmtpEmailTransport,
  type OutboundEmail,
} from "./email.transports.js";

const message: OutboundEmail = {
  to: "owner@example.test",
  from: "NEXUS ERP <no-reply@erp.example.ma>",
  replyTo: "support@erp.example.ma",
  subject: "Subject",
  html: "<p>Body</p>",
  text: "Body",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("LogEmailTransport", () => {
  it("returns a synthetic message id without any network call", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const receipt = await new LogEmailTransport().send();

    expect(receipt.messageId).toMatch(/^log-/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ResendEmailTransport", () => {
  const transport = () => new ResendEmailTransport({ apiKey: "re_secret", baseUrl: "https://api.resend.test/", timeoutMs: 1_000 });

  it("posts the rendered message and returns the provider id", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));

    const receipt = await transport().send(message);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(url).toBe("https://api.resend.test/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_secret");
    expect(body).toMatchObject({
      from: message.from,
      to: [message.to],
      subject: "Subject",
      reply_to: message.replyTo,
      html: message.html,
      text: message.text,
    });
    expect(receipt.messageId).toBe("email_123");
  });

  it("classifies 5xx and 429 responses as retryable", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream down", { status: 503 }));

    await expect(transport().send(message)).rejects.toMatchObject({
      provider: "resend",
      retryable: true,
      statusCode: 503,
    });
  });

  it("classifies 4xx responses as permanent failures", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad request", { status: 422 }));

    await expect(transport().send(message)).rejects.toMatchObject({
      provider: "resend",
      retryable: false,
      statusCode: 422,
    });
  });

  it("reports a timeout as a retryable delivery error", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    jest.spyOn(globalThis, "fetch").mockRejectedValue(timeout);

    await expect(transport().send(message)).rejects.toMatchObject({
      provider: "resend",
      retryable: true,
    });
    await expect(transport().send(message)).rejects.toThrow(/timeout/);
  });

  it("never reports delivery when the provider rejects", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    await expect(transport().send(message)).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});

describe("SendGridEmailTransport", () => {
  it("posts a personalisation with text and HTML content", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 202, headers: { "x-message-id": "sg_123" } }));

    const receipt = await new SendGridEmailTransport({
      apiKey: "sg_secret",
      baseUrl: "https://api.sendgrid.test",
      timeoutMs: 1_000,
    }).send(message);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(url).toBe("https://api.sendgrid.test/v3/mail/send");
    expect(body).toMatchObject({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: "no-reply@erp.example.ma", name: "NEXUS ERP" },
      subject: "Subject",
      content: [
        { type: "text/plain", value: message.text },
        { type: "text/html", value: message.html },
      ],
    });
    expect(receipt.messageId).toBe("sg_123");
  });
});

describe("SmtpEmailTransport", () => {
  it("sends through nodemailer and returns the provider message id", async () => {
    const sendMail = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ messageId: "<smtp@id>" });
    jest.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as never);

    const transport = new SmtpEmailTransport({
      host: "smtp.erp.example.ma",
      port: 587,
      secure: false,
      requireTls: true,
      user: "mailer",
      password: "secret",
      timeoutMs: 1_000,
    });

    await expect(transport.send(message)).resolves.toEqual({ messageId: "<smtp@id>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: message.from,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    );
  });

  it("reduces a connection failure to a retryable status code without leaking the server response", async () => {
    const failure = Object.assign(new Error("connect ETIMEDOUT 10.0.0.1:587 owner@example.test"), { code: "ETIMEDOUT" });
    const sendMail = jest.fn<(...args: any[]) => Promise<any>>().mockRejectedValue(failure);
    jest.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as never);

    const transport = new SmtpEmailTransport({
      host: "smtp.erp.example.ma",
      port: 587,
      secure: false,
      requireTls: true,
      timeoutMs: 1_000,
    });

    await expect(transport.send(message)).rejects.toMatchObject({ provider: "smtp", retryable: true });
    await expect(transport.send(message)).rejects.not.toThrow(/owner@example\.test/);
  });

  it("treats an authentication rejection as permanent", async () => {
    const failure = Object.assign(new Error("Invalid login: 535 authentication failed"), { code: "EAUTH" });
    jest.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: jest.fn<(...args: any[]) => Promise<any>>().mockRejectedValue(failure),
    } as never);

    const transport = new SmtpEmailTransport({
      host: "smtp.erp.example.ma",
      port: 587,
      secure: false,
      requireTls: true,
      timeoutMs: 1_000,
    });

    await expect(transport.send(message)).rejects.toMatchObject({ provider: "smtp", retryable: false });
  });
});

describe("createTransport", () => {
  it("fails fast for an unsupported provider", async () => {
    const { createTransport } = await import("./email.service.js");
    const config = { get: jest.fn((key: string, fallback: unknown) => (key === "EMAIL_PROVIDER" ? "pigeon" : fallback)) };

    expect(() => createTransport(config as unknown as ConfigService)).toThrow(/Unsupported EMAIL_PROVIDER/);
  });
});
