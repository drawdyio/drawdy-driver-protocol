import type {
    DomElementSchema,
    DriverCommandIssuer,
    DriverModule,
    LocalAnimation,
} from "@drawdy/driver-protocol";

const BUTTON_ID = "bomb:button";
const RING_ID = "bomb:ring";
const RING_SIZE = 320;
const RING_RADIUS = RING_SIZE / 2;
const BLAST_DISTANCE = 1000;
const BLAST_MS = 150;
const SPIN_TURNS = 3;

const BOMB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
  <circle cx="10.5" cy="15" r="6.5" fill="#1f2937"/>
  <circle cx="8.5" cy="13" r="2" fill="#4b5563"/>
  <path d="M15 9.5 L18 6.5" stroke="#6b7280" stroke-width="2" stroke-linecap="round" fill="none"/>
  <circle cx="19" cy="5.5" r="2" fill="#f59e0b"/>
  <circle cx="19" cy="5.5" r="1" fill="#fde68a"/>
</svg>`;

const RING_SCHEMA: DomElementSchema = {
    type: "box",
    styles: {
        width: [RING_SIZE, "px"],
        height: [RING_SIZE, "px"],
        backgroundColor:
            "radial-gradient(circle, rgba(56,132,255,0.4) 0%, rgba(56,132,255,0.18) 55%, rgba(56,132,255,0.05) 100%)",
        borderColor: "rgba(96,165,250,0.6)",
        borderWidth: [2, "px"],
        borderRadius: [50, "%"],
        pointerEvents: "auto",
    },
};

type DragBody = {
    type: "dragStart" | "dragging" | "dragEnd";
    domElementId: string;
    position: {
        canvasSpace: { x: number; y: number };
        domSpace: { x: number; y: number };
    };
};

let issue: DriverCommandIssuer;
let driverId: string;
let seq = 0;
let active = false;
let dragSubId: string | null = null;

const rid = () => String(seq++);

export const activate: DriverModule["activate"] = async (ctx) => {
    issue = ctx.issueCommand;
    driverId = ctx.manifest.driverId;

    await issue({
        type: "command:dom:create-action-button",
        driverId,
        requestId: rid(),
        req: { domElementId: BUTTON_ID, svg: BOMB_SVG },
    });

    await issue({
        type: "subscription:dom:drag",
        driverId,
        requestId: rid(),
        req: { domElementId: BUTTON_ID },
    });
};

let queue = Promise.resolve();

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (
        event.type !== "subscription:dom:drag" ||
        event.body.domElementId !== BUTTON_ID
    ) {
        return;
    }

    if (event.body.type === "dragStart") {
        queue = queue.then(() =>
            arm(event.body.position.domSpace.x, event.body.position.domSpace.y)
        );
    } else if (event.body.type === "dragEnd") {
        queue = queue.then(async () => {
            await detonate(event.body.position.canvasSpace);
            await disarm();
            queue = Promise.resolve();
            return;
        });
    } else {
        queue = queue.then(() => onDrag(event.body));
    }
};

async function arm(x: number, y: number): Promise<void> {
    await issue({
        type: "command:tools:set-active",
        driverId,
        requestId: rid(),
        req: { toolId: "select" },
    });

    await issue({
        type: "command:dom:create-floating-element",
        driverId,
        requestId: rid(),
        req: {
            domId: RING_ID,
            position: { x: x - RING_RADIUS, y: y - RING_RADIUS },
            schema: RING_SCHEMA,
            asPopover: false,
        },
    });

    const response = await issue({
        type: "subscription:dom:drag",
        driverId,
        requestId: rid(),
        req: { domElementId: RING_ID },
    });
    if (response.res.error === undefined) {
        dragSubId = response.res.value.subscriptionId;
    }
}

async function disarm(): Promise<void> {
    await issue({
        type: "command:dom:remove-floating-element",
        driverId,
        requestId: rid(),
        req: { domId: RING_ID },
    });
    if (dragSubId !== null) {
        await issue({
            type: "command:subscription:remove",
            driverId,
            requestId: rid(),
            req: { subscriptionId: dragSubId },
        });
        dragSubId = null;
    }
}

async function onDrag(body: DragBody): Promise<void> {
    await issue({
        type: "command:dom:move-floating-element",
        driverId,
        requestId: rid(),
        req: {
            domId: RING_ID,
            position: {
                x: body.position.domSpace.x - RING_RADIUS,
                y: body.position.domSpace.y - RING_RADIUS,
            },
        },
    });
}

async function detonate(center: { x: number; y: number }): Promise<void> {
    const info = await issue({
        type: "command:camera:get-info",
        driverId,
        requestId: rid(),
    });
    if (info.res.error !== undefined) return;
    const zoom = info.res.value.zoom || 1;
    const radius = RING_RADIUS / zoom;

    const query = await issue({
        type: "command:scene:query-rect",
        driverId,
        requestId: rid(),
        req: {
            rect: {
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2,
            },
            properties: [],
        },
    });
    if (query.res.error !== undefined) return;
    const ids = query.res.value.drawdyElements.map((el) => el.id);
    if (ids.length === 0) return;

    const rects = await issue({
        type: "command:scene:element-rects",
        driverId,
        requestId: rid(),
        req: { drawdyElementIds: ids },
    });
    if (rects.res.error !== undefined) return;

    const updates: {
        drawdyElementId: string;
        properties: { localAnimation: LocalAnimation };
    }[] = [];
    const doomed: string[] = [];

    for (const { drawdyElementId, rect } of rects.res.value.rects) {
        if (!intersectsCircle(rect, center, radius)) continue;

        const ex = rect.x + rect.width / 2;
        const ey = rect.y + rect.height / 2;
        const dx = ex - center.x;
        const dy = ey - center.y;
        const dist = Math.hypot(dx, dy);
        const angle =
            dist < 1e-3 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx);
        const closeness = Math.min(1, dist / radius);
        const force = BLAST_DISTANCE * (1 - 0.4 * closeness);
        const spin = (Math.random() < 0.5 ? -1 : 1) * SPIN_TURNS * 2 * Math.PI;

        updates.push({
            drawdyElementId,
            properties: {
                localAnimation: blast(
                    Math.cos(angle) * force,
                    Math.sin(angle) * force,
                    spin
                ),
            },
        });
        doomed.push(drawdyElementId);
    }
    if (doomed.length === 0) return;

    await issue({
        type: "command:scene:update-drawdy-elements",
        driverId,
        requestId: rid(),
        req: { updates },
    });

    setTimeout(() => {
        void issue({
            type: "command:scene:remove-drawdy-elements",
            driverId,
            requestId: rid(),
            req: { drawdyElementIds: doomed },
        });
    }, BLAST_MS);
}

function intersectsCircle(
    rect: { x: number; y: number; width: number; height: number },
    center: { x: number; y: number },
    radius: number
): boolean {
    const nx = Math.max(rect.x, Math.min(center.x, rect.x + rect.width));
    const ny = Math.max(rect.y, Math.min(center.y, rect.y + rect.height));
    const dx = center.x - nx;
    const dy = center.y - ny;
    return dx * dx + dy * dy <= radius * radius;
}

const EASE_OUT = [0, 0.7, 0.92, 1];

function blast(offsetX: number, offsetY: number, spin: number): LocalAnimation {
    return {
        time: {
            durationMs: BLAST_MS,
            curve: "linear",
            repeat: "none",
        },
        animation: {
            transform: {
                x: EASE_OUT.map((e) => offsetX * e),
                y: EASE_OUT.map((e) => offsetY * e),
                rotation: EASE_OUT.map((e) => spin * e),
                width: [1, 0.96, 0.82, 0.6],
                height: [1, 0.96, 0.82, 0.6],
                opacity: [1, 1, 0.6, 0],
            },
            curve: "linear",
        },
    };
}
