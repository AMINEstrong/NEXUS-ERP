"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, password }) });
      setComplete(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Password reset failed."));
    } finally {
      setBusy(false);
    }
  }

  if (complete) return <div className="auth-success" role="status"><span className="success-mark">✓</span><h2>{t("Password updated")}</h2><p>{t("All active sessions have been signed out. Sign in with your new password.")}</p><Link className="auth-submit auth-submit-link" href="/login">{t("Return to sign in")} <span aria-hidden="true">→</span></Link></div>;
  return <form className="auth-form" onSubmit={submit}><label className="auth-field"><span>{t("New password")}</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={256} /><small>{t("Use at least 12 characters.")}</small></label>{error && <p className="auth-alert" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy || !token}>{busy ? t("Updating…") : t("Set new password")}<span aria-hidden="true">→</span></button></form>;
}
