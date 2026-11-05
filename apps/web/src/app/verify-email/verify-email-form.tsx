"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

export function VerifyEmailForm({ token }: { token: string }) {
  const [status, setStatus] = useState<"ready" | "busy" | "verified" | "error">("ready");
  const [message, setMessage] = useState("");

  async function verify() {
    setStatus("busy");
    try {
      await apiRequest("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
      setStatus("verified");
    } catch (reason) {
      setStatus("error");
      setMessage(reason instanceof Error ? reason.message : "Verification could not be completed.");
    }
  }

  return (
    <div className="auth-form">
      {status === "verified" ? <><span className="success-mark">✓</span><h2>Email verified</h2><p>You can now sign in to your company workspace.</p><Link className="auth-submit auth-submit-link" href="/login">Continue to sign in <span aria-hidden="true">→</span></Link></> : <><p>{status === "error" ? message : "Confirm your email address to activate your NEXUS account."}</p><button className="auth-submit" onClick={verify} disabled={status === "busy" || !token}>{status === "busy" ? "Verifying…" : status === "error" ? "Try verification again" : "Verify email address"}<span aria-hidden="true">→</span></button></>}
    </div>
  );
}
