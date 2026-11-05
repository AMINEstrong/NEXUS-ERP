"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";

export function LoginForm() {
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
      setError(reason instanceof Error ? reason.message : "Sign in failed. Please retry.");
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="auth-field">
        <span>Email address</span>
        <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={256} />
      </label>
      <div className="auth-inline"><span>Secure workspace access</span><Link href="/forgot-password">Forgot password?</Link></div>
      {error && <p className="auth-alert" role="alert">{error}</p>}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to NEXUS"}<span aria-hidden="true">→</span></button>
      <p className="auth-switch">New to NEXUS? <Link href="/register">Create an account</Link></p>
    </form>
  );
}
