import Link from "next/link";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <div className="auth-topline"><Link className="brand" href="/" aria-label="NEXUS ERP home"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ERP MS</span></span></Link><span>COMPANY ONBOARDING</span></div>
      <section className="auth-card">
        <span className="auth-kicker">START WITH YOUR TEAM</span>
        <h1>Create workspace</h1>
        <p className="auth-description">Your account becomes the owner of a new company workspace. You can add more companies after signing in.</p>
        <RegisterForm />
      </section>
      <p className="auth-footer">NEXUS ERP MS <span>•</span> <Link href="/">Return to website</Link></p>
    </main>
  );
}
