import { AABB, Body, Chain } from "./body";
import { Vec2 } from "./vec2";

export type { AABB } from "./body";

export function bodyAABB(body: Body): AABB {
    switch (body.shape.kind) {
        case "circle": {
            const r = body.shape.radius;
            return {
                minX: body.pos.x - r,
                minY: body.pos.y - r,
                maxX: body.pos.x + r,
                maxY: body.pos.y + r,
            };
        }
        case "polygon": {
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            for (const v of Body.worldVertices(body)) {
                minX = Math.min(minX, v.x);
                minY = Math.min(minY, v.y);
                maxX = Math.max(maxX, v.x);
                maxY = Math.max(maxY, v.y);
            }
            return { minX, minY, maxX, maxY };
        }
        case "chain": {
            const index = (body.shape.index ??= Chain.index(
                body.shape.points
            ));
            return index.bounds;
        }
    }
}

const overlaps = (a: AABB, b: AABB): boolean =>
    a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** Sweep-and-prune along x; excludes static–static pairs. */
export function broadphasePairs(bodies: Body[]): [number, number][] {
    const boxes = bodies.map(bodyAABB);
    const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].minX - boxes[b].minX);
    const pairs: [number, number][] = [];
    for (let oi = 0; oi < order.length; oi++) {
        const i = order[oi];
        for (let oj = oi + 1; oj < order.length; oj++) {
            const j = order[oj];
            if (boxes[j].minX > boxes[i].maxX) break;
            if (bodies[i].isStatic && bodies[j].isStatic) continue;
            if (overlaps(boxes[i], boxes[j])) {
                pairs.push(i < j ? [i, j] : [j, i]);
            }
        }
    }
    return pairs;
}

export { Vec2 };
