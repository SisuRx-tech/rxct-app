import { classifyError } from "./classifyError";
import { getUserErrorMessage } from "./messages";

function generateRequestId() {
  if (globalThis.crypto?.randomUUID) {
return `rxct_${globalThis.crypto.randomUUID()}`;
  }

  return `rxct_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function reportError({
  operation,
  error,
  durationMs,
  query = null,
}) {
  const category = classifyError(error);

  const diagnostic = {
    requestId: generateRequestId(),
    timestamp: new Date().toISOString(),
    operation,
    category,
    durationMs,
    query,
    error: {
      name: error?.name || "UnknownError",
      code: error?.code || null,
      status: error?.status || error?.statusCode || null,
      message: error?.message || "Unknown error",
      details: error?.details || null,
      hint: error?.hint || null,
    },
  };

  if (import.meta.env.DEV) {
    console.error("[RxCT Diagnostic]", diagnostic);
  }

  return {
    ...diagnostic,
    userMessage: getUserErrorMessage(category),
  };
}