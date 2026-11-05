import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-topline"><Link className="brand" href="/" aria-label="NEXUS ERP home"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ERP MS</span></span></Link><span>SECURE BUSINESS WORKSPACE</span></div>
      <section className="auth-card">
        <span className="auth-kicker">WELCOME BACK</span>
        <h1>Sign in</h1>
        <p className="auth-description">Access your company workspace and continue where your team left off.</p>
        <LoginForm />
      </section>
      <p className="auth-footer">Protected by NEXUS ERP MS <span>•</span> <Link href="/">Return to website</Link></p>
    </main>
  );
}
