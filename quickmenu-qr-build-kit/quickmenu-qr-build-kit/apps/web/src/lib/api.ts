export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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

interface ApiEnvelope<T> {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: ApiErrorDetail[];
  };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

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

  return body.data;
}

export function formatPrice(value: number, currency = "PKR"): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function toMinor(value: number): number {
  return Math.round(value * 100);
}
