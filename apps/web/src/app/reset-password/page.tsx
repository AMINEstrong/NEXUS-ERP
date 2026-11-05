import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="auth-page"><div className="auth-topline"><Link className="brand" href="/" aria-label="NEXUS ERP home"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ERP MS</span></span></Link><span>ACCOUNT RECOVERY</span></div><section className="auth-card"><span className="auth-kicker">CHOOSE A NEW PASSWORD</span><h1>Reset password</h1><ResetPasswordForm token={token} /></section></main>;
}
