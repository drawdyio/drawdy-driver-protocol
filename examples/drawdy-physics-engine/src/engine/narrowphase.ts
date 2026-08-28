import { AABB, Body, Chain, CHAIN_THICKNESS, ChainShape } from "./body";
import { Vec2 } from "./vec2";

export { CHAIN_THICKNESS } from "./body";

const aabbHits = (
    box: AABB,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): boolean =>
    box.minX <= maxX && minX <= box.maxX && box.minY <= maxY && minY <= box.maxY;

/**
 * Segment indices of `chain` whose (thickness-inflated) AABBs overlap the
 * query box — the two-level prefilter that keeps long freedraw strokes cheap:
 * group AABBs reject runs of segments wholesale, so a chain costs
 * ~⌈N/GROUP_SIZE⌉ compares instead of N exact tests.
 */
function candidateSegments(
    chain: ChainShape,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): number[] {
    const index = (chain.index ??= Chain.index(chain.points));
    const out: number[] = [];
    for (let g = 0; g < index.groups.length; g++) {
        if (!aabbHits(index.groups[g], minX, minY, maxX, maxY)) continue;
        const start = g * Chain.GROUP_SIZE;
        const end = Math.min(start + Chain.GROUP_SIZE, index.segments.length);
        for (let i = start; i < end; i++) {
            if (aabbHits(index.segments[i], minX, minY, maxX, maxY)) {
                out.push(i);
            }
        }
    }
    return out;
}

export type Contact = {
    /** Body indices into the world's array; normal points from a to b. */
    a: number;
    b: number;
    /** Unit normal, from body a toward body b. */
    normal: Vec2;
    depth: number;
    /** World-space contact point. */
    point: Vec2;
};

/** Closest point on segment AB to P: t = (AP·AB)/|AB|² clamped to [0,1]. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
    const ab = Vec2.sub(b, a);
    const lenSq = Vec2.lengthSq(ab);
    if (lenSq === 0) return { ...a };
    const t = Math.max(0, Math.min(1, Vec2.dot(Vec2.sub(p, a), ab) / lenSq));
    return Vec2.add(a, Vec2.scale(ab, t));
}

function collideCircleCircle(a: Body, b: Body, ia: number, ib: number): Contact | null {
    if (a.shape.kind !== "circle" || b.shape.kind !== "circle") return null;
    const delta = Vec2.sub(b.pos, a.pos);
    const dist = Vec2.length(delta);
    const rSum = a.shape.radius + b.shape.radius;
    if (dist >= rSum) return null;
    const normal = dist > 0 ? Vec2.scale(delta, 1 / dist) : { x: 0, y: -1 };
    return {
        a: ia,
        b: ib,
        normal,
        depth: rSum - dist,
        point: Vec2.add(a.pos, Vec2.scale(normal, a.shape.radius)),
    };
}

/** Closest point on a convex polygon's boundary to p, plus inside-ness. */
function closestOnPolygon(p: Vec2, vertices: Vec2[]): { point: Vec2; inside: boolean } {
    let best: Vec2 = vertices[0];
    let bestDistSq = Infinity;
    let inside = true;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const v0 = vertices[i];
        const v1 = vertices[(i + 1) % n];
        const edge = Vec2.sub(v1, v0);
        if (Vec2.cross(edge, Vec2.sub(p, v0)) < 0) inside = false;
        const q = closestPointOnSegment(p, v0, v1);
        const dSq = Vec2.lengthSq(Vec2.sub(p, q));
        if (dSq < bestDistSq) {
            bestDistSq = dSq;
            best = q;
        }
    }
    return { point: best, inside };
}

function collideCirclePolygon(
    circle: Body,
    poly: Body,
    iCircle: number,
    iPoly: number
): Contact | null {
    if (circle.shape.kind !== "circle" || poly.shape.kind !== "polygon") return null;
    const verts = Body.worldVertices(poly);
    const { point, inside } = closestOnPolygon(circle.pos, verts);
    const delta = Vec2.sub(circle.pos, point);
    const dist = Vec2.length(delta);
    const r = circle.shape.radius;
    if (!inside && dist >= r) return null;
    // Normal from polygon toward circle.
    const towardCircle =
        dist > 0
            ? Vec2.scale(delta, inside ? -1 / dist : 1 / dist)
            : { x: 0, y: -1 };
    const depth = inside ? r + dist : r - dist;
    return {
        a: iPoly,
        b: iCircle,
        normal: towardCircle,
        depth,
        point,
    };
}

/** Project polygon vertices onto axis; returns [min, max]. */
function projectOnAxis(verts: Vec2[], axis: Vec2): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const v of verts) {
        const d = Vec2.dot(v, axis);
        if (d < min) min = d;
        if (d > max) max = d;
    }
    return [min, max];
}

/** Co-deep incident vertices within this range are averaged into one point. */
const CONTACT_FACE_TOLERANCE = 0.75;

function collidePolygonPolygon(a: Body, b: Body, ia: number, ib: number): Contact | null {
    if (a.shape.kind !== "polygon" || b.shape.kind !== "polygon") return null;
    const vertsA = Body.worldVertices(a);
    const vertsB = Body.worldVertices(b);

    let minOverlap = Infinity;
    let bestAxis: Vec2 | null = null;
    let bestAxisFromA = true;

    for (const [verts, fromA] of [
        [vertsA, true],
        [vertsB, false],
    ] as const) {
        const n = verts.length;
        for (let i = 0; i < n; i++) {
            const edge = Vec2.sub(verts[(i + 1) % n], verts[i]);
            const axis = Vec2.normalize(Vec2.perp(edge));
            const [minA, maxA] = projectOnAxis(vertsA, axis);
            const [minB, maxB] = projectOnAxis(vertsB, axis);
            const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
            if (overlap <= 0) return null; // separating axis found
            if (overlap < minOverlap) {
                minOverlap = overlap;
                bestAxis = axis;
                bestAxisFromA = fromA;
            }
        }
    }
    if (!bestAxis) return null;

    // Orient the normal from a toward b.
    let normal = bestAxis;
    if (Vec2.dot(Vec2.sub(b.pos, a.pos), normal) < 0) {
        normal = Vec2.scale(normal, -1);
    }

    // The contact point must come from the INCIDENT body (the one not owning
    // the separating axis) — the wrong body's vertex can sit at a far corner
    // of a large collider, and that phantom lever arm spins resting bodies.
    const incident = bestAxisFromA ? vertsB : vertsA;
    const score = (v: Vec2) =>
        bestAxisFromA ? Vec2.dot(v, normal) : -Vec2.dot(v, normal);
    let deepest = Infinity;
    for (const v of incident) deepest = Math.min(deepest, score(v));
    // Average co-deep vertices so flat rests contact at the edge midpoint.
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const v of incident) {
        if (score(v) <= deepest + CONTACT_FACE_TOLERANCE) {
            sumX += v.x;
            sumY += v.y;
            count++;
        }
    }
    const point: Vec2 = { x: sumX / count, y: sumY / count };
    return { a: ia, b: ib, normal, depth: minOverlap, point };
}

/** Closest pair of points between two segments. */
function closestSegmentSegment(
    p1: Vec2,
    p2: Vec2,
    q1: Vec2,
    q2: Vec2
): { onP: Vec2; onQ: Vec2; distSq: number } {
    const candidates: [Vec2, Vec2][] = [
        [closestPointOnSegment(q1, p1, p2), q1],
        [closestPointOnSegment(q2, p1, p2), q2],
        [p1, closestPointOnSegment(p1, q1, q2)],
        [p2, closestPointOnSegment(p2, q1, q2)],
    ];
    let best = candidates[0];
    let bestDistSq = Infinity;
    for (const c of candidates) {
        const dSq = Vec2.lengthSq(Vec2.sub(c[0], c[1]));
        if (dSq < bestDistSq) {
            bestDistSq = dSq;
            best = c;
        }
    }
    return { onP: best[0], onQ: best[1], distSq: bestDistSq };
}

function collideCircleChain(
    circle: Body,
    chain: Body,
    iCircle: number,
    iChain: number
): Contact | null {
    if (circle.shape.kind !== "circle" || chain.shape.kind !== "chain") return null;
    const pts = chain.shape.points;
    const reach = circle.shape.radius + CHAIN_THICKNESS;
    let best: Contact | null = null;

    const r = circle.shape.radius;
    const candidates = candidateSegments(
        chain.shape,
        circle.pos.x - r,
        circle.pos.y - r,
        circle.pos.x + r,
        circle.pos.y + r
    );
    for (const i of candidates) {
        const q = closestPointOnSegment(circle.pos, pts[i], pts[i + 1]);
        const delta = Vec2.sub(circle.pos, q);
        const dist = Vec2.length(delta);
        if (dist >= reach) continue;
        const depth = reach - dist;
        if (!best || depth > best.depth) {
            const normal = dist > 0 ? Vec2.scale(delta, 1 / dist) : { x: 0, y: -1 };
            best = {
                a: iChain,
                b: iCircle,
                normal,
                depth,
                point: q,
            };
        }
    }
    return best;
}

function collidePolygonChain(
    poly: Body,
    chain: Body,
    iPoly: number,
    iChain: number
): Contact | null {
    if (poly.shape.kind !== "polygon" || chain.shape.kind !== "chain") return null;
    const verts = Body.worldVertices(poly);
    const pts = chain.shape.points;
    let best: Contact | null = null;
    const n = verts.length;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const v of verts) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
    }
    const candidates = candidateSegments(chain.shape, minX, minY, maxX, maxY);
    for (const s of candidates) {
        for (let i = 0; i < n; i++) {
            const { onP, onQ, distSq } = closestSegmentSegment(
                verts[i],
                verts[(i + 1) % n],
                pts[s],
                pts[s + 1]
            );
            const dist = Math.sqrt(distSq);
            if (dist >= CHAIN_THICKNESS) continue;
            const depth = CHAIN_THICKNESS - dist;
            if (!best || depth > best.depth) {
                const delta = Vec2.sub(onP, onQ);
                const normal =
                    dist > 0
                        ? Vec2.scale(delta, 1 / dist)
                        : Vec2.normalize(Vec2.sub(poly.pos, onQ));
                best = {
                    a: iChain,
                    b: iPoly,
                    normal,
                    depth,
                    point: onQ,
                };
            }
        }
    }
    return best;
}

/** Dispatch by shape pair. Returned contact's normal points from a→b. */
export function collide(
    bodies: Body[],
    ia: number,
    ib: number
): Contact | null {
    const a = bodies[ia];
    const b = bodies[ib];
    const ka = a.shape.kind;
    const kb = b.shape.kind;
    if (ka === "circle" && kb === "circle") return collideCircleCircle(a, b, ia, ib);
    if (ka === "circle" && kb === "polygon") return collideCirclePolygon(a, b, ia, ib);
    if (ka === "polygon" && kb === "circle") return collideCirclePolygon(b, a, ib, ia);
    if (ka === "polygon" && kb === "polygon") return collidePolygonPolygon(a, b, ia, ib);
    if (ka === "circle" && kb === "chain") return collideCircleChain(a, b, ia, ib);
    if (ka === "chain" && kb === "circle") return collideCircleChain(b, a, ib, ia);
    if (ka === "polygon" && kb === "chain") return collidePolygonChain(a, b, ia, ib);
    if (ka === "chain" && kb === "polygon") return collidePolygonChain(b, a, ib, ia);
    return null; // chain–chain: both static
}
