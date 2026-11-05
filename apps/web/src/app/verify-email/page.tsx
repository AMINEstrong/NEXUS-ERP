import Link from "next/link";
import { VerifyEmailForm } from "./verify-email-form";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="auth-page">
      <div className="auth-topline"><Link className="brand" href="/" aria-label="NEXUS ERP home"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ERP MS</span></span></Link><span>ACCOUNT VERIFICATION</span></div>
      <section className="auth-card"><span className="auth-kicker">ONE MORE STEP</span><h1>Verify email</h1><VerifyEmailForm token={token} /></section>
    </main>
  );
}
