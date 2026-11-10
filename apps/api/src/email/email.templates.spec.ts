import { describe, expect, it } from "@jest/globals";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  escapeHtml,
  normalizeEmailLocale,
} from "./email.templates.js";

const verificationUrl = "https://erp.example.ma/verify-email?token=verification-token-value";
const resetUrl = "https://erp.example.ma/reset-password?token=reset-token-value";

describe("normalizeEmailLocale", () => {
  it("maps regional locales to their base language", () => {
    expect(normalizeEmailLocale("fr-MA")).toBe("fr");
    expect(normalizeEmailLocale("ar_MA")).toBe("ar");
    expect(normalizeEmailLocale("DE")).toBe("de");
    expect(normalizeEmailLocale("en-US")).toBe("en");
  });

  it("falls back to English for missing or unsupported values", () => {
    expect(normalizeEmailLocale(undefined)).toBe("en");
    expect(normalizeEmailLocale(null)).toBe("en");
    expect(normalizeEmailLocale("")).toBe("en");
    expect(normalizeEmailLocale("es-ES")).toBe("en");
  });
});

describe("escapeHtml", () => {
  it("neutralises markup and quotes", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });
});

describe("verification e-mail templates", () => {
  const cases = [
    { locale: "en", subject: "Verify your NEXUS ERP e-mail address", greeting: "Hello Owner," },
    { locale: "fr-MA", subject: "Vérifiez votre adresse e-mail NEXUS ERP", greeting: "Bonjour Owner," },
    { locale: "ar-MA", subject: "تحقق من عنوان بريدك الإلكتروني في NEXUS ERP", greeting: "مرحباً Owner،" },
    { locale: "de-DE", subject: "Bestätigen Sie Ihre NEXUS ERP-E-Mail-Adresse", greeting: "Hallo Owner," },
  ];

  it.each(cases)("renders $locale with a localised subject, HTML and text part", ({ locale, subject, greeting }) => {
    const email = buildVerificationEmail({
      locale,
      recipientName: "Owner",
      companyName: "Atlas Manufacturing",
      verificationUrl,
      expiresInHours: 24,
    });

    expect(email.locale).toBe(locale.slice(0, 2));
    expect(email.subject).toBe(subject);
    expect(email.html).toContain(`lang="${locale.slice(0, 2)}"`);
    expect(email.html).toContain(greeting);
    expect(email.html).toContain(verificationUrl);
    expect(email.html).toContain("Atlas Manufacturing");
    expect(email.html).toContain("<!doctype html>");
    expect(email.text).toContain(verificationUrl);
    expect(email.text).toContain(greeting);
  });

  it("renders Arabic right-to-left while keeping the URL left-to-right", () => {
    const email = buildVerificationEmail({
      locale: "ar",
      recipientName: "Owner",
      verificationUrl,
      expiresInHours: 24,
    });

    expect(email.html).toContain('<html lang="ar" dir="rtl">');
    expect(email.html).toContain("text-align:right");
    expect(email.html).toContain(`<p dir="ltr"`);
    expect(email.html).toContain('align="right"');
  });

  it("uses a safe English fallback and escapes the recipient name", () => {
    const email = buildVerificationEmail({
      locale: "xx-YY",
      recipientName: '<img src=x onerror="alert(1)">',
      verificationUrl,
      expiresInHours: 24,
    });

    expect(email.locale).toBe("en");
    expect(email.subject).toBe("Verify your NEXUS ERP e-mail address");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });

  it("escapes the company name before rendering it", () => {
    const email = buildVerificationEmail({
      locale: "en",
      recipientName: "Owner",
      companyName: "<b>Evil</b>",
      verificationUrl,
      expiresInHours: 24,
    });

    expect(email.html).not.toContain("<b>Evil</b>");
    expect(email.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });
});

describe("password reset templates", () => {
  const cases = [
    { locale: "en", subject: "Reset your NEXUS ERP password" },
    { locale: "fr", subject: "Réinitialisez votre mot de passe NEXUS ERP" },
    { locale: "ar", subject: "إعادة تعيين كلمة المرور في NEXUS ERP" },
    { locale: "de", subject: "Setzen Sie Ihr NEXUS ERP-Passwort zurück" },
  ];

  it.each(cases)("renders $locale with a localised subject and both parts", ({ locale, subject }) => {
    const email = buildPasswordResetEmail({
      locale,
      recipientName: "Owner",
      resetUrl,
      expiresInMinutes: 30,
    });

    expect(email.locale).toBe(locale);
    expect(email.subject).toBe(subject);
    expect(email.html).toContain(resetUrl);
    expect(email.text).toContain(resetUrl);
    expect(email.html).toContain(dirFor(locale));
  });

  it("marks Arabic reset e-mails as right-to-left", () => {
    const email = buildPasswordResetEmail({
      locale: "ar",
      recipientName: "Owner",
      resetUrl,
      expiresInMinutes: 30,
    });

    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain("text-align:right");
  });
});

function dirFor(locale: string) {
  return locale === "ar" ? 'dir="rtl"' : 'dir="ltr"';
}
