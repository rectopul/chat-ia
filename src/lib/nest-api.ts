type NestApiOptions = {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: HeadersInit;
    body?: BodyInit | null;
};

export function getNestApiBaseUrl(): string {
    const baseUrl =
        process.env.NEST_API_URL ||
        process.env.API_URL ||
        process.env.NEXT_PUBLIC_NEST_API_URL;

    if (!baseUrl) {
        throw new Error("NEST_API_URL is not configured");
    }

    return baseUrl.replace(/\/$/, "");
}

export async function fetchNestApiJson<T>(
    path: string,
    options: NestApiOptions = {},
): Promise<T> {
    const response = await fetch(`${getNestApiBaseUrl()}${path}`, {
        method: options.method ?? "GET",
        headers: {
            Accept: "application/json",
            ...options.headers,
        },
        body: options.body ?? null,
        cache: "no-store",
    });

    const rawText = await response.text();
    let payload: any = null;

    if (rawText) {
        try {
            payload = JSON.parse(rawText);
        } catch {
            payload = rawText;
        }
    }

    if (!response.ok) {
        const message =
            payload?.message ||
            payload?.error ||
            `Nest API request failed with status ${response.status}`;
        throw new Error(message);
    }

    return payload as T;
}
