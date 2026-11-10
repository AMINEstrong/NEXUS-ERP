import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

export type OutboundEmail = {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
};

export type DeliveryReceipt = {
  messageId: string | null;
};

export interface EmailTransport {
  readonly name: string;
  send(message: OutboundEmail): Promise<DeliveryReceipt>;
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

/**
 * Development transport. It performs no network call and returns a synthetic
 * message id. Delivery metadata is logged by EmailService, never the body.
 */
export class LogEmailTransport implements EmailTransport {
  readonly name = "log";

  async send(): Promise<DeliveryReceipt> {
    return { messageId: `log-${randomUUID()}` };
  }
}

type HttpTransportOptions = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
};

async function postJson(url: string, init: RequestInit, provider: string, timeoutMs: number): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? " (timeout)" : "";
    throw new EmailDeliveryError(`Network failure while contacting ${provider}${reason}`, provider, true);
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new EmailDeliveryError(`${provider} responded with HTTP ${response.status}`, provider, retryable, response.status);
  }

  return response;
}

export class ResendEmailTransport implements EmailTransport {
  readonly name = "resend";

  constructor(private readonly options: HttpTransportOptions) {}

  async send(message: OutboundEmail): Promise<DeliveryReceipt> {
    const response = await postJson(
      `${this.options.baseUrl.replace(/\/+$/, "")}/emails`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      },
      this.name,
      this.options.timeoutMs,
    );

    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return { messageId: payload.id ?? null };
  }
}

export function parseAddress(value: string): { email: string; name?: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const email = (match?.[2] ?? value).trim();
  const name = match?.[1]?.replace(/^"|"$/g, "").trim();
  return name ? { email, name } : { email };
}

export class SendGridEmailTransport implements EmailTransport {
  readonly name = "sendgrid";

  constructor(private readonly options: HttpTransportOptions) {}

  async send(message: OutboundEmail): Promise<DeliveryReceipt> {
    const response = await postJson(
      `${this.options.baseUrl.replace(/\/+$/, "")}/v3/mail/send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: parseAddress(message.from),
          ...(message.replyTo ? { reply_to: parseAddress(message.replyTo) } : {}),
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
        }),
      },
      this.name,
      this.options.timeoutMs,
    );

    return { messageId: response.headers.get("x-message-id") };
  }
}

export type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user?: string;
  password?: string;
  timeoutMs: number;
};

function classifySmtpFailure(error: unknown): EmailDeliveryError {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const retryable = ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "EDNS"].includes(code);
  return new EmailDeliveryError(`SMTP delivery failed${code ? ` (${code})` : ""}`, "smtp", retryable);
}

export class SmtpEmailTransport implements EmailTransport {
  readonly name = "smtp";
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(private readonly options: SmtpTransportOptions) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      requireTLS: options.requireTls,
      ...(options.user ? { auth: { user: options.user, pass: options.password ?? "" } } : {}),
      connectionTimeout: options.timeoutMs,
      greetingTimeout: options.timeoutMs,
      socketTimeout: options.timeoutMs,
    });
  }

  async send(message: OutboundEmail): Promise<DeliveryReceipt> {
    try {
      const info = await this.transporter.sendMail({
        from: message.from,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { messageId: info.messageId ?? null };
    } catch (error) {
      // Only the SMTP status code is surfaced. Server responses can contain
      // recipient addresses and must not reach application logs.
      throw classifySmtpFailure(error);
    }
  }
}

