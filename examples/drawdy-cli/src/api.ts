export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly code?: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export interface ApiTarget {
    apiUrl: string;
    token?: string;
}

interface RequestOptions {
    method?: "GET" | "POST";
    body?: unknown;
}

export async function apiFetch<T>(
    target: ApiTarget,
    path: string,
    options: RequestOptions = {}
): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${target.apiUrl}${path}`, {
            method: options.method ?? "GET",
            headers: {
                "content-type": "application/json",
                ...(target.token
                    ? { authorization: `Bearer ${target.token}` }
                    : {}),
            },
            ...(options.body !== undefined
                ? { body: JSON.stringify(options.body) }
                : {}),
        });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new ApiError(
            0,
            `Could not reach ${target.apiUrl} (${detail})`
        );
    }

    let payload: unknown = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }

    if (!res.ok) {
        const body = (payload ?? {}) as {
            error?: string;
            error_description?: string;
            message?: string;
        };
        throw new ApiError(
            res.status,
            body.error_description ||
                body.message ||
                body.error ||
                `Request failed with status ${res.status}`,
            body.error
        );
    }

    return payload as T;
}
