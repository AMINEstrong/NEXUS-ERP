"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function LoginForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      window.location.assign("/app");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Sign in failed. Please retry."));
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="auth-field">
        <span>{t("Email address")}</span>
        <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} />
      </label>
      <label className="auth-field">
        <span>{t("Password")}</span>
        <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={256} />
      </label>
      <div className="auth-inline"><span>{t("Secure workspace access")}</span><Link href="/forgot-password">{t("Forgot password?")}</Link></div>
      {error && <p className="auth-alert" role="alert">{error}</p>}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? t("Signing in…") : t("Sign in to NEXUS")}<span aria-hidden="true">→</span></button>
      <p className="auth-switch">{t("New to NEXUS?")} <Link href="/register">{t("Create an account")}</Link></p>
    </form>
  );
}
