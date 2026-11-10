import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EmailTemplate } from "./email.templates.js";
import {
  EmailDeliveryError,
  LogEmailTransport,
  ResendEmailTransport,
  SendGridEmailTransport,
  SmtpEmailTransport,
  type EmailTransport,
} from "./email.transports.js";

export const EMAIL_TRANSPORT = Symbol("EMAIL_TRANSPORT");

export type SendEmailInput = {
  to: string;
  template: EmailTemplate;
  subject: string;
  html: string;
  text: string;
};

/**
 * Mask the local part of an address before logging it. Full recipient
 * addresses are personal data and must not end up in application logs.
 */
export function maskEmail(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at);
  return `${local.slice(0, 1)}***${domain}`;
}

export function createTransport(config: ConfigService): EmailTransport {
  const provider = config.get<string>("EMAIL_PROVIDER", "log");
  const timeoutMs = config.get<number>("EMAIL_TIMEOUT_MS", 10_000);

  if (provider === "log") return new LogEmailTransport();

  if (provider === "smtp") {
    return new SmtpEmailTransport({
      host: config.get<string>("SMTP_HOST", ""),
      port: config.get<number>("SMTP_PORT", 587),
      secure: config.get<string>("SMTP_SECURE", "false") === "true",
      requireTls: config.get<string>("SMTP_REQUIRE_TLS", "true") === "true",
      user: config.get<string>("SMTP_USER", "") || undefined,
      password: config.get<string>("SMTP_PASSWORD", "") || undefined,
      timeoutMs,
    });
  }

  const apiKey = config.get<string>("EMAIL_API_KEY", "");
  if (provider === "resend") {
    return new ResendEmailTransport({
      apiKey,
      baseUrl: config.get<string>("EMAIL_API_URL") ?? "https://api.resend.com",
      timeoutMs,
    });
  }
  if (provider === "sendgrid") {
    return new SendGridEmailTransport({
      apiKey,
      baseUrl: config.get<string>("EMAIL_API_URL") ?? "https://api.sendgrid.com",
      timeoutMs,
    });
  }

  throw new Error(`Unsupported EMAIL_PROVIDER "${provider}". Use log, smtp, resend or sendgrid.`);
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly replyTo?: string;
  private readonly maxAttempts: number;

  constructor(
    config: ConfigService,
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
  ) {
    this.from = config.get<string>("EMAIL_FROM", "NEXUS ERP <no-reply@nexus.local>");
    this.replyTo = config.get<string>("EMAIL_REPLY_TO", "") || undefined;
    this.maxAttempts = config.get<number>("EMAIL_MAX_ATTEMPTS", 3);
  }

  get providerName() {
    return this.transport.name;
  }

  /**
   * Send a rendered e-mail. Retries transient network/429/5xx/SMTP failures.
   * Logs only non-sensitive metadata: template, provider, masked recipient,
   * attempt and provider message id. Never logs the body, URL or token.
   */
  async send(input: SendEmailInput): Promise<void> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const receipt = await this.transport.send({
          to: input.to,
          from: this.from,
          replyTo: this.replyTo,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        this.logger.log(
          `email delivered template=${input.template} provider=${this.transport.name} recipient=${maskEmail(input.to)} messageId=${receipt.messageId ?? "none"} attempt=${attempt}`,
        );
        return;
      } catch (error) {
        const failure =
          error instanceof EmailDeliveryError
            ? error
            : new EmailDeliveryError("Unexpected e-mail delivery failure", this.transport.name, false);

        if (!failure.retryable || attempt === this.maxAttempts) {
          this.logger.error(
            `email delivery failed template=${input.template} provider=${this.transport.name} recipient=${maskEmail(input.to)} status=${failure.statusCode ?? "n/a"} attempts=${attempt} reason=${failure.message}`,
          );
          throw failure;
        }

        this.logger.warn(
          `email delivery retry template=${input.template} provider=${this.transport.name} recipient=${maskEmail(input.to)} status=${failure.statusCode ?? "n/a"} attempt=${attempt}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }
}
