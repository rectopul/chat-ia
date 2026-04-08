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
