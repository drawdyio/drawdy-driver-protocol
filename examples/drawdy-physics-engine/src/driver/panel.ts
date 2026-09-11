import { ModuleStyling } from "@drawdy/driver-protocol";
import { Ctx, stamp, unwrap } from "./context";
import { physicsMode } from "./meta";
import { PANEL_HTML } from "./panel-html";
import {
    MIN_SANDBOX_H,
    MIN_SANDBOX_W,
    createSandbox,
    findSandboxes,
    renameSandbox,
    resizeSandbox,
    sandboxName,
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
type PanelSandbox = { id: string; name: string; width: number; height: number };

export type WebviewToDriver =
    | { type: "ready" }
    | { type: "create-sandbox" }
    | { type: "resize-sandbox"; id: string; width: number; height: number }
    | { type: "rename-sandbox"; id: string; name: string }
    | { type: "delete-sandbox"; id: string }
    | { type: "fly-to"; id: string }
    | { type: "select"; id: string }
    | { type: "untag"; id: string };

export type DriverToWebview =
    | {
          type: "state";
          sandboxes: PanelSandbox[];
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
        sandboxes: findSandboxes(drawdyElements).map((el) => ({
            id: el.id,
            name: sandboxName(el) ?? `Sandbox ${el.id.slice(-4)}`,
            width: el.width ?? 0,
            height: el.height ?? 0,
        })),
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
        case "create-sandbox": {
            // A new box lands centered on the current viewport — camera use
            // for one-time placement only, nothing simulation-coupled.
            const { rect } = unwrap(
                await ctx.issueCommand({
                    type: "command:camera:get-viewport-rect",
                    ...stamp(ctx),
                })
            );
            const els = await fetchGeometry(ctx);
            const count = findSandboxes(els).length;
            await createSandbox(
                ctx,
                {
                    x: rect.x + rect.width / 2 - MIN_SANDBOX_W / 2,
                    y: rect.y + rect.height / 2 - MIN_SANDBOX_H / 2,
                    w: MIN_SANDBOX_W,
                    h: MIN_SANDBOX_H,
                    rotation: 0,
                },
                `Sandbox ${count + 1}`
            );
            await session.restart();
            await postPanelState(ctx);
            return;
        }
        case "resize-sandbox": {
            const els = await fetchGeometry(ctx);
            const sandboxEl = findSandboxes(els).find(
                (el) => el.id === msg.id
            );
            if (sandboxEl) {
                await resizeSandbox(ctx, sandboxEl, msg.width, msg.height);
                await session.restart();
            }
            await postPanelState(ctx);
            return;
        }
        case "rename-sandbox": {
            const name = msg.name.trim();
            if (!name) return;
            const els = await fetchGeometry(ctx);
            const sandboxEl = findSandboxes(els).find(
                (el) => el.id === msg.id
            );
            if (sandboxEl) {
                // The on-canvas label rides the re-added element; restart so
                // a run interrupted by the remove picks its walls back up.
                await renameSandbox(ctx, sandboxEl, name);
                await session.restart();
            }
            await postPanelState(ctx);
            return;
        }
        case "delete-sandbox": {
            unwrap(
                await ctx.issueCommand({
                    type: "command:scene:remove-drawdy-elements",
                    ...stamp(ctx),
                    req: { drawdyElementIds: [msg.id] },
                })
            );
            // The session's elements-removed handler tears down its walls.
            await postPanelState(ctx);
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
        case "select": {
            await ctx.issueCommand({
                type: "command:scene:set-selection",
                ...stamp(ctx),
                req: { drawdyElementIds: [msg.id] },
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
