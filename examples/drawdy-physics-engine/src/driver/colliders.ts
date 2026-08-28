import { SubscribedDrawdyElement } from "@drawdy/driver-protocol";
import { Body } from "../engine/body";
import { simplifyPolyline } from "../engine/simplify";
import { Vec2 } from "../engine/vec2";
import { DEFAULT_RESTITUTION } from "../engine/world";

const CIRCLE_SEGMENTS = 16;
const CHAIN_SIMPLIFY_EPSILON = 1.5;

type RectInfo = { x: number; y: number; w: number; h: number; center: Vec2 };

function rectInfo(el: SubscribedDrawdyElement): RectInfo | null {
    const { x, y, width: w, height: h } = el;
    if (x == null || y == null || w == null || h == null) return null;
    return { x, y, w, h, center: { x: x + w / 2, y: y + h / 2 } };
}

const rotateAll = (points: Vec2[], center: Vec2, angle: number): Vec2[] =>
    angle === 0 ? points : points.map((p) => Vec2.rotateAbout(p, center, angle));

/** Visual outline as world-space vertices (rotation applied). */
function shapeVertices(el: SubscribedDrawdyElement): Vec2[] | null {
    const info = rectInfo(el);
    if (!info) return null;
    const { x, y, w, h, center } = info;
    const rotation = el.rotation ?? 0;
    switch (el.componentType) {
        case "rect":
            return rotateAll(
                [
                    { x, y },
                    { x: x + w, y },
                    { x: x + w, y: y + h },
                    { x, y: y + h },
                ],
                center,
                rotation
            );
        case "diamond":
            return rotateAll(
                [
                    { x: x + w / 2, y },
                    { x: x + w, y: y + h / 2 },
                    { x: x + w / 2, y: y + h },
                    { x, y: y + h / 2 },
                ],
                center,
                rotation
            );
        case "circle": {
            // ellipse inscribed in the bbox
            const out: Vec2[] = [];
            for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
                const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
                out.push({
                    x: center.x + (w / 2) * Math.cos(t),
                    y: center.y + (h / 2) * Math.sin(t),
                });
            }
            return rotateAll(out, center, rotation);
        }
        default:
            return null;
    }
}

const isNearCircular = (w: number, h: number): boolean =>
    Math.abs(w - h) < 0.1 * Math.max(w, h);

export function buildDynamicBody(el: SubscribedDrawdyElement): Body | null {
    const info = rectInfo(el);
    if (!info) return null;
    if (el.componentType === "circle" && isNearCircular(info.w, info.h)) {
        return Body.dynamicCircle(
            el.id,
            info.center,
            (info.w + info.h) / 4,
            DEFAULT_RESTITUTION
        );
    }
    const vertices = shapeVertices(el);
    if (!vertices) return null;
    return Body.dynamicPolygon(el.id, vertices, DEFAULT_RESTITUTION);
}

/**
 * Immovable collider: shapes along their outline, freedraw/line/arrow along
 * their stroke, anything else as its bounding box.
 */
export function buildStaticBody(el: SubscribedDrawdyElement): Body | null {
    const info = rectInfo(el);

    const isStroke =
        el.type === "freedraw" ||
        el.componentType === "line" ||
        el.componentType === "arrow";
    if (isStroke && el.points && el.points.length >= 2) {
        let points: Vec2[] = el.points.map(([x, y]) => ({ x, y }));
        // Lines carry rotation separately; freedraw points include it.
        const rotation = el.rotation ?? 0;
        if (el.type !== "freedraw" && rotation !== 0 && info) {
            points = rotateAll(points, info.center, rotation);
        }
        points = simplifyPolyline(points, CHAIN_SIMPLIFY_EPSILON);
        return Body.staticFrom(
            el.id,
            { kind: "chain", points },
            points[0],
            DEFAULT_RESTITUTION
        );
    }

    if (!info) return null;

    if (el.componentType === "circle" && isNearCircular(info.w, info.h)) {
        return Body.staticFrom(
            el.id,
            { kind: "circle", radius: (info.w + info.h) / 4 },
            info.center,
            DEFAULT_RESTITUTION
        );
    }

    const vertices =
        shapeVertices(el) ??
        rotateAll(
            [
                { x: info.x, y: info.y },
                { x: info.x + info.w, y: info.y },
                { x: info.x + info.w, y: info.y + info.h },
                { x: info.x, y: info.y + info.h },
            ],
            info.center,
            el.rotation ?? 0
        );
    return Body.staticFrom(
        el.id,
        {
            kind: "polygon",
            vertices: vertices.map((v) => Vec2.sub(v, info.center)),
        },
        info.center,
        DEFAULT_RESTITUTION
    );
}
