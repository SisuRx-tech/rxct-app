import { reportError } from "./reportError";

export async function executeRequest(operation, request, context = {}) {
  const startedAt = Date.now();

  try {
    return await request();
  } catch (error) {
    const diagnostic = reportError({
      operation,
      error,
      durationMs: Date.now() - startedAt,
      query: context.query || null,
    });

    const appError = new Error(error?.message || "Request failed", {
      cause: error,
    });

    Object.assign(appError, {
      code: error?.code,
      status: error?.status || error?.statusCode,
      details: error?.details,
      hint: error?.hint,
      diagnostic,
    });

    throw appError;
  }
}