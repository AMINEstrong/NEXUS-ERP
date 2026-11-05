"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";

export function ResetPasswordForm({ token }: { token: string }) {
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
      setError(reason instanceof Error ? reason.message : "Password reset failed.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) return <div className="auth-success" role="status"><span className="success-mark">✓</span><h2>Password updated</h2><p>All active sessions have been signed out. Sign in with your new password.</p><Link className="auth-submit auth-submit-link" href="/login">Return to sign in <span aria-hidden="true">→</span></Link></div>;
  return <form className="auth-form" onSubmit={submit}><label className="auth-field"><span>New password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={256} /><small>Use at least 12 characters.</small></label>{error && <p className="auth-alert" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy || !token}>{busy ? "Updating…" : "Set new password"}<span aria-hidden="true">→</span></button></form>;
}
