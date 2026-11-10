export type EmailLocale = "en" | "fr" | "ar" | "de";

export type EmailTemplate = "email-verification" | "password-reset";

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
  locale: EmailLocale;
};

const SUPPORTED_LOCALES: readonly EmailLocale[] = ["en", "fr", "ar", "de"];

/**
 * Map any stored locale (for example "fr-MA" or "ar_MA") to a supported
 * e-mail language. Unknown values fall back to English.
 */
export function normalizeEmailLocale(value?: string | null): EmailLocale {
  const base = (value ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(base as EmailLocale) ? (base as EmailLocale) : "en";
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

type VerificationCopy = {
  subject: string;
  title: string;
  preview: string;
  greeting: (name: string) => string;
  intro: (company?: string) => string;
  body: string;
  action: string;
  expiry: (hours: number) => string;
  ignore: string;
  urlHint: string;
  automated: string;
  signature: string;
};

type ResetCopy = {
  subject: string;
  title: string;
  preview: string;
  greeting: (name: string) => string;
  intro: string;
  sessions: string;
  action: string;
  expiry: (minutes: number) => string;
  ignore: string;
};

const verificationCopy: Record<EmailLocale, VerificationCopy> = {
  en: {
    subject: "Verify your NEXUS ERP e-mail address",
    title: "Verify your e-mail address",
    preview: "Confirm your e-mail address to activate your NEXUS ERP account.",
    greeting: (name) => `Hello ${name},`,
    intro: (company) =>
      company ? `Your NEXUS ERP workspace for ${company} has been created.` : "Your NEXUS ERP account has been created.",
    body: "Confirm your e-mail address to activate your account and sign in.",
    action: "Verify e-mail address",
    expiry: (hours) => `${hours} hours`,
    ignore: "If you did not create this account, you can ignore this e-mail.",
    urlHint: "If the button does not work, copy this address into your browser:",
    automated: "This is an automated message from NEXUS ERP. Replies are not monitored. Never share this link with anyone.",
    signature: "— NEXUS ERP",
  },
  fr: {
    subject: "Vérifiez votre adresse e-mail NEXUS ERP",
    title: "Vérifiez votre adresse e-mail",
    preview: "Confirmez votre adresse e-mail pour activer votre compte NEXUS ERP.",
    greeting: (name) => `Bonjour ${name},`,
    intro: (company) =>
      company ? `Votre espace NEXUS ERP pour ${company} a été créé.` : "Votre compte NEXUS ERP a été créé.",
    body: "Confirmez votre adresse e-mail pour activer votre compte et vous connecter.",
    action: "Vérifier l’adresse e-mail",
    expiry: (hours) => `${hours} heures`,
    ignore: "Si vous n’avez pas créé ce compte, vous pouvez ignorer cet e-mail.",
    urlHint: "Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :",
    automated:
      "Ceci est un message automatique de NEXUS ERP. Les réponses ne sont pas surveillées. Ne partagez jamais ce lien.",
    signature: "— NEXUS ERP",
  },
  ar: {
    subject: "تحقق من عنوان بريدك الإلكتروني في NEXUS ERP",
    title: "تحقق من عنوان بريدك الإلكتروني",
    preview: "أكد عنوان بريدك الإلكتروني لتفعيل حسابك في NEXUS ERP.",
    greeting: (name) => `مرحباً ${name}،`,
    intro: (company) =>
      company ? `تم إنشاء مساحة عملك في NEXUS ERP لصالح ${company}.` : "تم إنشاء حسابك في NEXUS ERP.",
    body: "أكد عنوان بريدك الإلكتروني لتفعيل حسابك وتسجيل الدخول.",
    action: "تحقق من البريد الإلكتروني",
    expiry: (hours) => `${hours} ساعة`,
    ignore: "إذا لم تنشئ هذا الحساب، يمكنك تجاهل هذه الرسالة.",
    urlHint: "إذا لم يعمل الزر، فانسخ هذا العنوان في متصفحك:",
    automated: "هذه رسالة آلية من NEXUS ERP. لا تتم مراقبة الردود. لا تشارك هذا الرابط مع أي شخص.",
    signature: "— NEXUS ERP",
  },
  de: {
    subject: "Bestätigen Sie Ihre NEXUS ERP-E-Mail-Adresse",
    title: "Bestätigen Sie Ihre E-Mail-Adresse",
    preview: "Bestätigen Sie Ihre E-Mail-Adresse, um Ihr NEXUS ERP-Konto zu aktivieren.",
    greeting: (name) => `Hallo ${name},`,
    intro: (company) =>
      company ? `Ihr NEXUS ERP-Arbeitsbereich für ${company} wurde erstellt.` : "Ihr NEXUS ERP-Konto wurde erstellt.",
    body: "Bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren und sich anzumelden.",
    action: "E-Mail-Adresse bestätigen",
    expiry: (hours) => `${hours} Stunden`,
    ignore: "Wenn Sie dieses Konto nicht erstellt haben, können Sie diese E-Mail ignorieren.",
    urlHint: "Wenn die Schaltfläche nicht funktioniert, kopieren Sie diese Adresse in Ihren Browser:",
    automated:
      "Dies ist eine automatische Nachricht von NEXUS ERP. Antworten werden nicht überwacht. Geben Sie diesen Link niemals weiter.",
    signature: "— NEXUS ERP",
  },
};

const resetCopy: Record<EmailLocale, ResetCopy> = {
  en: {
    subject: "Reset your NEXUS ERP password",
    title: "Reset your password",
    preview: "Choose a new password for your NEXUS ERP account.",
    greeting: (name) => `Hello ${name},`,
    intro:
      "A password reset was requested for your NEXUS ERP account. Choose a new password using the button below.",
    sessions: "For your security, this action signs out every active session on the account.",
    action: "Choose a new password",
    expiry: (minutes) => `${minutes} minutes`,
    ignore: "If you did not request a reset, ignore this e-mail; your password will not change.",
  },
  fr: {
    subject: "Réinitialisez votre mot de passe NEXUS ERP",
    title: "Réinitialisez votre mot de passe",
    preview: "Choisissez un nouveau mot de passe pour votre compte NEXUS ERP.",
    greeting: (name) => `Bonjour ${name},`,
    intro:
      "Une réinitialisation de mot de passe a été demandée pour votre compte NEXUS ERP. Choisissez un nouveau mot de passe à l’aide du bouton ci-dessous.",
    sessions: "Pour votre sécurité, cette action déconnecte toutes les sessions actives du compte.",
    action: "Choisir un nouveau mot de passe",
    expiry: (minutes) => `${minutes} minutes`,
    ignore:
      "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail ; votre mot de passe restera inchangé.",
  },
  ar: {
    subject: "إعادة تعيين كلمة المرور في NEXUS ERP",
    title: "إعادة تعيين كلمة المرور",
    preview: "اختر كلمة مرور جديدة لحسابك في NEXUS ERP.",
    greeting: (name) => `مرحباً ${name}،`,
    intro: "تم طلب إعادة تعيين كلمة المرور لحسابك في NEXUS ERP. اختر كلمة مرور جديدة باستخدام الزر أدناه.",
    sessions: "لأمانك، سيؤدي هذا الإجراء إلى تسجيل الخروج من جميع الجلسات النشطة.",
    action: "اختيار كلمة مرور جديدة",
    expiry: (minutes) => `${minutes} دقيقة`,
    ignore: "إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة؛ ولن تتغير كلمة المرور.",
  },
  de: {
    subject: "Setzen Sie Ihr NEXUS ERP-Passwort zurück",
    title: "Passwort zurücksetzen",
    preview: "Wählen Sie ein neues Passwort für Ihr NEXUS ERP-Konto.",
    greeting: (name) => `Hallo ${name},`,
    intro:
      "Für Ihr NEXUS ERP-Konto wurde eine Passwortzurücksetzung angefordert. Wählen Sie über die Schaltfläche unten ein neues Passwort.",
    sessions: "Zu Ihrer Sicherheit werden bei dieser Aktion alle aktiven Sitzungen des Kontos beendet.",
    action: "Neues Passwort wählen",
    expiry: (minutes) => `${minutes} Minuten`,
    ignore:
      "Wenn Sie keine Zurücksetzung angefordert haben, ignorieren Sie diese E-Mail; Ihr Passwort bleibt unverändert.",
  },
};

type LayoutInput = {
  locale: EmailLocale;
  preview: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  notice: string;
  urlHint: string;
  automated: string;
};

function layout({ locale, preview, title, greeting, paragraphs, actionLabel, actionUrl, notice, urlHint, automated }: LayoutInput) {
  const rtl = locale === "ar";
  const direction = rtl ? "rtl" : "ltr";
  const alignment = rtl ? "right" : "left";
  const safeUrl = escapeHtml(actionUrl);
  const body = paragraphs.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#3f3f46;">${paragraph}</p>`).join("");

  return `<!doctype html>
<html lang="${locale}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(title)}</title>
  </head>
  <body dir="${direction}" style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;direction:${direction};text-align:${alignment};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
            <tr>
              <td style="padding:32px 32px 0;text-align:${alignment};">
                <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#71717a;">NEXUS ERP</div>
                <h1 style="margin:16px 0 24px;font-size:22px;line-height:30px;font-weight:700;color:#18181b;">${escapeHtml(title)}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#3f3f46;">${escapeHtml(greeting)}</p>
                ${body}
                <table role="presentation" cellpadding="0" cellspacing="0" align="${alignment}" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:8px;background:#18181b;">
                      <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(actionLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#71717a;">${escapeHtml(urlHint)}</p>
                <p dir="ltr" style="margin:0 0 24px;font-size:12px;line-height:18px;color:#3f3f46;word-break:break-all;text-align:left;">${safeUrl}</p>
                <p style="margin:0 0 24px;padding:12px 14px;border-radius:8px;background:#f4f4f5;font-size:12px;line-height:18px;color:#52525b;">${escapeHtml(notice)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;text-align:${alignment};">
                <hr style="border:0;border-top:1px solid #e4e4e7;margin:0 0 16px;">
                <p style="margin:0;font-size:11px;line-height:17px;color:#a1a1aa;">${escapeHtml(automated)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildVerificationEmail(input: {
  locale?: string | null;
  recipientName: string;
  companyName?: string;
  verificationUrl: string;
  expiresInHours: number;
}): EmailContent {
  const locale = normalizeEmailLocale(input.locale);
  const copy = verificationCopy[locale];
  const name = input.recipientName.trim() || "there";
  const company = input.companyName?.trim();
  const notice = `${copy.expiry(input.expiresInHours)} — ${copy.ignore}`;

  return {
    locale,
    subject: copy.subject,
    html: layout({
      locale,
      preview: copy.preview,
      title: copy.title,
      greeting: copy.greeting(name),
      paragraphs: [escapeHtml(copy.intro(company)), escapeHtml(copy.body)],
      actionLabel: copy.action,
      actionUrl: input.verificationUrl,
      notice,
      urlHint: copy.urlHint,
      automated: copy.automated,
    }),
    text: [
      copy.greeting(name),
      "",
      copy.intro(company),
      copy.body,
      input.verificationUrl,
      "",
      notice,
      copy.urlHint.replace(/:$/, ":"),
      "",
      copy.signature,
    ].join("\n"),
  };
}

export function buildPasswordResetEmail(input: {
  locale?: string | null;
  recipientName: string;
  resetUrl: string;
  expiresInMinutes: number;
}): EmailContent {
  const locale = normalizeEmailLocale(input.locale);
  const copy = resetCopy[locale];
  const name = input.recipientName.trim() || "there";
  const notice = `${copy.expiry(input.expiresInMinutes)} — ${copy.ignore}`;

  return {
    locale,
    subject: copy.subject,
    html: layout({
      locale,
      preview: copy.preview,
      title: copy.title,
      greeting: copy.greeting(name),
      paragraphs: [escapeHtml(copy.intro), escapeHtml(copy.sessions)],
      actionLabel: copy.action,
      actionUrl: input.resetUrl,
      notice,
      urlHint: verificationCopy[locale].urlHint,
      automated: verificationCopy[locale].automated,
    }),
    text: [
      copy.greeting(name),
      "",
      copy.intro,
      input.resetUrl,
      "",
      notice,
      copy.sessions,
      "",
      verificationCopy[locale].signature,
    ].join("\n"),
  };
}
