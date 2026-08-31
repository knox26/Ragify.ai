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
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
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

/** One row of the lightweight /statuses poll — only non-terminal docs. */
export interface DocumentStatusInfo {
  id: string;
  status: DocumentStatus;
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

export type ChatRole = "USER" | "ASSISTANT";

export interface ChatSource {
  n: number;
  documentId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  quote: string;
  score: number;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  documentId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: { role: ChatRole; content: string; createdAt: string } | null;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  sources: ChatSource[] | null;
  error: boolean;
  createdAt: string;
}

export type StreamChunk =
  | {
      type: "meta";
      sessionId: string;
      messageId: string;
      title: string;
      documentId: string | null;
    }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; sources: ChatSource[] }
  | { type: "error"; message: string };

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

// ---- Streaming ----

// Raw fetch (not axios) — axios buffers the whole body; we need the
// ReadableStream to render deltas as they arrive.
export interface StreamChatParams {
  sessionId?: string;
  documentId?: string | null;
  content: string;
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}

export async function streamChatMessage({
  sessionId,
  documentId,
  content,
  signal,
  onChunk,
}: StreamChatParams): Promise<{ sessionId: string; messageId: string }> {
  const body: Record<string, unknown> = { content };
  if (sessionId) {
    body.sessionId = sessionId;
  } else if (documentId) {
    body.documentId = documentId;
  }

  const doFetch = (): Promise<Response> =>
    fetch(`${API_BASE_URL}${API_ENDPOINTS.CHATS_MESSAGE}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

  let response = await doFetch();

  // Pre-stream 401 — the stream never started, so retrying after a refresh
  // can't double-run the LLM.
  if (response.status === 401) {
    const refreshed = await attemptTokenRefresh();

    if (refreshed) {
      response = await doFetch();
    } else {
      throw new ApiError("Your session expired. Sign in again to continue.", 401);
    }
  }

  if (!response.ok) {
    let message = "Request failed";

    try {
      const data: unknown = await response.json();
      const parsed = data as { message?: unknown };

      if (typeof parsed?.message === "string") {
        message = parsed.message;
      }

      throw new ApiError(message, response.status, data as Record<string, unknown>);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(message, response.status);
    }
  }

  if (!response.body) {
    throw new ApiError("Stream unavailable", 0, {});
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastMeta: (StreamChunk & { type: "meta" }) | null = null;

  const processLine = (line: string): void => {
    const trimmed = line.trim(); // survive CRLF
    if (!trimmed) {
      return;
    }

    let parsed: StreamChunk;

    try {
      parsed = JSON.parse(trimmed) as StreamChunk;
    } catch {
      return; // malformed line — keep streaming
    }

    if (parsed.type === "meta") {
      lastMeta = parsed;
    }

    onChunk(parsed);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        processLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      const abortError = new Error("Stream aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    throw error;
  }

  // Flush any trailing partial line — the final chunk may have no newline.
  if (buffer.length > 0) {
    processLine(buffer);
  }

  if (!lastMeta) {
    throw new ApiError(
      "The server did not return a response. Try again.",
      0,
      {},
    );
  }

  // lastMeta is assigned inside the processLine closure, so TS's control-flow
  // analysis can't narrow it past the guard — assert the known shape instead.
  const meta = lastMeta as StreamChunk & { type: "meta" };

  return { sessionId: meta.sessionId, messageId: meta.messageId };
}

// ---- Paginated list fetching ----

// List endpoints are keyset-paginated on the server (limit + opaque cursor).
// Each getter below returns a SINGLE page; consumers drive pagination with
// useInfiniteQuery, so hasMore/nextCursor come straight from the server and
// there is no client-side cap, no loop, and no silent truncation. A failed
// page fails that page alone — already-loaded pages stay rendered.
export interface PageParams {
  cursor?: string | null;
}

export interface MessagePageParams extends PageParams {
  /** "desc" = newest-first (chat history); "asc" = forward from the start. */
  dir?: "asc" | "desc";
}

export interface DocumentsPageParams extends PageParams {
  /** Case-insensitive fileName filter, applied server-side. */
  search?: string;
  /** Optional status filter, applied server-side. */
  status?: DocumentStatus;
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

  getDocuments(params: DocumentsPageParams = {}) {
    return apiRequest<ApiResponse<Document[]>>(
      API_ENDPOINTS.DOCUMENTS_GET_DOCUMENTS,
      {
        method: "GET",
        params: {
          limit: 100,
          ...(params.cursor ? { cursor: params.cursor } : {}),
          ...(params.search ? { search: params.search } : {}),
          ...(params.status ? { status: params.status } : {}),
        },
      },
    );
  },

  getDocumentCount(params: { status?: DocumentStatus } = {}) {
    return apiRequest<ApiResponse<{ count: number }>>(
      API_ENDPOINTS.DOCUMENTS_COUNT,
      {
        method: "GET",
        params: params.status ? { status: params.status } : {},
      },
    );
  },

  getDocument(id: string) {
    return apiRequest<ApiResponse<Pick<Document, "id" | "fileName">>>(
      API_ENDPOINTS.DOCUMENT(id),
      { method: "GET" },
    );
  },

  getDocumentStatuses(cursor?: string) {
    return apiRequest<ApiResponse<DocumentStatusInfo[]>>(
      API_ENDPOINTS.DOCUMENTS_STATUSES,
      {
        method: "GET",
        params: cursor ? { cursor } : {},
      },
    );
  },

  getChatSessions(params: PageParams = {}) {
    return apiRequest<ApiResponse<ChatSessionSummary[]>>(API_ENDPOINTS.CHATS, {
      method: "GET",
      params: { limit: 100, ...(params.cursor ? { cursor: params.cursor } : {}) },
    });
  },

  getChatSession(id: string) {
    return apiRequest<ApiResponse<ChatSessionSummary>>(API_ENDPOINTS.CHAT(id), {
      method: "GET",
    });
  },

  getChatMessages(id: string, params: MessagePageParams = {}) {
    return apiRequest<ApiResponse<ChatMessage[]>>(
      API_ENDPOINTS.CHATS_MESSAGES(id),
      {
        method: "GET",
        params: {
          limit: 100,
          ...(params.cursor ? { cursor: params.cursor } : {}),
          ...(params.dir ? { dir: params.dir } : {}),
        },
      },
    );
  },

  renameChat(id: string, title: string) {
    return apiRequest<ApiResponse>(API_ENDPOINTS.CHATS_RENAME(id), {
      method: "PATCH",
      data: { title },
    });
  },

  deleteChat(id: string) {
    return apiRequest<ApiResponse>(API_ENDPOINTS.CHATS_DELETE(id), {
      method: "DELETE",
    });
  },
};
