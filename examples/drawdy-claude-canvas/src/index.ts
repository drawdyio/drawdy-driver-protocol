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

// Claude's mark, in brand orange so it reads as Claude in the rail and drawer header.
const ACTION_BUTTON_SVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none"><path d="M7.66976 3.43944C7.49824 3.0964 7.0811 2.95735 6.73806 3.12888C6.39502 3.3004 6.25598 3.71753 6.4275 4.06057L8.38978 7.98513L5.1851 5.78192C4.86906 5.56464 4.43672 5.6447 4.21943 5.96075C4.00215 6.27679 4.08222 6.70914 4.39826 6.92642L8.19794 9.53868L3.78651 9.30653C3.40351 9.28639 3.07669 9.58049 3.05653 9.96347C3.03638 10.3465 3.33051 10.6733 3.71352 10.6935L7.73741 10.9053L4.75369 12.8944C4.43458 13.1072 4.34835 13.5383 4.56109 13.8574C4.77384 14.1765 5.205 14.2628 5.52412 14.0501L8.05338 12.3639L6.30992 14.8047C6.087 15.1168 6.15929 15.5505 6.47138 15.7734C6.78347 15.9963 7.21719 15.9241 7.44011 15.6119L9.5466 12.6628L8.96778 16.1358C8.90472 16.5142 9.16035 16.8719 9.53861 16.935C9.91694 16.9981 10.2747 16.7425 10.3378 16.3642L10.8947 13.0231L12.5408 15.5839C12.7483 15.9065 13.1779 15.9999 13.5006 15.7925C13.8232 15.5851 13.9166 15.1554 13.7092 14.8328L12.469 12.9036L14.3901 14.6769C14.6719 14.9371 15.1113 14.9195 15.3714 14.6377C15.6315 14.3559 15.614 13.9165 15.3322 13.6564L13.2241 11.7105L16.1639 12.078C16.5444 12.1256 16.8915 11.8556 16.9391 11.475C16.9867 11.0944 16.7167 10.7474 16.3362 10.6998L13.4265 10.3361L16.4091 9.63431C16.7824 9.54646 17.0138 9.17264 16.926 8.7993C16.8381 8.42594 16.4643 8.19451 16.091 8.28235L12.2097 9.19562L15.0599 5.56794C15.2969 5.26636 15.2445 4.82979 14.9429 4.59284C14.6414 4.35588 14.2048 4.40827 13.9678 4.70985L11.2899 8.11816L11.9014 4.20443C11.9606 3.8255 11.7015 3.47031 11.3225 3.4111C10.9435 3.3519 10.5884 3.61108 10.5292 3.99002L9.91389 7.92774L7.66976 3.43944Z" fill="#E96C48"/></svg>`;

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
            post({ type: "theme", theme: e.body.styling.theme });
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
            post({ type: "theme", theme: driver.styling.theme });
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
        theme: driver.styling.theme,
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
