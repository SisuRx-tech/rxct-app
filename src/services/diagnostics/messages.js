const ERROR_MESSAGES = {
  NETWORK: {
    title: "Connection problem",
    message:
      "RxCT couldn't reach the server. Check your internet connection and try again.",
    action: "Retry",
  },

  TIMEOUT: {
    title: "Request took too long",
    message:
      "The server didn't respond in time. Your connection may be slow, or the service may be busy.",
    action: "Try again",
  },

  DATABASE: {
    title: "Information retrieval failed",
    message:
      "RxCT encountered a problem retrieving this information. Please try again shortly.",
    action: "Retry",
  },

  PERMISSION: {
    title: "Access restricted",
    message:
      "Your account doesn't currently have permission to access this information.",
    action: "Check access",
  },

  NOT_FOUND: {
    title: "Information not found",
    message:
      "RxCT couldn't retrieve the requested record. It may not exist or may no longer be available.",
    action: "Go back",
  },

  VALIDATION: {
    title: "Request could not be processed",
    message:
      "Something about this request wasn't accepted. Check your input and try again.",
    action: "Review input",
  },

  SERVER: {
    title: "Service temporarily unavailable",
    message:
      "RxCT is having trouble processing your request. Please try again shortly.",
    action: "Retry",
  },

  UNKNOWN: {
    title: "Something went wrong",
    message:
      "RxCT encountered an unexpected problem. Please try again.",
    action: "Retry",
  },
};

export function getUserErrorMessage(category) {
  return ERROR_MESSAGES[category] || ERROR_MESSAGES.UNKNOWN;
}