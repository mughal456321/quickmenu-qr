export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/** Socket.IO lives at the API origin, not under `/api/v1` (docs/03 section 3.7). */
export const WS_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export interface ApiErrorDetail {
  field?: string;
  issue?: string;
  itemId?: string;
  name?: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[]
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface ApiEnvelope<T> {
  data: T;
  warnings?: string[];
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

/**
 * The access token is held in memory only (NFR-S3). The refresh token stays in
 * the HttpOnly cookie, so a reload recovers the session with `POST /auth/refresh`.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function fetchEnvelope<T>(
  path: string,
  init: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK_ERROR",
      "We could not reach the server. Check your connection and try again."
    );
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const body = (await response.json().catch(() => null)) as
    | (ApiEnvelope<T> & {
        error?: { code?: string; message?: string; details?: ApiErrorDetail[] };
      })
    | null;

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? "The request failed. Please try again.",
      body?.error?.details
    );
  }

  if (!body || body.data === undefined) {
    throw new ApiRequestError(
      response.status,
      "INTERNAL_ERROR",
      "The server returned an unexpected response."
    );
  }

  return body;
}

/** Request that resolves to the envelope's `data` value. */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return (await fetchEnvelope<T>(path, init)).data;
}

/** Request that keeps `warnings` and `meta` (public menu, paginated lists). */
export async function apiEnvelope<T>(
  path: string,
  init: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  return fetchEnvelope<T>(path, init);
}

/** Request for endpoints that intentionally return 204. */
export async function apiVoid(
  path: string,
  init: RequestInit = {}
): Promise<void> {
  await fetchEnvelope<unknown>(path, init);
}

/** Binary download (QR PNG/PDF) with the in-memory access token. */
export async function apiBlob(
  path: string,
  init: RequestInit = {}
): Promise<Blob> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      "DOWNLOAD_FAILED",
      "Could not download this file."
    );
  }
  return response.blob();
}

export function formatPrice(value: number, currency = "PKR"): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function toMinor(value: number): number {
  return Math.round(value * 100);
}
