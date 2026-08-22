import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, User } from "lucide-react";
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

// Matches backend signupSchema: name (min 2), email, password (min 6)
const signupFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignupFormValues = z.infer<typeof signupFormSchema>;

export function SignupPage() {
  // Redirect already-authenticated users away from signup
  useAuthRedirect();

  const { isLoading, error, clearError, signup } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: SignupFormValues) => {
    clearError();
    try {
      await signup(data.name, data.email, data.password);
      // Navigation happens via useAuthRedirect when isAuthenticated flips
    } catch {
      // Error is already set in the store
    }
  };

  return (
    <AuthLayout
      eyebrow="Ragify · Sign up"
      title={
        <>
          Create your workspace<span className="gradient-text">.</span>
        </>
      }
      subtitle="Upload your first document in under a minute. No credit card required."
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
          label="Full Name"
          id="signup-name"
          type="text"
          placeholder="John Doe"
          icon={<User className="w-5 h-5" />}
          error={errors.name?.message}
          {...register("name")}
        />

        <InputField
          label="Email Address"
          id="signup-email"
          type="email"
          placeholder="you@example.com"
          icon={<Mail className="w-5 h-5" />}
          error={errors.email?.message}
          {...register("email")}
        />

        <InputField
          label="Password"
          id="signup-password"
          type="password"
          placeholder="••••••••"
          icon={<Lock className="w-5 h-5" />}
          error={errors.password?.message}
          {...register("password")}
        />

        <SubmitButton
          isLoading={isSubmitting || isLoading}
          label="Create Workspace"
        />
      </form>

      <AuthDivider />
      <SocialButtons />

      <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-semibold text-[var(--text-primary)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
