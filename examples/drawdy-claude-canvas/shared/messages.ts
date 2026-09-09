// The message protocol between the driver (worker) and the chat webview.
// Imported by both bundles, so the two sides can't drift apart.

export const MODELS = [
    { id: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "claude-fable-5", label: "Fable 5" },
    { id: "claude-opus-5", label: "Opus 5" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
] as const;

export const DEFAULT_MODEL: ModelId = "claude-sonnet-5";

export type ModelId = (typeof MODELS)[number]["id"];

export type Theme = "dark" | "light";

export type ChatEntry = {
    role: "user" | "assistant";
    text: string;
};

/** webview -> driver */
export type WebviewToDriver =
    | { type: "ready" }
    | { type: "chat"; text: string }
    | { type: "stop" }
    | { type: "clear-conversation" }
    | { type: "set-api-key"; apiKey: string }
    | { type: "clear-api-key" }
    | { type: "set-model"; model: ModelId };

/** driver -> webview */
export type DriverToWebview =
    | {
          type: "init";
          theme: Theme;
          hasApiKey: boolean;
          model: ModelId;
          entries: ChatEntry[];
          running: boolean;
          /** Present when the API key could not be persisted (e.g. signed out). */
          keyNotice?: string;
      }
    | { type: "theme"; theme: Theme }
    | { type: "turn-status"; label: string }
    | { type: "assistant-message"; text: string }
    | { type: "turn-done" }
    | { type: "turn-error"; message: string };
