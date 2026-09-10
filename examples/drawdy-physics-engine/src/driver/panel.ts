import { ModuleStyling } from "@drawdy/driver-protocol";
import { Ctx, stamp, unwrap } from "./context";
import { physicsMode } from "./meta";
import { PANEL_HTML } from "./panel-html";
import {
    createSandbox,
    defaultRectAround,
    findSandbox,
    resizeSandbox,
} from "./sandbox";
import { PhysicsSession } from "./session";

// Dashed box with a ball resting inside.
export const ACTION_BUTTON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/><circle cx="12" cy="15" r="4"/></svg>`;

export const actionButtonId = (driverId: string): string =>
    `${driverId}:action-button`;
export const panelWebviewId = (driverId: string): string =>
    `${driverId}:webview`;

const FLY_MS = 500;

type PanelRow = { id: string; label: string };

export type WebviewToDriver =
    | { type: "ready" }
    | { type: "resize-sandbox"; width: number; height: number }
    | { type: "fit-sandbox" }
    | { type: "fly-to-sandbox" }
    | { type: "fly-to"; id: string }
    | { type: "untag"; id: string };

export type DriverToWebview =
    | {
          type: "state";
          sandbox: { width: number; height: number } | null;
          statics: PanelRow[];
          dynamics: PanelRow[];
      }
    | { type: "theme"; css: string };

/**
 * ModuleStyling as `--drawdy-*` css variable declarations for the webview's
 * `:root` placeholder, e.g. `mutedForeground` -> `--drawdy-muted-foreground`.
 */
export function stylingCssVars(styling: ModuleStyling): string {
    return Object.entries(styling)
        .map(([key, value]) =>
            key === "theme"
                ? `color-scheme: ${value};`
                : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`
        )
        .join("");
}

export async function openPanel(
    ctx: Ctx,
    styling: ModuleStyling
): Promise<void> {
    await ctx.issueCommand({
        type: "command:webview:create",
        ...stamp(ctx),
        req: {
            webviewDomId: panelWebviewId(ctx.driverId),
            htmlContent: PANEL_HTML.replace(
                "/*__DRAWDY_STYLING__*/",
                stylingCssVars(styling)
            ),
            keepStateWhenClosed: true,
        },
    });
}

export function postToPanel(ctx: Ctx, message: DriverToWebview): void {
    void ctx.issueCommand({
        type: "command:webview:post-message",
        ...stamp(ctx),
        req: { webviewDomId: panelWebviewId(ctx.driverId), message },
    });
}

const rowLabel = (el: {
    text?: string;
    componentType?: string;
    type?: string;
}): string => {
    const text = el.text?.trim();
    if (text) return text.length > 24 ? `${text.slice(0, 24)}…` : text;
    return el.componentType || el.type || "element";
};

export async function postPanelState(ctx: Ctx): Promise<void> {
    const { drawdyElements } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:get-drawdy-elements",
            ...stamp(ctx),
            req: {
                properties: [
                    "meta",
                    "componentType",
                    "type",
                    "text",
                    "x",
                    "y",
                    "width",
                    "height",
                ],
            },
        })
    );
    const sandboxEl = findSandbox(drawdyElements);
    const statics: PanelRow[] = [];
    const dynamics: PanelRow[] = [];
    for (const el of drawdyElements) {
        const mode = physicsMode(el);
        if (mode === "static") {
            statics.push({ id: el.id, label: rowLabel(el) });
        } else if (mode === "dynamic") {
            dynamics.push({ id: el.id, label: rowLabel(el) });
        }
    }
    postToPanel(ctx, {
        type: "state",
        sandbox:
            sandboxEl && sandboxEl.width != null && sandboxEl.height != null
                ? { width: sandboxEl.width, height: sandboxEl.height }
                : null,
        statics,
        dynamics,
    });
}

export async function handlePanelMessage(
    ctx: Ctx,
    session: PhysicsSession,
    msg: WebviewToDriver
): Promise<void> {
    switch (msg.type) {
        case "ready": {
            await postPanelState(ctx);
            return;
        }
        case "resize-sandbox": {
            const els = await fetchGeometry(ctx);
            const sandboxEl = findSandbox(els);
            if (sandboxEl) {
                await resizeSandbox(ctx, sandboxEl, msg.width, msg.height);
                await session.restart();
            }
            await postPanelState(ctx);
            return;
        }
        case "fit-sandbox": {
            const els = await fetchGeometry(ctx);
            const sandboxEl = findSandbox(els);
            const taggedIds = els
                .filter((el) => {
                    const mode = physicsMode(el);
                    return mode === "static" || mode === "dynamic";
                })
                .map((el) => el.id);
            if (taggedIds.length === 0) return;
            const { rect } = unwrap(
                await ctx.issueCommand({
                    type: "command:scene:query-combined-rect",
                    ...stamp(ctx),
                    req: { drawdyElementIds: taggedIds },
                })
            );
            const box = defaultRectAround(rect);
            if (sandboxEl) {
                await resizeSandbox(ctx, sandboxEl, box.w, box.h);
            } else {
                await createSandbox(ctx, box);
            }
            await session.restart();
            await postPanelState(ctx);
            return;
        }
        case "fly-to-sandbox": {
            const els = await fetchGeometry(ctx);
            const sandboxEl = findSandbox(els);
            if (!sandboxEl) return;
            await ctx.issueCommand({
                type: "command:camera:fly-to-elements",
                ...stamp(ctx),
                req: {
                    drawdyElementIds: [sandboxEl.id],
                    flyDurationMs: FLY_MS,
                    zoom: 1,
                },
            });
            return;
        }
        case "fly-to": {
            await ctx.issueCommand({
                type: "command:camera:fly-to-elements",
                ...stamp(ctx),
                req: {
                    drawdyElementIds: [msg.id],
                    flyDurationMs: FLY_MS,
                    zoom: 1,
                },
            });
            return;
        }
        case "untag": {
            unwrap(
                await ctx.issueCommand({
                    type: "command:scene:update-drawdy-elements",
                    ...stamp(ctx),
                    req: {
                        updates: [
                            {
                                drawdyElementId: msg.id,
                                properties: {
                                    meta: { physics: { mode: "none" } },
                                },
                            },
                        ],
                    },
                })
            );
            // Meta-only writes don't reach the running world's update path.
            await session.restart();
            await postPanelState(ctx);
            return;
        }
    }
}

async function fetchGeometry(ctx: Ctx) {
    const { drawdyElements } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:get-drawdy-elements",
            ...stamp(ctx),
            req: {
                properties: [
                    "meta",
                    "componentType",
                    "x",
                    "y",
                    "width",
                    "height",
                    "strokeColor",
                    "fillColor",
                    "strokeWidth",
                    "strokeDash",
                    "roughness",
                ],
            },
        })
    );
    return drawdyElements;
}
