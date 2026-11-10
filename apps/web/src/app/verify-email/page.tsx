import { AuthCard } from "../../components/auth-card";
import { VerifyEmailForm } from "./verify-email-form";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <AuthCard topline="ACCOUNT VERIFICATION" kicker="ONE MORE STEP" title="Verify email" showFooter={false}>
      <VerifyEmailForm token={token} />
    </AuthCard>
  );
}
