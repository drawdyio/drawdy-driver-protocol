import { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { ImageBlock, TextBlock, ToolDefinition } from "./anthropic";
import { DriverContext, unwrap } from "./driver-context";
import { blobToImageBlock } from "./image";

const MAX_READ_ELEMENTS = 400;

const LASER_TOOL_ID = "laser-pointer";
// The laser trail fades over ~1s and only paints while the laser is the active
// tool, so we hold it active a beat past the fade before restoring.
const LASER_RESTORE_MS = 1500;

const rectSchema = {
    type: "object",
    properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
    },
    required: ["x", "y", "width", "height"],
} as const;

const pointSchema = {
    type: "array",
    items: { type: "number" },
    minItems: 2,
    maxItems: 2,
    description: "[x, y] in world coordinates",
} as const;

export const TOOL_STATUS: Record<string, string> = {
    read_board: "Reading the board…",
    view_board: "Looking at the board…",
    get_selection: "Checking the selection…",
    create_elements: "Drawing…",
    delete_elements: "Erasing…",
    select_elements: "Selecting…",
    zoom_to: "Moving the camera…",
    annotate: "Pointing…",
};

export const TOOLS: ToolDefinition[] = [
    {
        name: "read_board",
        description:
            "List every element on the board as JSON: id, type, text (if any), bounding rect (x, y, width, height, world coordinates), locked. " +
            'Types: "path" covers shapes, lines and arrows; "freedraw" is a hand-drawn stroke; "frame" is a section/slide container; plus "text", "image", "component". ' +
            "Use this to understand structure and read text. Use view_board to see visual appearance.",
        input_schema: { type: "object", properties: {} },
    },
    {
        name: "view_board",
        description:
            "Take a screenshot of the board and look at it. Defaults to the user's current viewport; pass `area` to look at a specific world rect. " +
            "The result tells you which world rect the image covers, so you can map what you see back to coordinates.",
        input_schema: {
            type: "object",
            properties: {
                area: {
                    ...rectSchema,
                    description:
                        "World rect to capture. Omit to capture the user's current viewport.",
                },
            },
        },
    },
    {
        name: "get_selection",
        description:
            "Describe the elements the user currently has selected. When the user says 'this' or 'these', they usually mean the selection.",
        input_schema: { type: "object", properties: {} },
    },
    {
        name: "create_elements",
        description:
            "Add elements to the board. Returns the created element ids. " +
            "Coordinates are world units; y grows downward. Colors are CSS color strings; omit them to use theme defaults.",
        input_schema: {
            type: "object",
            properties: {
                elements: {
                    type: "array",
                    items: {
                        anyOf: [
                            {
                                type: "object",
                                description: "A shape, optionally labeled.",
                                properties: {
                                    type: { const: "shape" },
                                    shape: {
                                        enum: ["rect", "circle", "diamond"],
                                    },
                                    x: { type: "number" },
                                    y: { type: "number" },
                                    width: { type: "number" },
                                    height: { type: "number" },
                                    label: {
                                        type: "string",
                                        description:
                                            "Text rendered inside the shape.",
                                    },
                                    strokeColor: { type: "string" },
                                    fillColor: { type: "string" },
                                    strokeWidth: { type: "number" },
                                    cornerRadius: { type: "number" },
                                    roughness: {
                                        type: "number",
                                        description:
                                            "0 = crisp, higher = sketchier. Default 1.",
                                    },
                                    fontSize: { type: "number" },
                                },
                                required: [
                                    "type",
                                    "shape",
                                    "x",
                                    "y",
                                    "width",
                                    "height",
                                ],
                            },
                            {
                                type: "object",
                                description: "Free-standing text.",
                                properties: {
                                    type: { const: "text" },
                                    x: { type: "number" },
                                    y: { type: "number" },
                                    width: {
                                        type: "number",
                                        description:
                                            "Wrap width. ~10px per character of the longest line is a good guess.",
                                    },
                                    text: { type: "string" },
                                    fontSize: { type: "number" },
                                    color: { type: "string" },
                                },
                                required: ["type", "x", "y", "width", "text"],
                            },
                            {
                                type: "object",
                                description: "A straight line.",
                                properties: {
                                    type: { const: "line" },
                                    from: pointSchema,
                                    to: pointSchema,
                                    color: { type: "string" },
                                    strokeWidth: { type: "number" },
                                },
                                required: ["type", "from", "to"],
                            },
                            {
                                type: "object",
                                description:
                                    "An arrow pointing from `from` to `to`.",
                                properties: {
                                    type: { const: "arrow" },
                                    from: pointSchema,
                                    to: pointSchema,
                                    color: { type: "string" },
                                    strokeWidth: { type: "number" },
                                },
                                required: ["type", "from", "to"],
                            },
                            {
                                type: "object",
                                description:
                                    "A frame — a section container drawn behind other elements.",
                                properties: {
                                    type: { const: "frame" },
                                    x: { type: "number" },
                                    y: { type: "number" },
                                    width: { type: "number" },
                                    height: { type: "number" },
                                },
                                required: [
                                    "type",
                                    "x",
                                    "y",
                                    "width",
                                    "height",
                                ],
                            },
                            {
                                type: "object",
                                description:
                                    "An image referenced by URL (http(s) or data:). The URL must stay reachable for everyone who opens the board.",
                                properties: {
                                    type: { const: "image" },
                                    url: { type: "string" },
                                    x: { type: "number" },
                                    y: { type: "number" },
                                    width: { type: "number" },
                                    height: { type: "number" },
                                },
                                required: [
                                    "type",
                                    "url",
                                    "x",
                                    "y",
                                    "width",
                                    "height",
                                ],
                            },
                        ],
                    },
                },
            },
            required: ["elements"],
        },
    },
    {
        name: "delete_elements",
        description: "Remove elements from the board by id.",
        input_schema: {
            type: "object",
            properties: {
                ids: { type: "array", items: { type: "string" } },
            },
            required: ["ids"],
        },
    },
    {
        name: "select_elements",
        description:
            "Select elements by id to point the user at them. An empty list clears the selection.",
        input_schema: {
            type: "object",
            properties: {
                ids: { type: "array", items: { type: "string" } },
            },
            required: ["ids"],
        },
    },
    {
        name: "zoom_to",
        description:
            "Fly the user's camera to elements (by id) or to a world rect. Do this after creating elements so the user sees the result.",
        input_schema: {
            type: "object",
            properties: {
                ids: { type: "array", items: { type: "string" } },
                area: rectSchema,
            },
        },
    },
    {
        name: "annotate",
        description:
            "Draw an ephemeral laser trail on the board to point things out — it glows red and fades after ~1 second, leaving nothing behind. Use it to point at, circle, or underline something while you explain, the way a presenter waves a laser pointer. For permanent marks, use create_elements instead. " +
            "Each stroke is a polyline of world-space [x, y] points: a single point is a dot; a ring of ~16 points around a rect circles it; two points underline. zoom_to the area first if it may be off-screen — the trail only shows where the user is looking.",
        input_schema: {
            type: "object",
            properties: {
                strokes: {
                    type: "array",
                    description: "One or more strokes to trace, in order.",
                    items: {
                        type: "array",
                        description:
                            "A polyline of [x, y] world points. Length 1 draws a dot.",
                        items: pointSchema,
                        minItems: 1,
                    },
                    minItems: 1,
                },
            },
            required: ["strokes"],
        },
    },
];

export async function executeTool(
    ctx: DriverContext,
    name: string,
    input: unknown
): Promise<(TextBlock | ImageBlock)[]> {
    const args = asObject(input, "tool input");
    switch (name) {
        case "read_board":
            return readBoard(ctx);
        case "view_board":
            return viewBoard(ctx, args);
        case "get_selection":
            return getSelection(ctx);
        case "create_elements":
            return createElements(ctx, args);
        case "delete_elements":
            return deleteElements(ctx, args);
        case "select_elements":
            return selectElements(ctx, args);
        case "zoom_to":
            return zoomTo(ctx, args);
        case "annotate":
            return annotate(ctx, args);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

async function readBoard(ctx: DriverContext): Promise<TextBlock[]> {
    const { drawdyElements } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:get-drawdy-elements",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: {
                properties: [
                    "type",
                    "text",
                    "x",
                    "y",
                    "width",
                    "height",
                    "locked",
                ],
            },
        })
    );
    const listed = drawdyElements.slice(0, MAX_READ_ELEMENTS).map(describe);
    const truncated =
        drawdyElements.length > MAX_READ_ELEMENTS
            ? ` (showing the first ${MAX_READ_ELEMENTS})`
            : "";
    return [
        text(
            `${drawdyElements.length} element(s) on the board${truncated}:\n` +
                JSON.stringify(listed)
        ),
    ];
}

async function viewBoard(
    ctx: DriverContext,
    args: Record<string, unknown>
): Promise<(TextBlock | ImageBlock)[]> {
    const area =
        args["area"] === undefined
            ? unwrap(
                  await ctx.issueCommand({
                      type: "command:camera:get-viewport-rect",
                      driverId: ctx.driverId,
                      requestId: ctx.nextRequestId(),
                  })
              ).rect
            : asRect(args["area"], "area");
    const { png } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:capture-screenshot",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { area },
        })
    );
    return [
        text(
            `Screenshot of world rect x=${round(area.x)}, y=${round(area.y)}, width=${round(area.width)}, height=${round(area.height)} (image left edge is x=${round(area.x)}, top edge is y=${round(area.y)}).`
        ),
        await blobToImageBlock(png),
    ];
}

async function getSelection(ctx: DriverContext): Promise<TextBlock[]> {
    const { drawdyElementIds } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:get-current-selected-drawdy-elements",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
        })
    );
    if (drawdyElementIds.length === 0) {
        return [text("Nothing is selected.")];
    }
    const selected = new Set(drawdyElementIds);
    const { drawdyElements } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:get-drawdy-elements",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: {
                properties: [
                    "type",
                    "text",
                    "x",
                    "y",
                    "width",
                    "height",
                    "locked",
                ],
            },
        })
    );
    const listed = drawdyElements
        .filter((e) => selected.has(e.id))
        .map(describe);
    return [
        text(
            `${listed.length} selected element(s):\n` + JSON.stringify(listed)
        ),
    ];
}

async function createElements(
    ctx: DriverContext,
    args: Record<string, unknown>
): Promise<TextBlock[]> {
    const items = asArray(args["elements"], "elements");
    if (items.length === 0) {
        throw new Error("elements is empty");
    }
    const styling = ctx.getStyling();
    const created: { id: string; type: string }[] = [];
    const elements: DrawdyElementSchema[] = items.map((raw, i) => {
        const item = asObject(raw, `elements[${i}]`);
        const id = ctx.generateId();
        const element = buildElement(item, id, `elements[${i}]`, {
            stroke: styling.foreground,
            fill: "transparent",
        });
        created.push({ id, type: String(item["type"]) });
        return element;
    });
    unwrap(
        await ctx.issueCommand({
            type: "command:scene:add-drawdy-elements",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { elements },
        })
    );
    return [text(`Created ${created.length}: ${JSON.stringify(created)}`)];
}

function buildElement(
    item: Record<string, unknown>,
    id: string,
    at: string,
    defaults: { stroke: string; fill: string }
): DrawdyElementSchema {
    switch (item["type"]) {
        case "shape":
            return {
                type: "shape",
                drawdyElementId: id,
                componentType: asEnum(
                    item["shape"],
                    ["rect", "circle", "diamond"] as const,
                    `${at}.shape`
                ),
                x: asNumber(item["x"], `${at}.x`),
                y: asNumber(item["y"], `${at}.y`),
                width: asNumber(item["width"], `${at}.width`),
                height: asNumber(item["height"], `${at}.height`),
                strokeColor: asOptString(item["strokeColor"]) ?? defaults.stroke,
                fillColor: asOptString(item["fillColor"]) ?? defaults.fill,
                strokeWidth: asOptNumber(item["strokeWidth"]),
                cornerRadius: asOptNumber(item["cornerRadius"]),
                roughness: asOptNumber(item["roughness"]),
                text: asOptString(item["label"]),
                fontSize: asOptNumber(item["fontSize"]),
                meta: {},
            };
        case "text":
            return {
                type: "text",
                drawdyElementId: id,
                x: asNumber(item["x"], `${at}.x`),
                y: asNumber(item["y"], `${at}.y`),
                width: asNumber(item["width"], `${at}.width`),
                text: asString(item["text"], `${at}.text`),
                fontSize: asOptNumber(item["fontSize"]) ?? 16,
                color: asOptString(item["color"]) ?? defaults.stroke,
            };
        case "line":
            return {
                type: "line",
                drawdyElementId: id,
                from: asPoint(item["from"], `${at}.from`),
                to: asPoint(item["to"], `${at}.to`),
                color: asOptString(item["color"]) ?? defaults.stroke,
                strokeWidth: asOptNumber(item["strokeWidth"]),
            };
        case "arrow":
            return {
                type: "arrow",
                drawdyElementId: id,
                from: asPoint(item["from"], `${at}.from`),
                to: asPoint(item["to"], `${at}.to`),
                color: asOptString(item["color"]) ?? defaults.stroke,
                strokeWidth: asOptNumber(item["strokeWidth"]),
            };
        case "frame":
            return {
                type: "frame",
                drawdyElementId: id,
                position: [
                    asNumber(item["x"], `${at}.x`),
                    asNumber(item["y"], `${at}.y`),
                ],
                width: asNumber(item["width"], `${at}.width`),
                height: asNumber(item["height"], `${at}.height`),
                rotation: 0,
                meta: {},
            };
        case "image":
            return {
                type: "image",
                drawdyElementId: id,
                url: asString(item["url"], `${at}.url`),
                x: asNumber(item["x"], `${at}.x`),
                y: asNumber(item["y"], `${at}.y`),
                width: asNumber(item["width"], `${at}.width`),
                height: asNumber(item["height"], `${at}.height`),
            };
        default:
            throw new Error(
                `${at}.type must be one of shape, text, line, arrow, frame, image`
            );
    }
}

async function deleteElements(
    ctx: DriverContext,
    args: Record<string, unknown>
): Promise<TextBlock[]> {
    const ids = asStringArray(args["ids"], "ids");
    const { removed } = unwrap(
        await ctx.issueCommand({
            type: "command:scene:remove-drawdy-elements",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { drawdyElementIds: ids },
        })
    );
    return [text(`Removed ${removed} of ${ids.length} element(s).`)];
}

async function selectElements(
    ctx: DriverContext,
    args: Record<string, unknown>
): Promise<TextBlock[]> {
    const ids = asStringArray(args["ids"], "ids");
    if (ids.length === 0) {
        unwrap(
            await ctx.issueCommand({
                type: "command:scene:clear-selection",
                driverId: ctx.driverId,
                requestId: ctx.nextRequestId(),
            })
        );
        return [text("Selection cleared.")];
    }
    unwrap(
        await ctx.issueCommand({
            type: "command:scene:set-selection",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { drawdyElementIds: ids },
        })
    );
    return [text(`Selected ${ids.length} element(s).`)];
}

async function zoomTo(
    ctx: DriverContext,
    args: Record<string, unknown>
): Promise<TextBlock[]> {
    if (args["ids"] !== undefined) {
        const ids = asStringArray(args["ids"], "ids");
        if (ids.length === 0) throw new Error("ids is empty");
        unwrap(
            await ctx.issueCommand({
                type: "command:camera:fly-to-elements",
                driverId: ctx.driverId,
                requestId: ctx.nextRequestId(),
                req: { drawdyElementIds: ids, flyDurationMs: 600, zoom: 1 },
            })
        );
        return [text("Camera moved.")];
    }
    if (args["area"] !== undefined) {
        unwrap(
            await ctx.issueCommand({
                type: "command:camera:fly-to-rect",
                driverId: ctx.driverId,
                requestId: ctx.nextRequestId(),
                req: {
                    rect: asRect(args["area"], "area"),
                    flyDurationMs: 600,
                    zoom: 1,
                },
            })
        );
        return [text("Camera moved.")];
    }
    throw new Error("Pass either ids or area");
}

async function annotate(
    ctx: DriverContext,
    args: Record<string, unknown>
): Promise<TextBlock[]> {
    const rawStrokes = asArray(args["strokes"], "strokes");
    if (rawStrokes.length === 0) throw new Error("strokes is empty");
    const strokes = rawStrokes.map((stroke, i) => {
        const points = asArray(stroke, `strokes[${i}]`);
        if (points.length === 0) {
            throw new Error(`strokes[${i}] needs at least one point`);
        }
        return points.map((p, j) => asPoint(p, `strokes[${i}][${j}]`));
    });

    // Restore whatever tool the user had once the trail fades — never to the
    // laser itself (a rapid second annotate would have left it active).
    const { toolId } = unwrap(
        await ctx.issueCommand({
            type: "command:tools:get-active",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
        })
    );
    const restoreTo = toolId && toolId !== LASER_TOOL_ID ? toolId : "select";

    unwrap(
        await ctx.issueCommand({
            type: "command:tools:set-active",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { toolId: LASER_TOOL_ID },
        })
    );
    for (const stroke of strokes) {
        unwrap(
            await ctx.issueCommand({
                type: "command:tools:emulate-pointer",
                driverId: ctx.driverId,
                requestId: ctx.nextRequestId(),
                req: { points: stroke, interpMethod: "linear" },
            })
        );
    }

    // Fire-and-forget: let the trail fade, then hand the tool back. Not awaited
    // so the turn continues immediately.
    setTimeout(() => {
        void ctx.issueCommand({
            type: "command:tools:set-active",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { toolId: restoreTo },
        });
    }, LASER_RESTORE_MS);

    return [text(`Traced ${strokes.length} laser stroke(s).`)];
}

// ─── formatting ──────────────────────────────────────────────────────────────

function describe(e: {
    id: string;
    type?: string;
    text?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    locked?: boolean;
}): Record<string, unknown> {
    const out: Record<string, unknown> = {
        id: e.id,
        type: e.type,
        x: round(e.x),
        y: round(e.y),
        w: round(e.width),
        h: round(e.height),
    };
    if (e.text) out["text"] = e.text;
    if (e.locked) out["locked"] = true;
    return out;
}

function round(n: number | undefined): number | undefined {
    return n === undefined ? undefined : Math.round(n);
}

function text(t: string): TextBlock {
    return { type: "text", text: t };
}

// ─── validation ──────────────────────────────────────────────────────────────
// Throwing here becomes an is_error tool_result, which the model reads and
// self-corrects from — so messages name the offending field.

function asObject(v: unknown, at: string): Record<string, unknown> {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
        throw new Error(`${at} must be an object`);
    }
    return v as Record<string, unknown>;
}

function asArray(v: unknown, at: string): unknown[] {
    if (!Array.isArray(v)) throw new Error(`${at} must be an array`);
    return v;
}

function asNumber(v: unknown, at: string): number {
    if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new Error(`${at} must be a finite number`);
    }
    return v;
}

function asOptNumber(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asString(v: unknown, at: string): string {
    if (typeof v !== "string") throw new Error(`${at} must be a string`);
    return v;
}

function asOptString(v: unknown): string | undefined {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown, at: string): string[] {
    const array = asArray(v, at);
    return array.map((x, i) => asString(x, `${at}[${i}]`));
}

function asPoint(v: unknown, at: string): [number, number] {
    const array = asArray(v, at);
    if (array.length !== 2) throw new Error(`${at} must be [x, y]`);
    return [asNumber(array[0], `${at}[0]`), asNumber(array[1], `${at}[1]`)];
}

function asRect(
    v: unknown,
    at: string
): { x: number; y: number; width: number; height: number } {
    const rect = asObject(v, at);
    return {
        x: asNumber(rect["x"], `${at}.x`),
        y: asNumber(rect["y"], `${at}.y`),
        width: asNumber(rect["width"], `${at}.width`),
        height: asNumber(rect["height"], `${at}.height`),
    };
}

function asEnum<T extends string>(
    v: unknown,
    allowed: readonly T[],
    at: string
): T {
    if (typeof v !== "string" || !allowed.includes(v as T)) {
        throw new Error(`${at} must be one of ${allowed.join(", ")}`);
    }
    return v as T;
}
