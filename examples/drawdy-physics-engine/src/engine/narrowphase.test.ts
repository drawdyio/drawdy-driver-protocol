import { Body } from "./body";
import { CHAIN_THICKNESS, closestPointOnSegment, collide } from "./narrowphase";
import { simplifyPolyline } from "./simplify";
import { Vec2 } from "./vec2";
import { World, TIME_STEP } from "./world";

/** Deterministic wiggly stroke: 200 points, varying amplitude. */
const makeStroke = (n = 200): Vec2[] => {
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
        pts.push({
            x: i * 7.3,
            y: 40 * Math.sin(i * 0.31) + 12 * Math.sin(i * 1.7),
        });
    }
    return pts;
};

// Brute-force references: the pre-index implementations, kept verbatim so the
// indexed fast path must agree with them everywhere.
const refCircleChain = (circle: Body, chain: Body) => {
    if (circle.shape.kind !== "circle" || chain.shape.kind !== "chain")
        return null;
    const pts = chain.shape.points;
    const reach = circle.shape.radius + CHAIN_THICKNESS;
    let best: { depth: number; point: Vec2 } | null = null;
    for (let i = 0; i + 1 < pts.length; i++) {
        const q = closestPointOnSegment(circle.pos, pts[i], pts[i + 1]);
        const dist = Vec2.length(Vec2.sub(circle.pos, q));
        if (dist >= reach) continue;
        const depth = reach - dist;
        if (!best || depth > best.depth) best = { depth, point: q };
    }
    return best;
};

const refPolygonChain = (poly: Body, chain: Body) => {
    if (poly.shape.kind !== "polygon" || chain.shape.kind !== "chain")
        return null;
    const verts = Body.worldVertices(poly);
    const pts = chain.shape.points;
    let best: { depth: number; point: Vec2 } | null = null;
    const n = verts.length;
    const closestSegSeg = (p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2) => {
        const candidates: [Vec2, Vec2][] = [
            [closestPointOnSegment(q1, p1, p2), q1],
            [closestPointOnSegment(q2, p1, p2), q2],
            [p1, closestPointOnSegment(p1, q1, q2)],
            [p2, closestPointOnSegment(p2, q1, q2)],
        ];
        let bestPair = candidates[0];
        let bestDistSq = Infinity;
        for (const c of candidates) {
            const dSq = Vec2.lengthSq(Vec2.sub(c[0], c[1]));
            if (dSq < bestDistSq) {
                bestDistSq = dSq;
                bestPair = c;
            }
        }
        return { onQ: bestPair[1], distSq: bestDistSq };
    };
    for (let s = 0; s + 1 < pts.length; s++) {
        for (let i = 0; i < n; i++) {
            const { onQ, distSq } = closestSegSeg(
                verts[i],
                verts[(i + 1) % n],
                pts[s],
                pts[s + 1]
            );
            const dist = Math.sqrt(distSq);
            if (dist >= CHAIN_THICKNESS) continue;
            const depth = CHAIN_THICKNESS - dist;
            if (!best || depth > best.depth) best = { depth, point: onQ };
        }
    }
    return best;
};

describe("chain index parity with brute force", () => {
    const chain = Body.staticFrom(
        "chain",
        { kind: "chain", points: makeStroke() },
        { x: 0, y: 0 },
        0.5
    );

    it("circle vs chain matches everywhere on a pose grid", () => {
        for (let gx = -30; gx < 1500; gx += 37.7) {
            for (let gy = -80; gy < 80; gy += 13.3) {
                const ball = Body.dynamicCircle(
                    "b",
                    { x: gx, y: gy },
                    9,
                    0.5
                );
                const bodies = [ball, chain];
                const contact = collide(bodies, 0, 1);
                const ref = refCircleChain(ball, chain);
                expect(contact === null).toBe(ref === null);
                if (contact && ref) {
                    expect(contact.depth).toBeCloseTo(ref.depth, 9);
                    expect(contact.point.x).toBeCloseTo(ref.point.x, 9);
                    expect(contact.point.y).toBeCloseTo(ref.point.y, 9);
                }
            }
        }
    });

    it("polygon vs chain matches everywhere on a pose grid", () => {
        for (let gx = -30; gx < 1500; gx += 53.1) {
            for (let gy = -70; gy < 70; gy += 17.9) {
                const box = Body.dynamicPolygon(
                    "b",
                    [
                        { x: gx - 15, y: gy - 10 },
                        { x: gx + 15, y: gy - 10 },
                        { x: gx + 15, y: gy + 10 },
                        { x: gx - 15, y: gy + 10 },
                    ],
                    0.5
                );
                const bodies = [box, chain];
                const contact = collide(bodies, 0, 1);
                const ref = refPolygonChain(box, chain);
                expect(contact === null).toBe(ref === null);
                if (contact && ref) {
                    expect(contact.depth).toBeCloseTo(ref.depth, 9);
                    expect(contact.point.x).toBeCloseTo(ref.point.x, 9);
                    expect(contact.point.y).toBeCloseTo(ref.point.y, 9);
                }
            }
        }
    });
});

describe("simplifyPolyline", () => {
    it("crushes a smooth, densely sampled stroke", () => {
        // Realistic pointer input: smooth curve, sample every ~2px.
        const pts: Vec2[] = [];
        for (let i = 0; i < 500; i++) {
            pts.push({ x: i * 2, y: 60 * Math.sin(i * 0.02) });
        }
        const out = simplifyPolyline(pts, 1.5);
        expect(out.length).toBeLessThan(pts.length / 10);
    });

    it("keeps endpoints and stays within epsilon of the original", () => {
        const pts = makeStroke(300);
        const out = simplifyPolyline(pts, 1.5);
        expect(out[0]).toEqual(pts[0]);
        expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
        // Every original point lies within epsilon of the simplified chain.
        for (const p of pts) {
            let min = Infinity;
            for (let i = 0; i + 1 < out.length; i++) {
                const q = closestPointOnSegment(p, out[i], out[i + 1]);
                min = Math.min(min, Vec2.length(Vec2.sub(p, q)));
            }
            expect(min).toBeLessThanOrEqual(1.5 + 1e-9);
        }
    });

    it("collapses a straight over-sampled line to its endpoints", () => {
        const pts: Vec2[] = [];
        for (let i = 0; i < 100; i++) pts.push({ x: i * 3, y: 42 });
        expect(simplifyPolyline(pts, 1.5)).toHaveLength(2);
    });
});

describe("perf canary: long stroke under a pile", () => {
    it("300 steps with a 600-pt chain and 15 bodies stays fast", () => {
        const world = new World();
        world.add(
            Body.staticFrom(
                "stroke",
                { kind: "chain", points: makeStroke(600) },
                { x: 0, y: 0 },
                0.4
            )
        );
        for (let i = 0; i < 10; i++) {
            world.add(
                Body.dynamicPolygon(
                    `box${i}`,
                    [
                        { x: i * 90 - 15, y: -200 - (i % 3) * 50 },
                        { x: i * 90 + 15, y: -200 - (i % 3) * 50 },
                        { x: i * 90 + 15, y: -170 - (i % 3) * 50 },
                        { x: i * 90 - 15, y: -170 - (i % 3) * 50 },
                    ],
                    0.3
                )
            );
        }
        for (let i = 0; i < 5; i++) {
            world.add(
                Body.dynamicCircle(
                    `ball${i}`,
                    { x: 100 + i * 160, y: -400 },
                    14,
                    0.5
                )
            );
        }
        const startedAt = Date.now();
        for (let i = 0; i < 300; i++) world.step(TIME_STEP);
        const elapsed = Date.now() - startedAt;
        // Brute force took multi-second; the indexed path is ~tens of ms.
        expect(elapsed).toBeLessThan(1500);
    });
});
