import { AuthCard } from "../../components/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      topline="ACCOUNT RECOVERY"
      kicker="RESET YOUR ACCESS"
      title="Forgot password?"
      description="Enter the verified email for your account. We’ll prepare a one-time reset link."
      showFooter={false}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
