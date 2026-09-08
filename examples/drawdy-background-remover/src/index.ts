import type {
    DomElementSchema,
    DriverCommandIssuer,
    DriverModule,
    ModuleStyling,
    ProtocolCommandError,
} from "@drawdy/driver-protocol";
import type { InferenceSession } from "onnxruntime-web";
import {
    applyAlpha,
    bytesToHex,
    fitWithin,
    maskFromOutput,
    MODEL_INPUT_SIZE,
    preprocess,
    resizeMaskBilinear,
    type Size,
} from "./segment";

const ORT_VERSION = "1.29.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const ORT_SCRIPT = `${ORT_BASE}ort.wasm.min.js`;
const MODEL_INPUT_NAME = "input.1";
const MAX_SIDE = 4096;

const RESULT_GAP = 40;
const MENU_ROOT = "background-remover";
const TOAST_ID = "background-remover:toast";
const TOAST_WIDTH = 360;

type ModelKind = "fast" | "quality";
type ModelSpec = {
    url: string;
    sha256: string;
    label: string;
    sizeMb: number;
};

const MODELS: Record<ModelKind, ModelSpec> = {
    fast: {
        url: "https://huggingface.co/tomjackson2023/rembg/resolve/main/u2netp.onnx",
        sha256: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
        label: "Fast",
        sizeMb: 5,
    },
    quality: {
        url: "https://huggingface.co/tomjackson2023/rembg/resolve/main/silueta.onnx",
        sha256: "75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb",
        label: "Best quality",
        sizeMb: 44,
    },
};
const KINDS: ModelKind[] = ["fast", "quality"];
const menuIdOf = (kind: ModelKind): string => `${MENU_ROOT}:${kind}`;
const kindOfMenu = (menuId: string): ModelKind | null =>
    KINDS.find((kind) => menuIdOf(kind) === menuId) ?? null;

let issue: DriverCommandIssuer;
let driverId: string;
let styling: ModuleStyling;
let seq = 0;
const rid = (): string => String(seq++);

const sessions = new Map<ModelKind, Promise<InferenceSession>>();
let ortLoaded = false;
let toastToken = 0;

let queue = Promise.resolve();
const enqueue = (f: () => Promise<void>): void => {
    queue = queue.then(f).catch(() => undefined);
};

export const activate: DriverModule["activate"] = async (ctx) => {
    issue = ctx.issueCommand;
    driverId = ctx.manifest.driverId;
    styling = ctx.styling;

    await issue({
        type: "command:context-menu:add",
        driverId,
        requestId: rid(),
        req: {
            menuId: MENU_ROOT,
            menuTitle: "Remove background",
            children: KINDS.map((kind) => ({
                menuId: menuIdOf(kind),
                menuTitle: `${MODELS[kind].label} (${MODELS[kind].sizeMb} MB model)`,
            })),
        },
    });
    for (const kind of KINDS) {
        await issue({
            type: "subscription:context-menu:clicked",
            driverId,
            requestId: rid(),
            req: { menuId: menuIdOf(kind) },
        });
    }
    await issue({
        type: "subscription:dom:theme-changed",
        driverId,
        requestId: rid(),
    });
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (event.type === "subscription:dom:theme-changed") {
        styling = event.body.styling;
        return;
    }
    if (event.type === "subscription:context-menu:clicked") {
        const kind = kindOfMenu(event.body.menuId);
        if (kind) enqueue(() => run(kind));
    }
};

async function run(kind: ModelKind): Promise<void> {
    const imageIds = await selectedImageIds();
    if (imageIds.length === 0) {
        await toast("Select an image first", 2500);
        return;
    }
    try {
        const session = await ensureSession(kind);
        for (let i = 0; i < imageIds.length; i++) {
            const progress =
                imageIds.length > 1 ? ` (${i + 1}/${imageIds.length})` : "";
            await toast(`Removing background${progress}…`);
            await processImage(session, imageIds[i]);
        }
        const noun = imageIds.length === 1 ? "image" : "images";
        await toast(`Background removed from ${imageIds.length} ${noun}`, 2000);
    } catch (err) {
        await toast(`Background removal failed: ${describe(err)}`, 5000);
    }
}

async function selectedImageIds(): Promise<string[]> {
    const selected = unwrap(
        await issue({
            type: "command:scene:get-current-selected-drawdy-elements",
            driverId,
            requestId: rid(),
        })
    );
    if (selected.drawdyElementIds.length === 0) return [];
    const elements = unwrap(
        await issue({
            type: "command:scene:get-drawdy-elements",
            driverId,
            requestId: rid(),
            req: {
                properties: ["type"],
                drawdyElementIds: selected.drawdyElementIds,
            },
        })
    );
    return elements.drawdyElements
        .filter((el) => el.type === "image")
        .map((el) => el.id);
}

function ensureSession(kind: ModelKind): Promise<InferenceSession> {
    const cached = sessions.get(kind);
    if (cached) return cached;
    const created = createSession(kind);
    sessions.set(kind, created);
    created.catch(() => sessions.delete(kind));
    return created;
}

async function createSession(kind: ModelKind): Promise<InferenceSession> {
    const spec = MODELS[kind];
    loadOrt();
    const bytes = await download(spec, (percent) =>
        toast(`Loading ${spec.label} model (${spec.sizeMb} MB)… ${percent}%`)
    );
    await toast(`Verifying ${spec.label} model…`);
    await verify(bytes, spec.sha256);
    await toast(`Preparing ${spec.label} model…`);
    return ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
    });
}

function loadOrt(): void {
    if (ortLoaded) return;
    importScripts(ORT_SCRIPT);
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = 1;
    ortLoaded = true;
}

async function download(
    spec: ModelSpec,
    onProgress: (percent: number) => Promise<void>
): Promise<Uint8Array<ArrayBuffer>> {
    await onProgress(0);
    const res = await fetch(spec.url);
    if (!res.ok) {
        throw new Error(`model download failed (HTTP ${res.status})`);
    }
    const total = Number(res.headers.get("content-length")) || 0;
    if (!res.body || total === 0) {
        return new Uint8Array(await res.arrayBuffer());
    }
    const out = new Uint8Array(total);
    const reader = res.body.getReader();
    let received = 0;
    let lastReported = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.length > total) {
            throw new Error("model download exceeded its declared size");
        }
        out.set(value, received);
        received += value.length;
        const percent = Math.floor((received / total) * 100);
        if (percent >= lastReported + 5) {
            lastReported = percent;
            await onProgress(percent);
        }
    }
    if (received !== total) {
        throw new Error("model download ended early");
    }
    return out;
}

async function verify(
    bytes: Uint8Array<ArrayBuffer>,
    expectedSha256: string
): Promise<void> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    const digest = await subtle.digest("SHA-256", bytes);
    if (bytesToHex(digest) !== expectedSha256) {
        throw new Error("model integrity check failed");
    }
}

async function processImage(
    session: InferenceSession,
    drawdyElementId: string
): Promise<void> {
    const source = unwrap(
        await issue({
            type: "command:scene:get-image-source",
            driverId,
            requestId: rid(),
            req: { drawdyElementId },
        })
    );
    const bitmap = await createImageBitmap(source.blob);
    const natural: Size = { width: bitmap.width, height: bitmap.height };
    const target = fitWithin(natural, MAX_SIDE);
    const modelSize: Size = { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE };
    const full = rasterize(bitmap, target);
    const small = rasterize(bitmap, modelSize);
    bitmap.close();

    const input = new ort.Tensor("float32", preprocess(small.data), [
        1,
        3,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
    ]);
    const outputs = await session.run({ [MODEL_INPUT_NAME]: input });
    const first = outputs[session.outputNames[0]];
    const mask = maskFromOutput(first.data as Float32Array);
    const alpha = resizeMaskBilinear(mask, modelSize, target);
    applyAlpha(full.data, alpha);

    const canvas = new OffscreenCanvas(target.width, target.height);
    canvas.getContext("2d")!.putImageData(full, 0, 0);
    const png = await canvas.convertToBlob({ type: "image/png" });

    const rects = unwrap(
        await issue({
            type: "command:scene:element-rects",
            driverId,
            requestId: rid(),
            req: { drawdyElementIds: [drawdyElementId] },
        })
    );
    const rect = rects.rects[0]?.rect;
    if (!rect) throw new Error("source image disappeared");
    unwrap(
        await issue({
            type: "command:scene:add-drawdy-elements",
            driverId,
            requestId: rid(),
            req: {
                elements: [
                    {
                        type: "image",
                        drawdyElementId: `${drawdyElementId}:no-background`,
                        x: rect.x + rect.width + RESULT_GAP,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        blob: png,
                    },
                ],
            },
        })
    );
}

function rasterize(bitmap: ImageBitmap, size: Size): ImageData {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    return ctx.getImageData(0, 0, size.width, size.height);
}

async function toast(text: string, autoHideMs?: number): Promise<void> {
    const token = ++toastToken;
    await issue({
        type: "command:dom:remove-floating-element",
        driverId,
        requestId: rid(),
        req: { domId: TOAST_ID },
    });
    const size = unwrap(
        await issue({
            type: "command:dom:window-size",
            driverId,
            requestId: rid(),
        })
    );
    await issue({
        type: "command:dom:create-floating-element",
        driverId,
        requestId: rid(),
        req: {
            domId: TOAST_ID,
            position: { x: Math.round(size.width / 2 - TOAST_WIDTH / 2), y: 16 },
            asPopover: false,
            schema: toastSchema(text),
        },
    });
    if (autoHideMs !== undefined) {
        setTimeout(() => {
            if (token !== toastToken) return;
            void issue({
                type: "command:dom:remove-floating-element",
                driverId,
                requestId: rid(),
                req: { domId: TOAST_ID },
            });
        }, autoHideMs);
    }
}

function toastSchema(text: string): DomElementSchema {
    return {
        type: "row",
        styles: {
            width: [TOAST_WIDTH, "px"],
            padding: [12, "px"],
            backgroundColor: styling.surface,
            borderColor: styling.border,
            borderWidth: [1, "px"],
            borderRadius: [10, "px"],
            mainAxisAlignment: "center",
            crossAxisAlignment: "center",
            pointerEvents: "none",
        },
        children: [
            {
                type: "text",
                child: text,
                styles: {
                    color: styling.foreground,
                    fontSize: [13, "px"],
                    fontWeight: "medium",
                    textAlign: "center",
                },
            },
        ],
    };
}

type Envelope = {
    res:
        | { error?: never; value: unknown }
        | { error: ProtocolCommandError; value?: never };
};

function unwrap<T extends Envelope>(
    res: T
): Extract<T["res"], { error?: never }>["value"] {
    if (res.res.error !== undefined) {
        throw new Error(res.res.error.message ?? res.res.error.type);
    }
    return res.res.value as Extract<T["res"], { error?: never }>["value"];
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
