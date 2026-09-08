import type {
    DrawdyElementSchema,
    DriverCommandIssuer,
    DriverModule,
    ElementStyle,
    ModuleStyling,
} from "@drawdy/driver-protocol";

const ELEMENT_STYLE_KEYS = Object.keys({
    layer: 0,
    strokeColor: 0,
    textColor: 0,
    fillColor: 0,
    strokeWidth: 0,
    lineStrokeWidth: 0,
    opacity: 0,
    cornerRadius: 0,
    strokeDash: 0,
    fillStyle: 0,
    seed: 0,
    roughness: 0,
} satisfies Record<keyof ElementStyle, 0>) as (keyof ElementStyle)[];

const DOT_SIZE = 20;
const DOT_HOVER_SCALE = 1.4;
const DOT_GAP = 28;
const NEW_GAP = 120;
const SIBLING_GAP = 60;
const MIN_ANCHOR_SCREEN_PX = 48;
const SIBLING_OFFSETS = [1, -1, 2, -2, 3, -3];

type Direction = "up" | "down" | "left" | "right";
const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

type Rect = { x: number; y: number; width: number; height: number };
type ShapeComponentType = "rect" | "circle" | "diamond";

const DOT_EL_PREFIX = "quick-add:dot:";
const PREVIEW_SHAPE_ID = "quick-add:preview-shape";
const PREVIEW_ARROW_ID = "quick-add:preview-arrow";

const dotElId = (dir: Direction): string => `${DOT_EL_PREFIX}${dir}`;
const isDot = (id: string): boolean => id.startsWith(DOT_EL_PREFIX);
const dirOfEl = (elId: string): Direction | null => {
    if (!isDot(elId)) return null;
    const dir = elId.slice(DOT_EL_PREFIX.length) as Direction;
    return DIRECTIONS.includes(dir) ? dir : null;
};
const firstDotDir = (ids: string[]): Direction | null => {
    for (const id of ids) {
        const dir = dirOfEl(id);
        if (dir) return dir;
    }
    return null;
};

const SRC_ANCHOR: Record<Direction, [number, number]> = {
    up: [0.5, 0],
    down: [0.5, 1],
    left: [0, 0.5],
    right: [1, 0.5],
};
const DST_ANCHOR: Record<Direction, [number, number]> = {
    up: [0.5, 1],
    down: [0.5, 0],
    left: [1, 0.5],
    right: [0, 0.5],
};

let issue: DriverCommandIssuer;
let driverId: string;
let genId: () => string;
let styling: ModuleStyling;
let seq = 0;
const rid = (): string => String(seq++);

let zoom = 1;
let resizeQueued = false;
let anchorId: string | null = null;
let anchorRect: Rect | null = null;
let hoveredDir: Direction | null = null;
let dotsPreviewId: string | null = null;
let previewId: string | null = null;
let previewDir: Direction | null = null;

let queue = Promise.resolve();
const enqueue = (f: () => Promise<void>): void => {
    queue = queue.then(f).catch(() => undefined);
};

export const activate: DriverModule["activate"] = async (ctx) => {
    issue = ctx.issueCommand;
    driverId = ctx.manifest.driverId;
    genId = ctx.generateId;
    styling = ctx.styling;

    await issue({
        type: "subscription:scene:drawdy-element-selection",
        driverId,
        requestId: rid(),
    });
    await issue({
        type: "subscription:dom:theme-changed",
        driverId,
        requestId: rid(),
    });
    await issue({
        type: "subscription:scene:drawdy-elements-dragged",
        driverId,
        requestId: rid(),
    });
    await issue({
        type: "subscription:camera:moved-rapid",
        driverId,
        requestId: rid(),
    });
    const camera = await issue({
        type: "command:camera:get-info",
        driverId,
        requestId: rid(),
    });
    if (camera.res.error === undefined) zoom = camera.res.value.zoom;

    const dotIds = DIRECTIONS.map(dotElId);
    await issue({
        type: "subscription:scene:pointer",
        driverId,
        requestId: rid(),
        req: { elementIds: dotIds },
    });
    await issue({
        type: "subscription:scene:click",
        driverId,
        requestId: rid(),
        req: { elementIds: dotIds },
    });

    await syncWithSelection();
};

async function syncWithSelection(): Promise<void> {
    const current = await issue({
        type: "command:scene:get-current-selected-drawdy-elements",
        driverId,
        requestId: rid(),
    });
    if (current.res.error === undefined) {
        await onSelectionChange(current.res.value.drawdyElementIds);
    }
}

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (event.type === "subscription:dom:theme-changed") {
        styling = event.body.styling;
        return;
    }
    if (event.type === "subscription:scene:drawdy-element-selection") {
        const ids = event.body.drawdyElementIds;
        enqueue(() => onSelectionChange(ids));
        return;
    }
    if (event.type === "subscription:camera:moved-rapid") {
        if (event.body.zoom === zoom) return;
        zoom = event.body.zoom;
        if (resizeQueued) return;
        resizeQueued = true;
        enqueue(async () => {
            resizeQueued = false;
            await syncDots();
        });
        return;
    }
    if (event.type === "subscription:scene:drawdy-elements-dragged") {
        if (event.body.type === "dragStart") enqueue(() => clearDots());
        if (event.body.type === "dragEnd") enqueue(() => syncWithSelection());
        return;
    }
    if (event.type === "subscription:scene:pointer") {
        const body = event.body;
        if (body.type === "cancel") {
            enqueue(() => clearPreview());
            return;
        }
        if (body.type !== "enter" && body.type !== "out") return;
        const dir = firstDotDir(body.drawdyElementIds);
        if (!dir) return;
        if (body.type === "enter") {
            enqueue(() => setHovered(dir));
            enqueue(() => showPreview(dir));
        } else {
            enqueue(() => setHovered(null));
            enqueue(() => clearPreviewFor(dir));
        }
        return;
    }
    if (event.type === "subscription:scene:click") {
        const dir = firstDotDir(event.body.drawdyElementIds);
        if (dir) enqueue(() => commitAdd(dir));
        return;
    }
};

async function clearPreviewFor(dir: Direction): Promise<void> {
    if (previewDir === dir) await clearPreview();
}

async function onSelectionChange(ids: string[]): Promise<void> {
    await clearDots();
    if (ids.length === 1 && !isDot(ids[0]) && (await isShape(ids[0]))) {
        await showDots(ids[0]);
    }
}

async function isShape(id: string): Promise<boolean> {
    const res = await issue({
        type: "command:scene:get-drawdy-elements",
        driverId,
        requestId: rid(),
        req: { properties: ["componentType"], drawdyElementIds: [id] },
    });
    if (res.res.error !== undefined) return false;
    return isShapeComponentType(res.res.value.drawdyElements[0]?.componentType);
}

async function showDots(id: string): Promise<void> {
    const rect = await getRect(id);
    if (!rect) return;
    anchorId = id;
    anchorRect = rect;
    await syncDots();
}

function dotsFit(rect: Rect): boolean {
    return Math.min(rect.width, rect.height) * zoom >= MIN_ANCHOR_SCREEN_PX;
}

async function syncDots(): Promise<void> {
    if (!anchorRect) return;
    if (!dotsFit(anchorRect)) {
        await hideDots();
        return;
    }
    if (!dotsPreviewId) {
        const res = await issue({
            type: "command:scene:create-drawdy-preview-elements",
            driverId,
            requestId: rid(),
            req: { elements: dotShapes(anchorRect), hitTestable: true },
        });
        if (res.res.error === undefined) {
            dotsPreviewId = res.res.value.previewId;
        }
        return;
    }
    await issue({
        type: "command:scene:update-drawdy-preview-elements",
        driverId,
        requestId: rid(),
        req: { elements: dotShapes(anchorRect) },
    });
}

async function hideDots(): Promise<void> {
    await clearPreview();
    if (dotsPreviewId) {
        await issue({
            type: "command:scene:delete-drawdy-preview-elements",
            driverId,
            requestId: rid(),
            req: { previewIds: [dotsPreviewId] },
        });
    }
    dotsPreviewId = null;
    hoveredDir = null;
}

function dotShapes(rect: Rect): DrawdyElementSchema[] {
    return DIRECTIONS.map((dir) => dotShape(dir, rect));
}

async function clearDots(): Promise<void> {
    await hideDots();
    anchorId = null;
    anchorRect = null;
}

async function setHovered(dir: Direction | null): Promise<void> {
    if (hoveredDir === dir) return;
    const changed = [hoveredDir, dir].filter((d): d is Direction => d !== null);
    hoveredDir = dir;
    if (!dotsPreviewId || !anchorRect || changed.length === 0) return;
    const rect = anchorRect;
    await issue({
        type: "command:scene:update-drawdy-preview-elements",
        driverId,
        requestId: rid(),
        req: { elements: changed.map((d) => dotShape(d, rect)) },
    });
}

async function showPreview(dir: Direction): Promise<void> {
    if (!anchorRect || !anchorId) return;
    if (previewDir === dir) return;
    await clearPreview();

    const p = await plan(dir, anchorId, anchorRect);
    const [sax, say] = SRC_ANCHOR[dir];
    const [dax, day] = DST_ANCHOR[dir];
    const elements: DrawdyElementSchema[] = [];
    if (p.kind === "create") {
        elements.push({
            type: "shape",
            drawdyElementId: PREVIEW_SHAPE_ID,
            componentType: "rect",
            x: p.rect.x,
            y: p.rect.y,
            width: p.rect.width,
            height: p.rect.height,
            strokeColor: styling.border,
            fillColor: styling.surface2,
            strokeDash: "dashed",
        });
    }
    elements.push({
        type: "arrow",
        drawdyElementId: PREVIEW_ARROW_ID,
        color: styling.border,
        elbowRouting: true,
        startBinding: { drawdyElementId: anchorId, anchorX: sax, anchorY: say },
        endBinding: {
            drawdyElementId:
                p.kind === "connect" ? p.targetId : PREVIEW_SHAPE_ID,
            anchorX: dax,
            anchorY: day,
        },
    });
    const res = await issue({
        type: "command:scene:create-drawdy-preview-elements",
        driverId,
        requestId: rid(),
        req: { elements },
    });
    if (res.res.error === undefined) {
        previewId = res.res.value.previewId;
        previewDir = dir;
    }
}

async function clearPreview(): Promise<void> {
    if (previewId) {
        await issue({
            type: "command:scene:delete-drawdy-preview-elements",
            driverId,
            requestId: rid(),
            req: { previewIds: [previewId] },
        });
    }
    previewId = null;
    previewDir = null;
}

async function commitAdd(dir: Direction): Promise<void> {
    if (!anchorRect || !anchorId) return;
    const source = anchorId;
    const sourceRect = anchorRect;
    await clearPreview();

    const p = await plan(dir, source, sourceRect);
    const elements: DrawdyElementSchema[] = [];
    let endId: string;
    if (p.kind === "connect") {
        endId = p.targetId;
    } else {
        const look = await getSourceLook(source);
        endId = genId();
        elements.push({
            type: "shape",
            strokeColor: styling.foreground,
            fillColor: styling.surface,
            ...look.style,
            drawdyElementId: endId,
            componentType: look.componentType,
            x: p.rect.x,
            y: p.rect.y,
            width: p.rect.width,
            height: p.rect.height,
        });
    }

    const [sax, say] = SRC_ANCHOR[dir];
    const [dax, day] = DST_ANCHOR[dir];
    elements.push({
        type: "arrow",
        drawdyElementId: genId(),
        color: styling.foreground,
        elbowRouting: true,
        startBinding: { drawdyElementId: source, anchorX: sax, anchorY: say },
        endBinding: { drawdyElementId: endId, anchorX: dax, anchorY: day },
    });

    await issue({
        type: "command:scene:add-drawdy-elements",
        driverId,
        requestId: rid(),
        req: { elements },
    });

    await issue({
        type: "command:scene:set-selection",
        driverId,
        requestId: rid(),
        req: { drawdyElementIds: [endId] },
    });
}

type Plan =
    | { kind: "create"; rect: Rect }
    | { kind: "connect"; targetId: string };

async function plan(
    dir: Direction,
    source: string,
    sourceRect: Rect
): Promise<Plan> {
    const target = placedRect(dir, sourceRect);
    const existing = await findExisting(target, source);
    if (!existing) return { kind: "create", rect: target };
    if (!(await isConnected(source, existing))) {
        return { kind: "connect", targetId: existing };
    }
    for (const k of SIBLING_OFFSETS) {
        const candidate = shiftAlongAxis(dir, target, k);
        if (await isFree(candidate, source)) {
            return { kind: "create", rect: candidate };
        }
    }
    return { kind: "connect", targetId: existing };
}

function shiftAlongAxis(dir: Direction, r: Rect, k: number): Rect {
    if (dir === "left" || dir === "right") {
        return { ...r, y: r.y + k * (r.height + SIBLING_GAP) };
    }
    return { ...r, x: r.x + k * (r.width + SIBLING_GAP) };
}

async function isFree(rect: Rect, excludeId: string): Promise<boolean> {
    const res = await issue({
        type: "command:scene:query-rect",
        driverId,
        requestId: rid(),
        req: { rect, properties: [] },
    });
    if (res.res.error !== undefined) return false;
    return !res.res.value.drawdyElements.some(
        (el) => el.id !== excludeId && !isDot(el.id)
    );
}

async function isConnected(a: string, b: string): Promise<boolean> {
    const rects = await issue({
        type: "command:scene:element-rects",
        driverId,
        requestId: rid(),
        req: { drawdyElementIds: [a, b] },
    });
    if (rects.res.error !== undefined || rects.res.value.rects.length < 2) {
        return false;
    }
    const region = rects.res.value.rects.map((r) => r.rect).reduce(unionRect);
    const res = await issue({
        type: "command:scene:query-rect",
        driverId,
        requestId: rid(),
        req: { rect: region, properties: ["startBinding", "endBinding"] },
    });
    if (res.res.error !== undefined) return false;
    return res.res.value.drawdyElements.some((el) => {
        const s = el.startBinding?.drawdyElementId;
        const e = el.endBinding?.drawdyElementId;
        return (s === a && e === b) || (s === b && e === a);
    });
}

function unionRect(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
        x,
        y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
}

async function findExisting(
    rect: Rect,
    excludeId: string
): Promise<string | null> {
    const res = await issue({
        type: "command:scene:query-rect",
        driverId,
        requestId: rid(),
        req: { rect, properties: ["componentType"] },
    });
    if (res.res.error !== undefined) return null;
    const hit = res.res.value.drawdyElements.find(
        (el) =>
            el.id !== excludeId &&
            !isDot(el.id) &&
            isShapeComponentType(el.componentType)
    );
    return hit ? hit.id : null;
}

async function getRect(id: string): Promise<Rect | null> {
    const res = await issue({
        type: "command:scene:element-rects",
        driverId,
        requestId: rid(),
        req: { drawdyElementIds: [id] },
    });
    if (res.res.error !== undefined) return null;
    return res.res.value.rects[0]?.rect ?? null;
}

type SourceLook = { componentType: ShapeComponentType; style: ElementStyle };

async function getSourceLook(id: string): Promise<SourceLook> {
    const fallback: SourceLook = { componentType: "rect", style: {} };
    const res = await issue({
        type: "command:scene:get-drawdy-elements",
        driverId,
        requestId: rid(),
        req: {
            properties: ["componentType", ...ELEMENT_STYLE_KEYS],
            drawdyElementIds: [id],
        },
    });
    if (res.res.error !== undefined) return fallback;
    const found = res.res.value.drawdyElements[0];
    if (!found) return fallback;
    const style: ElementStyle = {};
    for (const key of ELEMENT_STYLE_KEYS) {
        if (key === "seed") continue;
        const value = found[key];
        if (value !== undefined) Object.assign(style, { [key]: value });
    }
    return {
        componentType: isShapeComponentType(found.componentType)
            ? found.componentType
            : "rect",
        style,
    };
}

function isShapeComponentType(ct?: string): ct is ShapeComponentType {
    return ct === "rect" || ct === "circle" || ct === "diamond";
}

function dotShape(dir: Direction, r: Rect): DrawdyElementSchema {
    const scale = dir === hoveredDir ? DOT_HOVER_SCALE : 1;
    const size = (DOT_SIZE * scale) / zoom;
    const center = dotCenter(dir, r, DOT_GAP / zoom);
    return {
        type: "shape",
        drawdyElementId: dotElId(dir),
        componentType: "circle",
        x: center.x - size / 2,
        y: center.y - size / 2,
        width: size,
        height: size,
        strokeColor: styling.background,
        fillColor: styling.primary,
        strokeWidth: 2 / zoom,
        roughness: 0,
    };
}

function dotCenter(
    dir: Direction,
    r: Rect,
    gap: number
): { x: number; y: number } {
    switch (dir) {
        case "up":
            return { x: r.x + r.width / 2, y: r.y - gap };
        case "down":
            return { x: r.x + r.width / 2, y: r.y + r.height + gap };
        case "left":
            return { x: r.x - gap, y: r.y + r.height / 2 };
        case "right":
            return { x: r.x + r.width + gap, y: r.y + r.height / 2 };
    }
}

function placedRect(dir: Direction, r: Rect): Rect {
    switch (dir) {
        case "up":
            return { x: r.x, y: r.y - r.height - NEW_GAP, ...size(r) };
        case "down":
            return { x: r.x, y: r.y + r.height + NEW_GAP, ...size(r) };
        case "left":
            return { x: r.x - r.width - NEW_GAP, y: r.y, ...size(r) };
        case "right":
            return { x: r.x + r.width + NEW_GAP, y: r.y, ...size(r) };
    }
}

function size(r: Rect): { width: number; height: number } {
    return { width: r.width, height: r.height };
}
