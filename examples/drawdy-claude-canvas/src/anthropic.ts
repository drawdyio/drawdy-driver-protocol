// Minimal Anthropic Messages API client. The driver runs inside a sandboxed
// worker (opaque origin), so this is a direct browser-style fetch — hence the
// anthropic-dangerous-direct-browser-access header.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 8192;

export type ImageMediaType =
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif";

export type TextBlock = { type: "text"; text: string };

export type ImageBlock = {
    type: "image";
    source: { type: "base64"; media_type: ImageMediaType; data: string };
};

export type ToolUseBlock = {
    type: "tool_use";
    id: string;
    name: string;
    input: unknown;
};

export type ToolResultBlock = {
    type: "tool_result";
    tool_use_id: string;
    content: (TextBlock | ImageBlock)[];
    is_error?: boolean;
};

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock;

export type ApiMessage = {
    role: "user" | "assistant";
    content: (ContentBlock | ToolResultBlock)[];
};

export type ToolDefinition = {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
};

export type MessagesResult = {
    content: ContentBlock[];
    stop_reason: string | null;
};

export class AnthropicError extends Error {}

export async function callMessages(args: {
    apiKey: string;
    model: string;
    system: string;
    messages: ApiMessage[];
    tools: ToolDefinition[];
    signal: AbortSignal;
}): Promise<MessagesResult> {
    const response = await fetch(API_URL, {
        method: "POST",
        signal: args.signal,
        headers: {
            "content-type": "application/json",
            "x-api-key": args.apiKey,
            "anthropic-version": API_VERSION,
            "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
            model: args.model,
            max_tokens: MAX_TOKENS,
            system: args.system,
            messages: args.messages,
            tools: args.tools,
        }),
    });

    if (!response.ok) {
        throw new AnthropicError(await extractError(response));
    }

    const body = (await response.json()) as {
        content?: ContentBlock[];
        stop_reason?: string | null;
    };
    return {
        content: body.content ?? [],
        stop_reason: body.stop_reason ?? null,
    };
}

async function extractError(response: Response): Promise<string> {
    const fallback = `Anthropic API error (${response.status})`;
    try {
        const body = (await response.json()) as {
            error?: { message?: string };
        };
        const message = body.error?.message;
        if (!message) return fallback;
        if (response.status === 401) {
            return `Invalid API key: ${message}`;
        }
        return message;
    } catch {
        return fallback;
    }
}
