import { AuthCard } from "../../components/auth-card";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <AuthCard
      topline="COMPANY ONBOARDING"
      kicker="START WITH YOUR TEAM"
      title="Create workspace"
      description="Your account becomes the owner of a new company workspace. You can add more companies after signing in."
    >
      <RegisterForm />
    </AuthCard>
  );
}
