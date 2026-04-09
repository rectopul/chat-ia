export function extractAiErrorMessage(error: unknown): string {
    const candidate = error as
        | {
              response?: {
                  data?: {
                      description?: unknown;
                      message?: unknown;
                  };
              };
              message?: unknown;
          }
        | undefined;

    const message =
        candidate?.response?.data?.description ??
        candidate?.response?.data?.message ??
        candidate?.message;

    return typeof message === "string"
        ? message
        : JSON.stringify(message ?? error);
}

export function isAiQuotaError(error: unknown): boolean {
    const message = extractAiErrorMessage(error).toUpperCase();

    return (
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("QUOTA") ||
        message.includes("RATE LIMIT") ||
        message.includes("TOO MANY REQUESTS") ||
        message.includes("[429")
    );
}

export function isAiServiceBusyError(error: unknown): boolean {
    const message = extractAiErrorMessage(error).toUpperCase();

    return (
        message.includes("[503") ||
        message.includes("503 SERVICE UNAVAILABLE") ||
        message.includes("SERVICE UNAVAILABLE") ||
        message.includes("HIGH DEMAND") ||
        message.includes("TRY AGAIN LATER")
    );
}

export function isAiRetryableError(error: unknown): boolean {
    return isAiQuotaError(error) || isAiServiceBusyError(error);
}
