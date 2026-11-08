const NETWORK_CODES = ["FETCH_ERROR", "NETWORK_ERROR"];

const TIMEOUT_CODES = ["57014", "ETIMEDOUT", "ESOCKETTIMEDOUT"];

const PERMISSION_CODES = ["42501", "401", "403"];

const NOT_FOUND_CODES = ["PGRST116", "404"];

const VALIDATION_CODES = ["22P02", "23502", "23503", "23505"];

export function classifyError(error) {
  const code = String(error?.code || "").toUpperCase();
  const status = Number(error?.status || error?.statusCode);
  const message = String(error?.message || "").toLowerCase();

  if (
    TIMEOUT_CODES.includes(code) ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return "TIMEOUT";
  }

  if (
    NETWORK_CODES.includes(code) ||
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("networkerror")
  ) {
    return "NETWORK";
  }

  if (
    PERMISSION_CODES.includes(code) ||
    status === 401 ||
    status === 403
  ) {
    return "PERMISSION";
  }

  if (
    NOT_FOUND_CODES.includes(code) ||
    status === 404
  ) {
    return "NOT_FOUND";
  }

  if (VALIDATION_CODES.includes(code)) {
    return "VALIDATION";
  }

  if (
    status >= 500 ||
    code.startsWith("08") ||
    code.startsWith("53")
  ) {
    return "SERVER";
  }

  if (code || error?.details || error?.hint) {
    return "DATABASE";
  }

  return "UNKNOWN";
}