"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type ResetRequest = { status: string; developmentResetUrl?: string };

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ResetRequest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult(await apiRequest<ResetRequest>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("The request could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  return result ? <div className="auth-success" role="status"><span className="success-mark">✓</span><h2>{t("Check your email")}</h2><p>{t("If a verified account exists for that address, a reset link is ready.")}</p>{result.developmentResetUrl && <a className="auth-submit auth-submit-link" href={result.developmentResetUrl}>{t("Open local reset link")} <span aria-hidden="true">→</span></a>}<p className="auth-switch"><Link href="/login">{t("Return to sign in")}</Link></p></div> : <form className="auth-form" onSubmit={submit}><label className="auth-field"><span>{t("Email address")}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} /></label>{error && <p className="auth-alert" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? t("Preparing link…") : t("Request reset link")}<span aria-hidden="true">→</span></button><p className="auth-switch"><Link href="/login">{t("Return to sign in")}</Link></p></form>;
}
