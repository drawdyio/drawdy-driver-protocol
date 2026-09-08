import {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { WEBVIEW_HTML } from "virtual:webview-html";
import {
    ChatEntry,
    DEFAULT_MODEL,
    DriverToWebview,
    ModelId,
    MODELS,
    WebviewToDriver,
} from "../shared/messages";
import { buildSystemPrompt, runTurn } from "./agent";
import { ApiMessage } from "./anthropic";
import { DriverContext } from "./driver-context";
import {
    clearConversation,
    deleteApiKey,
    loadApiKey,
    loadConversation,
    loadModel,
    saveApiKey,
    saveConversation,
    saveModel,
} from "./storage";

// Claude's spark.
const ACTION_BUTTON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="currentColor" class="text-white/60"><path d="M12 2l1.8 6.1a3 3 0 0 0 2.1 2.1L22 12l-6.1 1.8a3 3 0 0 0-2.1 2.1L12 22l-1.8-6.1a3 3 0 0 0-2.1-2.1L2 12l6.1-1.8a3 3 0 0 0 2.1-2.1L12 2z"></path></svg>`;

let requestId = 0;

type ChatState = {
    entries: ChatEntry[];
    apiMessages: ApiMessage[];
    running: boolean;
    abort: AbortController | null;
    apiKey: string | null;
    keyNotice: string | undefined;
    model: ModelId;
    /** Lazy first-load of persisted state; resolved once. */
    loaded: Promise<void> | null;
};

let driver: {
    manifest: DriverManifest;
    issueCommand: DriverCommandIssuer;
    actionButtonId: string;
    webviewId: string;
    styling: ModuleStyling;
    ctx: DriverContext;
    chat: ChatState;
} | null = null;

/**
 * ModuleStyling as `--drawdy-*` css variable declarations for the webview's
 * `:root` placeholder, e.g. `primaryForeground` -> `--drawdy-primary-foreground`.
 */
function stylingCssVars(styling: ModuleStyling): string {
    const stringified = Object.entries(styling)
        .map(([key, value]) =>
            key === "theme"
                ? `color-scheme: ${value};`
                : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`
        )
        .join("");
    return stringified;
}

export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
    styling,
    generateId,
}) => {
    const ctx: DriverContext = {
        driverId: manifest.driverId,
        issueCommand,
        generateId,
        nextRequestId: () => String(requestId++),
        getStyling: () => driver?.styling ?? styling,
    };
    driver = {
        manifest,
        issueCommand,
        actionButtonId: `${manifest.driverId}:action-button`,
        webviewId: `${manifest.driverId}:webview`,
        styling,
        ctx,
        chat: {
            entries: [],
            apiMessages: [],
            running: false,
            abort: null,
            apiKey: null,
            keyNotice: undefined,
            model: DEFAULT_MODEL,
            loaded: null,
        },
    };

    const response = await issueCommand({
        type: "command:dom:create-action-button",
        driverId: manifest.driverId,
        requestId: ctx.nextRequestId(),
        req: {
            domElementId: driver.actionButtonId,
            svg: ACTION_BUTTON_SVG,
        },
    });
    if (!response.res.value?.created) {
        return;
    }

    await issueCommand({
        type: "subscription:dom:theme-changed",
        driverId: manifest.driverId,
        requestId: ctx.nextRequestId(),
    });

    await issueCommand({
        type: "subscription:dom:element-clicked",
        driverId: manifest.driverId,
        requestId: ctx.nextRequestId(),
        req: { domElementId: driver.actionButtonId },
    });

    await issueCommand({
        type: "subscription:webview:message",
        driverId: manifest.driverId,
        requestId: ctx.nextRequestId(),
        req: { webviewDomId: driver.webviewId },
    });
};

export const onEvent: DriverModule["onEvent"] = async (e) => {
    if (!driver) return;
    switch (e.type) {
        case "subscription:dom:theme-changed": {
            driver.styling = e.body.styling;
            return;
        }
        case "subscription:dom:element-clicked": {
            if (e.body.domElementId !== driver.actionButtonId) return;
            await driver.issueCommand({
                type: "command:webview:create",
                driverId: driver.manifest.driverId,
                requestId: driver.ctx.nextRequestId(),
                req: {
                    webviewDomId: driver.webviewId,
                    htmlContent: WEBVIEW_HTML.replace(
                        "/*__DRAWDY_STYLING__*/",
                        stylingCssVars(driver.styling)
                    ),
                    keepStateWhenClosed: true,
                },
            });
            return;
        }
        case "subscription:webview:message": {
            if (e.body.webviewDomId !== driver.webviewId) return;
            const message = e.body.message;
            if (typeof message !== "object" || message === null) return;
            await handleWebviewMessage(message as WebviewToDriver);
            return;
        }
        default: {
            return;
        }
    }
};

function post(message: DriverToWebview): void {
    if (!driver) return;
    void driver.issueCommand({
        type: "command:webview:post-message",
        driverId: driver.manifest.driverId,
        requestId: driver.ctx.nextRequestId(),
        req: { webviewDomId: driver.webviewId, message },
    });
}

function postInit(): void {
    if (!driver) return;
    const { chat } = driver;
    post({
        type: "init",
        hasApiKey: chat.apiKey !== null,
        model: chat.model,
        entries: chat.entries,
        running: chat.running,
        keyNotice: chat.keyNotice,
    });
}

/** First-ready hydration from kv + secure storage; later readies reuse it. */
function ensureLoaded(): Promise<void> {
    const { chat, ctx } = driver!;
    if (chat.loaded) return chat.loaded;
    chat.loaded = (async () => {
        chat.model = await loadModel(ctx);
        chat.entries = await loadConversation(ctx);
        chat.apiMessages = chat.entries.map((entry) => ({
            role: entry.role,
            content: [{ type: "text" as const, text: entry.text }],
        }));
        try {
            chat.apiKey = await loadApiKey(ctx);
        } catch (err) {
            // Typically "sign in to use secure storage" — chat still works
            // with a session-only key.
            chat.apiKey = null;
            chat.keyNotice = err instanceof Error ? err.message : String(err);
        }
    })();
    return chat.loaded;
}

async function handleWebviewMessage(message: WebviewToDriver): Promise<void> {
    if (!driver) return;
    const { chat, ctx } = driver;
    switch (message.type) {
        case "ready": {
            await ensureLoaded();
            postInit();
            return;
        }
        case "set-api-key": {
            const apiKey = message.apiKey.trim();
            if (apiKey.length === 0) return;
            chat.apiKey = apiKey;
            try {
                await saveApiKey(ctx, apiKey);
                chat.keyNotice = undefined;
            } catch (err) {
                chat.keyNotice = `${err instanceof Error ? err.message : String(err)} — your key is kept for this session only.`;
            }
            postInit();
            return;
        }
        case "clear-api-key": {
            chat.apiKey = null;
            chat.keyNotice = undefined;
            try {
                await deleteApiKey(ctx);
            } catch {
                // Nothing persisted to delete (e.g. signed out).
            }
            postInit();
            return;
        }
        case "set-model": {
            if (!MODELS.some((m) => m.id === message.model)) return;
            chat.model = message.model;
            try {
                await saveModel(ctx, message.model);
            } catch {
                // Session-only fallback is fine for a model preference.
            }
            return;
        }
        case "clear-conversation": {
            chat.abort?.abort();
            chat.entries = [];
            chat.apiMessages = [];
            try {
                await clearConversation(ctx);
            } catch {
                // Nothing persisted.
            }
            postInit();
            return;
        }
        case "stop": {
            chat.abort?.abort();
            return;
        }
        case "chat": {
            await handleChat(message.text);
            return;
        }
    }
}

async function handleChat(rawText: string): Promise<void> {
    if (!driver) return;
    const { chat, ctx } = driver;
    const text = rawText.trim();
    if (text.length === 0 || chat.running) return;
    if (!chat.apiKey) {
        post({
            type: "turn-error",
            message: "Add your Anthropic API key first.",
        });
        post({ type: "turn-done" });
        return;
    }

    chat.entries.push({ role: "user", text });
    chat.apiMessages.push({ role: "user", content: [{ type: "text", text }] });
    chat.running = true;
    chat.abort = new AbortController();

    try {
        await runTurn({
            apiKey: chat.apiKey,
            model: chat.model,
            system: buildSystemPrompt(driver.styling),
            messages: chat.apiMessages,
            ctx,
            signal: chat.abort.signal,
            onAssistantText: (assistantText) => {
                chat.entries.push({ role: "assistant", text: assistantText });
                post({ type: "assistant-message", text: assistantText });
            },
            onStatus: (label) => post({ type: "turn-status", label }),
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            // The user hit stop; whatever text already streamed out stands.
        } else {
            post({
                type: "turn-error",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    } finally {
        chat.running = false;
        chat.abort = null;
        post({ type: "turn-done" });
        try {
            await saveConversation(ctx, chat.entries);
        } catch {
            // Persistence is best-effort; the in-memory transcript stands.
        }
    }
}
