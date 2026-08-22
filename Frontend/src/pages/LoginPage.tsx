import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuthStore } from "../stores/authStore";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import { InputField } from "../components/ui/InputField";
import { SubmitButton } from "../components/ui/SubmitButton";
import { Alert } from "../components/ui/Alert";
import {
  AuthLayout,
  AuthDivider,
  SocialButtons,
} from "../components/auth/AuthLayout";

// Matches backend loginSchema: email, password (min 6)
const loginFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginPage() {
  // Redirect already-authenticated users away from login
  useAuthRedirect();

  const { isLoading, error, clearError, login } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    clearError();
    try {
      await login(data.email, data.password);
      // Navigation happens via useAuthRedirect when isAuthenticated flips
    } catch {
      // Error is already set in the store
    }
  };

  return (
    <AuthLayout
      eyebrow="Ragify · Sign in"
      title={
        <>
          Welcome back<span className="gradient-text">.</span>
        </>
      }
      subtitle="Your documents are right where you left them."
    >
      {/* API Error Alert */}
      <Alert
        variant="error"
        message={error}
        onDismiss={clearError}
        className="mb-4"
      />

      <form
        className="space-y-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <InputField
          label="Email Address"
          id="login-email"
          type="email"
          placeholder="you@example.com"
          icon={<Mail className="w-5 h-5" />}
          error={errors.email?.message}
          {...register("email")}
        />

        <InputField
          label="Password"
          id="login-password"
          type="password"
          placeholder="••••••••"
          icon={<Lock className="w-5 h-5" />}
          error={errors.password?.message}
          labelAction={
            <a
              href="#"
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Forgot password?
            </a>
          }
          {...register("password")}
        />

        <SubmitButton
          isLoading={isSubmitting || isLoading}
          label="Sign In"
        />
      </form>

      <AuthDivider />
      <SocialButtons />

      <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">
        New here?{" "}
        <Link
          to="/signup"
          className="font-semibold text-[var(--text-primary)] hover:underline"
        >
          Create your workspace
        </Link>
      </p>
    </AuthLayout>
  );
}
