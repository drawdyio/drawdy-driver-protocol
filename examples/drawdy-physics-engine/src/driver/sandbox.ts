import { SubscribedDrawdyElement } from "@drawdy/driver-protocol";
import { Ctx, stamp, unwrap } from "./context";
import { physicsMode } from "./meta";

/** World-space sandbox interior; walls hug its outside. */
export type SandboxRect = { x: number; y: number; w: number; h: number };

export const MIN_SANDBOX_W = 1600;
export const MIN_SANDBOX_H = 1200;
/** Default margin around the tagged content, per side, as a fraction. */
export const SANDBOX_INFLATE = 0.5;

const SANDBOX_STROKE = "#94a3b8";

export function sandboxRect(el: SubscribedDrawdyElement): SandboxRect | null {
    if (el.x == null || el.y == null || el.width == null || el.height == null) {
        return null;
    }
    return { x: el.x, y: el.y, w: el.width, h: el.height };
}

/** Lowest id wins so concurrent clients converge on the same sandbox. */
export function findSandbox(
    els: ReadonlyArray<SubscribedDrawdyElement>
): SubscribedDrawdyElement | null {
    let found: SubscribedDrawdyElement | null = null;
    for (const el of els) {
        if (physicsMode(el) !== "sandbox" || !sandboxRect(el)) continue;
        if (!found || el.id < found.id) found = el;
    }
    return found;
}

/** An element belongs to the sandbox while its bbox center is inside. */
export function isInside(
    rect: SandboxRect,
    geom: { x: number; y: number; w: number; h: number }
): boolean {
    const cx = geom.x + geom.w / 2;
    const cy = geom.y + geom.h / 2;
    return (
        cx >= rect.x &&
        cx <= rect.x + rect.w &&
        cy >= rect.y &&
        cy <= rect.y + rect.h
    );
}

export function isPointInside(
    rect: SandboxRect,
    p: { x: number; y: number }
): boolean {
    return (
        p.x >= rect.x &&
        p.x <= rect.x + rect.w &&
        p.y >= rect.y &&
        p.y <= rect.y + rect.h
    );
}

/**
 * Default sandbox around the tagged content: inflated per side, clamped to a
 * minimum so a couple of small shapes still get room to move.
 */
export function defaultRectAround(
    content: { x: number; y: number; width: number; height: number } | null
): SandboxRect {
    const c = content ?? { x: 0, y: 0, width: 0, height: 0 };
    const w = Math.max(c.width * (1 + 2 * SANDBOX_INFLATE), MIN_SANDBOX_W);
    const h = Math.max(c.height * (1 + 2 * SANDBOX_INFLATE), MIN_SANDBOX_H);
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export async function createSandbox(
    ctx: Ctx,
    rect: SandboxRect
): Promise<string> {
    const id = ctx.generateId();
    unwrap(
        await ctx.issueCommand({
            type: "command:scene:add-drawdy-elements",
            ...stamp(ctx),
            req: {
                elements: [
                    {
                        drawdyElementId: id,
                        type: "shape",
                        componentType: "rect",
                        x: rect.x,
                        y: rect.y,
                        width: rect.w,
                        height: rect.h,
                        strokeColor: SANDBOX_STROKE,
                        fillColor: "transparent",
                        strokeWidth: 2,
                        strokeDash: "dashed",
                        roughness: 0,
                        meta: { physics: { mode: "sandbox" } },
                    },
                ],
            },
        })
    );
    return id;
}

/**
 * Resize the sandbox about its center. Geometry isn't updateable through the
 * protocol, so this is a remove + re-add under the same element id.
 */
export async function resizeSandbox(
    ctx: Ctx,
    el: SubscribedDrawdyElement,
    w: number,
    h: number
): Promise<SandboxRect | null> {
    const old = sandboxRect(el);
    if (!old) return null;
    const rect: SandboxRect = {
        x: old.x + old.w / 2 - w / 2,
        y: old.y + old.h / 2 - h / 2,
        w,
        h,
    };
    unwrap(
        await ctx.issueCommand({
            type: "command:scene:remove-drawdy-elements",
            ...stamp(ctx),
            req: { drawdyElementIds: [el.id] },
        })
    );
    unwrap(
        await ctx.issueCommand({
            type: "command:scene:add-drawdy-elements",
            ...stamp(ctx),
            req: {
                elements: [
                    {
                        drawdyElementId: el.id,
                        type: "shape",
                        componentType: "rect",
                        x: rect.x,
                        y: rect.y,
                        width: rect.w,
                        height: rect.h,
                        strokeColor: el.strokeColor ?? SANDBOX_STROKE,
                        fillColor: el.fillColor ?? "transparent",
                        strokeWidth: el.strokeWidth ?? 2,
                        strokeDash: el.strokeDash ?? "dashed",
                        roughness: el.roughness ?? 0,
                        meta: { physics: { mode: "sandbox" } },
                    },
                ],
            },
        })
    );
    return rect;
}
