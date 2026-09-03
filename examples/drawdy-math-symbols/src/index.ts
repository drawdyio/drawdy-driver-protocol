import {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { DriverToWebview, WebviewToDriver } from "./shared/messages";
import { interpretLatex } from "./latex";
import { CATEGORIES } from "./symbols";
import { WEBVIEW_HTML } from "./webview-html";

// Sigma, sketched like a drop shadow.
const ACTION_BUTTON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white/70"><path d="M18 4H6l7 8-7 8h12"/></svg>`;

/** How long the typed text must settle before we re-interpret it as latex. */
const LATEX_DEBOUNCE_MS = 100;

type CanvasRect = { x: number; y: number; width: number; height: number };

let requestId = 0;

let driver: {
    manifest: DriverManifest;
    issueCommand: DriverCommandIssuer;
    generateId: () => string;
    styling: ModuleStyling;
    actionButtonId: string;
    webviewId: string;
    /**
     * The latex interpretation currently offered as a greyed-out preview, or
     * null when nothing is showing. `previewId` is the batch to delete; the
     * rest lets a Tab press accept it.
     */
    latex: {
        previewId: string;
        interpreted: string;
        rect: CanvasRect;
    } | null;
    latexDebounce: ReturnType<typeof setTimeout> | null;
    /**
     * Bumped on every text tick and on accept. An in-flight `create` whose
     * generation is stale deletes the batch it just made instead of keeping it,
     * so a preview never lingers after the edit it belonged to ended.
     */
    latexGen: number;
} | null = null;

const nextRequestId = (): string => String(requestId++);

/**
 * ModuleStyling as `--drawdy-*` css variable declarations for the webview's
 * `:root` placeholder, e.g. `mutedForeground` -> `--drawdy-muted-foreground`.
 */
function stylingCssVars(styling: ModuleStyling): string {
    return Object.entries(styling)
        .map(([key, value]) =>
            key === "theme"
                ? `color-scheme: ${value};`
                : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`
        )
        .join("");
}

function post(message: DriverToWebview): void {
    if (!driver) return;
    void driver.issueCommand({
        type: "command:webview:post-message",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { webviewDomId: driver.webviewId, message },
    });
}

export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
    styling,
    generateId,
}) => {
    driver = {
        manifest,
        issueCommand,
        generateId,
        styling,
        actionButtonId: `${manifest.driverId}:action-button`,
        webviewId: `${manifest.driverId}:webview`,
        latex: null,
        latexDebounce: null,
        latexGen: 0,
    };

    const response = await issueCommand({
        type: "command:dom:create-action-button",
        driverId: manifest.driverId,
        requestId: nextRequestId(),
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
        requestId: nextRequestId(),
    });

    await issueCommand({
        type: "subscription:dom:element-clicked",
        driverId: manifest.driverId,
        requestId: nextRequestId(),
        req: { domElementId: driver.actionButtonId },
    });

    await issueCommand({
        type: "subscription:webview:message",
        driverId: manifest.driverId,
        requestId: nextRequestId(),
        req: { webviewDomId: driver.webviewId },
    });

    // Watch text editing + Tab so we can offer latex glyph previews inline.
    await issueCommand({
        type: "subscription:scene:text-edit",
        driverId: manifest.driverId,
        requestId: nextRequestId(),
    });

    await issueCommand({
        type: "subscription:keyboard:control-keys",
        driverId: manifest.driverId,
        requestId: nextRequestId(),
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
                requestId: nextRequestId(),
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
        case "subscription:scene:text-edit": {
            if (e.body.type !== "update") {
                void clearLatexPreview();
                return;
            }
            onTextPreview(e.body);
            return;
        }
        case "subscription:keyboard:control-keys": {
            if (e.body.key === "tab") {
                await acceptLatexPreview();
            }
            return;
        }
        default: {
            return;
        }
    }
};

/**
 * Text-editing tick. On `update` we (re)arm a short debounce and then decide
 * whether the text interprets as latex; commit/cancel just tears any preview
 * down. Debouncing keeps us off the hot path of every keystroke.
 */
function onTextPreview(body: {
    type: "update";
    rect: CanvasRect;
    font: number;
    text?: string;
}): void {
    if (!driver) return;

    // Every tick supersedes an in-flight create from a prior tick.
    driver.latexGen++;

    if (driver.latexDebounce !== null) {
        clearTimeout(driver.latexDebounce);
        driver.latexDebounce = null;
    }

    const text = body.text ?? "";
    const { rect } = body;
    driver.latexDebounce = setTimeout(() => {
        if (!driver) return;
        driver.latexDebounce = null;
        const interpreted = interpretLatex(text);
        if (interpreted === null || interpreted === text) {
            void clearLatexPreview();
            return;
        }
        void renderLatexPreview(interpreted, rect);
    }, LATEX_DEBOUNCE_MS);
}

async function handleWebviewMessage(message: WebviewToDriver): Promise<void> {
    if (!driver) return;
    switch (message.type) {
        case "ready": {
            post({ type: "init", categories: CATEGORIES });
            return;
        }
        case "drop-glyph": {
            await placeGlyph(message.glyph, message.x, message.y);
            return;
        }
        case "insert-glyph": {
            await insertAtViewportCenter(message.glyph);
            return;
        }
    }
}

/**
 * Adds the glyph centered on a canvas point, styled like the text tool so a
 * dropped symbol matches what the user would type. Font size is in canvas units
 * (it scales with zoom like real text), and the glyph is centered in a box so it
 * lands on the point.
 */
async function insertGlyph(
    glyph: string,
    canvasX: number,
    canvasY: number
): Promise<void> {
    if (!driver) return;
    const { fontSize, color } = await queryTextStyle();
    if (!driver) return;
    const width = fontSize * 2;
    await driver.issueCommand({
        type: "command:scene:add-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: {
            elements: [
                {
                    type: "text",
                    drawdyElementId: driver.generateId(),
                    // Anchor the glyph on the point.
                    x: canvasX - width / 2,
                    y: canvasY - fontSize / 2,
                    width,
                    text: glyph,
                    fontSize,
                    color,
                    textAlign: "center",
                },
            ],
        },
    });
}

/**
 * `x`/`y` are the drop point in the palette iframe's viewport. Offset them by
 * the iframe's position on the page, then convert to canvas space. A drop that
 * lands back inside the palette itself is a cancelled drag — ignore it.
 */
async function placeGlyph(
    glyph: string,
    iframeX: number,
    iframeY: number
): Promise<void> {
    if (!driver) return;

    const rectRes = await driver.issueCommand({
        type: "command:dom:element-rect",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { elementId: driver.webviewId },
    });
    if (rectRes.res.error !== undefined) return;
    const rect = rectRes.res.value;

    const insidePalette =
        iframeX >= 0 &&
        iframeY >= 0 &&
        iframeX <= rect.width &&
        iframeY <= rect.height;
    if (insidePalette) return;

    const canvasRes = await driver.issueCommand({
        type: "command:camera:screen-to-canvas",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { x: rect.x + iframeX, y: rect.y + iframeY },
    });
    if (canvasRes.res.error !== undefined) return;
    const { x, y } = canvasRes.res.value;

    await insertGlyph(glyph, x, y);
}

/** Drops the glyph at the center of the visible canvas. */
async function insertAtViewportCenter(glyph: string): Promise<void> {
    if (!driver) return;
    const res = await driver.issueCommand({
        type: "command:camera:get-viewport-rect",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
    });
    if (res.res.error !== undefined) return;
    const { rect } = res.res.value;
    await insertGlyph(glyph, rect.x + rect.width / 2, rect.y + rect.height / 2);
}

/** Explicitly deletes one preview batch by id. */
async function deletePreviewBatch(previewId: string): Promise<void> {
    if (!driver) return;
    await driver.issueCommand({
        type: "command:scene:delete-drawdy-preview-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { previewIds: [previewId] },
    });
}

/**
 * The text tool's live style, so the preview and the accepted glyphs match the
 * text being edited. Falls back to defaults if the query fails.
 */
async function queryTextStyle(): Promise<{ fontSize: number; color: string }> {
    const fallback = { fontSize: 24, color: driver!.styling.foreground };
    if (!driver) return fallback;
    const res = await driver.issueCommand({
        type: "command:scene:query-tool-style-state",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { toolId: "text" },
    });
    if (res.res.error !== undefined) return fallback;
    const state = res.res.value.state;
    if (state?.toolId === "text") {
        return { fontSize: state.fontSize, color: state.color };
    }
    return fallback;
}

/**
 * Shows the interpreted glyphs as a greyed-out ghost just past the edited text.
 * The font size comes from the text tool so the ghost matches; its colour stays
 * muted to read as a preview. Each call mints a fresh batch and explicitly
 * deletes the previous one.
 */
async function renderLatexPreview(
    interpreted: string,
    rect: CanvasRect
): Promise<void> {
    if (!driver) return;
    const gen = driver.latexGen;
    const previous = driver.latex?.previewId ?? null;
    const extraPadding = 8;

    const { fontSize } = await queryTextStyle();
    if (!driver || driver.latexGen !== gen) return;

    const res = await driver.issueCommand({
        type: "command:scene:create-drawdy-preview-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: {
            elements: [
                {
                    type: "text",
                    drawdyElementId: driver.generateId(),
                    x: rect.x + rect.width + extraPadding,
                    y: rect.y,
                    text: interpreted,
                    fontSize,
                    color: driver.styling.mutedForeground,
                    textAlign: "left",
                },
            ],
        },
    });
    if (!driver || res.res.error !== undefined) return;
    const { previewId } = res.res.value;

    if (driver.latexGen !== gen) {
        // The edit moved on while we were creating — drop what we just made.
        await deletePreviewBatch(previewId);
        return;
    }
    driver.latex = { previewId, interpreted, rect };
    if (previous) await deletePreviewBatch(previous);
}

/** Tears down the greyed-out preview and forgets it. */
async function clearLatexPreview(): Promise<void> {
    if (!driver || driver.latex === null) return;
    const { previewId } = driver.latex;
    driver.latex = null;
    await deletePreviewBatch(previewId);
}

/**
 * Tab accepted the preview: replace the raw latex the user typed with the
 * interpreted glyphs in place, keeping the text edit open so they can keep
 * typing. Then drop the ghost.
 */
async function acceptLatexPreview(): Promise<void> {
    if (!driver || driver.latex === null) return;
    const { previewId, interpreted } = driver.latex;

    driver.latexGen++;
    driver.latex = null;
    if (driver.latexDebounce !== null) {
        clearTimeout(driver.latexDebounce);
        driver.latexDebounce = null;
    }

    // Swap the raw latex for the interpreted text without leaving the editor.
    await driver.issueCommand({
        type: "command:scene:update-text-edit",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { text: interpreted },
    });
    if (!driver) return;

    // Drop the ghost.
    await deletePreviewBatch(previewId);
}
