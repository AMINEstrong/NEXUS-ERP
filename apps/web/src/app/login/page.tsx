import { AuthCard } from "../../components/auth-card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthCard
      topline="SECURE BUSINESS WORKSPACE"
      kicker="WELCOME BACK"
      title="Sign in"
      description="Access your company workspace and continue where your team left off."
    >
      <LoginForm />
    </AuthCard>
  );
}
