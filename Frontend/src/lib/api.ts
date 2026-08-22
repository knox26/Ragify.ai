import axios, { type AxiosRequestConfig } from "axios";
import { API_BASE_URL, API_ENDPOINTS } from "./constants";

// ---- Types ----

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

// Auth endpoints return the user at the top level, not inside `data`.
export interface AuthResponse extends Omit<ApiResponse<AuthUser>, "data"> {
  user: AuthUser;
}

export type DocumentStatus =
  | "PENDING_UPLOAD"
  | "UPLOAD_COMPLETED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface Document {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  createdAt: string;
}

export interface InitUploadRequest {
  // Client-generated idempotency key — a retry reuses it so the server
  // returns the existing upload instead of creating an orphan.
  documentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface PresignedPart {
  chunkNumber: number;
  url: string;
}

export type InitUploadResponse =
  // Fresh init — client uploads parts.
  | { documentId: string; chunkSize: number; presignedUrls: PresignedPart[] }
  // Idempotent retry that found the document already past init — no parts.
  | { documentId: string; status: DocumentStatus };

export interface UploadedChunk {
  chunkNumber: number;
  etag: string;
}

export interface CompleteUploadRequest {
  documentId: string;
  chunks: UploadedChunk[];
}

export interface AbortUploadRequest {
  documentId: string;
  uploadId: string;
}

// ---- ApiError ----

export class ApiError extends Error {
  public readonly status: number;
  public readonly data?: Record<string, unknown>;

  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// Maps an error to copy a user can act on. A backend 500's raw message is
// "Internal Server Error" — technically true, useless in a UI. Status codes
// are the actionable signal; unmapped 4xx keep the server's message (usually
// specific validation copy), and any raw message survives as a fallback so no
// detail is lost.
export function getFriendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0: // axios: no response (network down, timeout)
        return "Can't reach the server. Check your connection and try again.";
      case 401:
        return "Your session expired. Sign in again to continue.";
      case 403:
        return "You don't have permission to do that.";
      case 404:
        return "We couldn't find what you're looking for.";
      default:
        if (error.status >= 500) {
          return "The server ran into a problem. Try again in a moment.";
        }
        return error.message || "Something went wrong. Please try again.";
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

// ---- Token refresh orchestration ----

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
const refreshSubscribers: Array<(ok: boolean) => void> = [];

function onRefreshed(ok: boolean): void {
  for (const cb of refreshSubscribers) {
    cb(ok);
  }
  refreshSubscribers.length = 0;
}

// Metadata requests (auth, init/complete upload, list) are small — a stalled
// connection should surface as an error, not hang the UI. Applies to the
// refresh POST too: without it, a silently stalled refresh would never settle,
// isRefreshing would stay true, and every later 401 would queue a subscriber
// and wait forever (freezing all authenticated calls).
const API_TIMEOUT_MS = 30_000;

async function attemptTokenRefresh(): Promise<boolean> {
  // If another refresh is already in-flight, queue this caller and wait
  if (isRefreshing && refreshPromise) {
    return new Promise<boolean>((resolve) => {
      refreshSubscribers.push(resolve);
    });
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`,
        {},
        {
          withCredentials: true,
          timeout: API_TIMEOUT_MS,
        },
      );
      const ok = res.status >= 200 && res.status < 300;
      onRefreshed(ok);
      return ok;
    } catch {
      onRefreshed(false);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---- Core request function ----

async function apiRequest<T>(
  endpoint: string,
  options: AxiosRequestConfig = {},
  attemptRefresh = true,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await axios({
      url,
      withCredentials: true,
      timeout: API_TIMEOUT_MS,
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 204) {
      return { success: true } as T;
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      if (error.response.status === 401 && attemptRefresh) {
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          return apiRequest<T>(endpoint, options, false);
        }
      }

      throw new ApiError(
        error.response.data?.message ?? "An unexpected error occurred",
        error.response.status,
        error.response.data,
      );
    }

    throw new ApiError("Network error", 0, {});
  }
}

// ---- Public API ----

export const api = {
  signup(data: { name: string; email: string; password: string }) {
    return apiRequest<AuthResponse>(API_ENDPOINTS.SIGNUP, {
      method: "POST",
      data,
    });
  },

  login(data: { email: string; password: string }) {
    return apiRequest<AuthResponse>(API_ENDPOINTS.LOGIN, {
      method: "POST",
      data,
    });
  },

  logout() {
    return apiRequest<ApiResponse>(API_ENDPOINTS.LOGOUT, {
      method: "POST",
    });
  },

  refreshToken() {
    return apiRequest<ApiResponse>(API_ENDPOINTS.REFRESH_TOKEN, {
      method: "POST",
    });
  },

  initializeUpload(data: InitUploadRequest, config?: AxiosRequestConfig) {
    return apiRequest<ApiResponse<InitUploadResponse>>(
      API_ENDPOINTS.DOCUMENTS_INIT_UPLOAD,
      {
        method: "POST",
        data,
        ...config,
      },
    );
  },

  completeUpload(data: CompleteUploadRequest, config?: AxiosRequestConfig) {
    return apiRequest<ApiResponse>(API_ENDPOINTS.DOCUMENTS_COMPLETE_UPLOAD, {
      method: "POST",
      data,
      ...config,
    });
  },

  getDocuments() {
    return apiRequest<ApiResponse<Document[]>>(
      API_ENDPOINTS.DOCUMENTS_GET_DOCUMENTS,
      {
        method: "GET",
      },
    );
  },
};
