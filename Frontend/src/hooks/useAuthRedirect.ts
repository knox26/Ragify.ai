import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

/**
 * Redirects to `to` when the user becomes authenticated.
 * Place in login/signup pages to auto-navigate after successful auth.
 */
export function useAuthRedirect(to = "/home"): void {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(to, { replace: true });
    }
  }, [isAuthenticated, navigate, to]);
}
