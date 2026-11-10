import { AuthCard } from "../../components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <AuthCard topline="ACCOUNT RECOVERY" kicker="CHOOSE A NEW PASSWORD" title="Reset password" showFooter={false}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
