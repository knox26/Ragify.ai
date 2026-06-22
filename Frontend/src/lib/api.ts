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

export type DocumentStatus =
  | "PROCESSING"
  | "READY"
  | "FAILED";

export interface Document {
  id: string;
  name: string;
  status: DocumentStatus;
  uploadedAt: string;
}

export interface InitUploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface PresignedPart {
  partNumber: number;
  url: string;
}

export interface InitUploadResponse {
  documentId: string;
  uploadId: string;
  key: string;
  partSize: number;
  parts: PresignedPart[];
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteUploadRequest {
  documentId: string;
  uploadId: string;
  parts: UploadedPart[];
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
        }
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
  } catch (error: any) {
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
    return apiRequest<ApiResponse<AuthUser>>(API_ENDPOINTS.SIGNUP, {
      method: "POST",
      data,
    });
  },

  login(data: { email: string; password: string }) {
    return apiRequest<ApiResponse<AuthUser>>(API_ENDPOINTS.LOGIN, {
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

  initializeUpload(data: InitUploadRequest) {
    return apiRequest<ApiResponse<InitUploadResponse>>(
      API_ENDPOINTS.DOCUMENTS_INIT_UPLOAD,
      {
        method: "POST",
        data,
      },
    );
  },
};
