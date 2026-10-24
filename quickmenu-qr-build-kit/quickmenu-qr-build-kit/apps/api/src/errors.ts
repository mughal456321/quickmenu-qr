export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; issue: string }>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function formatError(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  details?: Array<{ field: string; issue: string }>
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId,
    },
  };
}