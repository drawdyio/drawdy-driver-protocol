import { SubscribedDrawdyElement } from "@drawdy/driver-protocol";
import { Ctx, stamp, unwrap } from "./context";
import { physicsMode } from "./meta";

export type SandboxRect = {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
};

export const MIN_SANDBOX_W = 1600;
export const MIN_SANDBOX_H = 1200;
/** Default margin around the tagged content, per side, as a fraction. */
export const SANDBOX_INFLATE = 0.5;

const SANDBOX_STROKE = "#94a3b8";

export function sandboxRect(el: SubscribedDrawdyElement): SandboxRect | null {
    if (el.x == null || el.y == null || el.width == null || el.height == null) {
        return null;
    }
    return {
        x: el.x,
        y: el.y,
        w: el.width,
        h: el.height,
        rotation: el.rotation ?? 0,
    };
}

/** Every sandbox on the board, id-sorted so all clients list them alike. */
export function findSandboxes(
    els: ReadonlyArray<SubscribedDrawdyElement>
): SubscribedDrawdyElement[] {
    return els
        .filter((el) => physicsMode(el) === "sandbox" && sandboxRect(el))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function sandboxName(el: SubscribedDrawdyElement): string | null {
    const physics = el.meta?.["physics"];
    if (physics && typeof physics === "object") {
        const name = (physics as Record<string, unknown>)["name"];
        if (typeof name === "string" && name.trim()) return name;
    }
    return null;
}

/** An element belongs to the sandbox while its bbox center is inside. */
export function isInside(
    rect: SandboxRect,
    geom: { x: number; y: number; w: number; h: number }
): boolean {
    return isPointInside(rect, {
        x: geom.x + geom.w / 2,
        y: geom.y + geom.h / 2,
    });
}

/** Bounds test in the rect's local frame, so rotated boxes contain correctly. */
export function isPointInside(
    rect: SandboxRect,
    p: { x: number; y: number }
): boolean {
    const rcx = rect.x + rect.w / 2;
    const rcy = rect.y + rect.h / 2;
    const cos = Math.cos(-rect.rotation);
    const sin = Math.sin(-rect.rotation);
    const dx = p.x - rcx;
    const dy = p.y - rcy;
    const lx = rcx + dx * cos - dy * sin;
    const ly = rcy + dx * sin + dy * cos;
    return (
        lx >= rect.x &&
        lx <= rect.x + rect.w &&
        ly >= rect.y &&
        ly <= rect.y + rect.h
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
    return { x: cx - w / 2, y: cy - h / 2, w, h, rotation: 0 };
}

/** World-space size of the name label at the rect's top-left. */
const SANDBOX_LABEL_FONT_SIZE = 28;

/** Names are single-line: line breaks collapse to one space. */
export const singleLineName = (s: string): string =>
    s.replace(/\s*[\r\n]+\s*/g, " ").trim();

type SandboxStyle = {
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
    strokeDash?: "solid" | "dashed" | "dotted";
    roughness?: number;
};

/**
 * Add the sandbox rect element. The name renders as the shape's own label at
 * the top-left (frame-style), so it pans and zooms with the canvas natively.
 */
async function addSandboxElement(
    ctx: Ctx,
    id: string,
    rect: SandboxRect,
    physics: Record<string, unknown>,
    style: SandboxStyle
): Promise<void> {
    const rawName = physics["name"];
    const name = typeof rawName === "string" ? singleLineName(rawName) : "";
    if (name) physics = { ...physics, name };
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
                        strokeColor: style.strokeColor ?? SANDBOX_STROKE,
                        fillColor: style.fillColor ?? "transparent",
                        strokeWidth: style.strokeWidth ?? 2,
                        strokeDash: style.strokeDash ?? "dashed",
                        roughness: style.roughness ?? 0,
                        ...(name
                            ? {
                                  text: name,
                                  fontSize: SANDBOX_LABEL_FONT_SIZE,
                                  textAlign: "left" as const,
                                  textVerticalAlign: "top" as const,
                                  textColor: style.strokeColor ?? SANDBOX_STROKE,
                              }
                            : {}),
                        meta: { physics },
                    },
                ],
            },
        })
    );
}

const physicsMetaOf = (
    el: SubscribedDrawdyElement
): Record<string, unknown> => ({
    ...(el.meta?.["physics"] as object),
    mode: "sandbox",
});

export async function createSandbox(
    ctx: Ctx,
    rect: SandboxRect,
    name?: string
): Promise<string> {
    const id = ctx.generateId();
    await addSandboxElement(
        ctx,
        id,
        rect,
        name ? { mode: "sandbox", name } : { mode: "sandbox" },
        {}
    );
    return id;
}

const removeElement = async (ctx: Ctx, id: string): Promise<void> => {
    unwrap(
        await ctx.issueCommand({
            type: "command:scene:remove-drawdy-elements",
            ...stamp(ctx),
            req: { drawdyElementIds: [id] },
        })
    );
};

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
    // The add schema carries no rotation, so a re-added box is upright.
    const rect: SandboxRect = {
        x: old.x + old.w / 2 - w / 2,
        y: old.y + old.h / 2 - h / 2,
        w,
        h,
        rotation: 0,
    };
    await removeElement(ctx, el.id);
    await addSandboxElement(ctx, el.id, rect, physicsMetaOf(el), el);
    return rect;
}

/**
 * Rename via remove + re-add too: the on-canvas label is the shape's `text`,
 * which the update command cannot change.
 */
export async function renameSandbox(
    ctx: Ctx,
    el: SubscribedDrawdyElement,
    name: string
): Promise<void> {
    const rect = sandboxRect(el);
    if (!rect) return;
    await removeElement(ctx, el.id);
    await addSandboxElement(
        ctx,
        el.id,
        rect,
        { ...physicsMetaOf(el), name },
        el
    );
}

/**
 * The on-canvas label is ordinary shape text, editable right on the board.
 * Meta stays the name's source of truth, so label edits are copied back into
 * meta — the write's own update echo then refreshes the panel. A label typed
 * with line breaks can't be flattened in place (text isn't updateable), so
 * that sandbox is recreated with the single-line name; returns true when
 * that happened so the caller can restart an interrupted run.
 */
export async function syncSandboxLabels(
    ctx: Ctx,
    els: ReadonlyArray<SubscribedDrawdyElement>
): Promise<boolean> {
    const updates: {
        drawdyElementId: string;
        properties: { meta: Record<string, unknown> };
    }[] = [];
    const recreateIds: string[] = [];
    for (const el of els) {
        if (physicsMode(el) !== "sandbox") continue;
        if (typeof el.text !== "string") continue;
        const label = singleLineName(el.text);
        if (!label) continue;
        if (/[\r\n]/.test(el.text)) {
            recreateIds.push(el.id);
            continue;
        }
        if (label === (sandboxName(el) ?? "")) continue;
        updates.push({
            drawdyElementId: el.id,
            properties: {
                meta: { physics: { ...physicsMetaOf(el), name: label } },
            },
        });
    }
    if (updates.length > 0) {
        unwrap(
            await ctx.issueCommand({
                type: "command:scene:update-drawdy-elements",
                ...stamp(ctx),
                req: { updates },
            })
        );
    }
    if (recreateIds.length === 0) return false;
    // The event payload lacks style props — re-fetch so the re-add keeps them.
    const { drawdyElements } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:get-drawdy-elements",
            ...stamp(ctx),
            req: {
                properties: [
                    "meta",
                    "text",
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
    let recreated = false;
    for (const el of drawdyElements) {
        if (!recreateIds.includes(el.id)) continue;
        const label = singleLineName(el.text ?? "");
        if (!label) continue;
        await renameSandbox(ctx, el, label);
        recreated = true;
    }
    return recreated;
}
