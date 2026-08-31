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
  DOCUMENTS_COMPLETE_UPLOAD: "/api/documents/complete-upload",
  DOCUMENTS_GET_DOCUMENTS: "/api/documents/get-documents",
  DOCUMENTS_COUNT: "/api/documents/count",
  DOCUMENTS_STATUSES: "/api/documents/statuses",
  DOCUMENT: (id: string) => `/api/documents/${id}`,
  CHATS: "/api/chats",
  CHAT: (id: string) => `/api/chats/${id}`,
  CHATS_MESSAGE: "/api/chats/message",
  CHATS_MESSAGES: (id: string) => `/api/chats/${id}/messages`,
  CHATS_RENAME: (id: string) => `/api/chats/${id}`,
  CHATS_DELETE: (id: string) => `/api/chats/${id}`,
} as const;
