"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiRequest } from "../../lib/api";

type RegistrationResult = {
  verificationRequired: boolean;
  developmentVerificationUrl?: string;
  company: { name: string };
};

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const created = await apiRequest<RegistrationResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, companyName, countryCode: "MA", currencyCode: "MAD", defaultLocale: "fr-MA", timeZone: "Africa/Casablanca" }),
      });
      setResult(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account creation failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="auth-success" role="status">
        <span className="success-mark">✓</span>
        <h2>Your workspace is ready</h2>
        <p><strong>{result.company.name}</strong> has been created. Verify your email before signing in.</p>
        {result.developmentVerificationUrl ? <a className="auth-submit auth-submit-link" href={result.developmentVerificationUrl}>Verify email address <span aria-hidden="true">→</span></a> : <p className="auth-note">Check your inbox for the verification link.</p>}
        <p className="auth-switch"><Link href="/login">Continue to sign in</Link></p>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="auth-field"><span>Your name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={160} /></label>
      <label className="auth-field"><span>Work email</span><input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} /></label>
      <label className="auth-field"><span>Company name</span><input autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} maxLength={180} /></label>
      <label className="auth-field"><span>Password</span><input autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={256} /><small>Use at least 12 characters.</small></label>
      {error && <p className="auth-alert" role="alert">{error}</p>}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Creating workspace…" : "Create company workspace"}<span aria-hidden="true">→</span></button>
      <p className="auth-switch">Already have a NEXUS account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
