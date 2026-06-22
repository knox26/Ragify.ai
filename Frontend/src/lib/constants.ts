// Vite proxy forwards /api → backend in dev.
// Empty string means same-origin (no absolute URL needed).
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

export const API_ENDPOINTS = {
  SIGNUP: "/api/auth/signup",
  LOGIN: "/api/auth/login",
  LOGOUT: "/api/auth/logout",
  REFRESH_TOKEN: "/api/auth/refreshtoken",
  DOCUMENTS: "/api/documents",
  DOCUMENTS_INIT_UPLOAD: "/api/documents/init-upload",
} as const;
