import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return <main className="auth-page"><div className="auth-topline"><Link className="brand" href="/" aria-label="NEXUS ERP home"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ERP MS</span></span></Link><span>ACCOUNT RECOVERY</span></div><section className="auth-card"><span className="auth-kicker">RESET YOUR ACCESS</span><h1>Forgot password?</h1><p className="auth-description">Enter the verified email for your account. We’ll prepare a one-time reset link.</p><ForgotPasswordForm /></section></main>;
}
