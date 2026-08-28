import { Vec2 } from "./vec2";

export type AABB = { minX: number; minY: number; maxX: number; maxY: number };
export const CHAIN_THICKNESS = 4;
const CHAIN_GROUP_SIZE = 8;

export type ChainIndex = {
    /** Per-segment AABBs, inflated by CHAIN_THICKNESS. */
    segments: AABB[];
    /** Union AABBs over runs of CHAIN_GROUP_SIZE segments. */
    groups: AABB[];
    /** Union of everything — the chain's broadphase AABB. */
    bounds: AABB;
};

export const Chain = {
    GROUP_SIZE: CHAIN_GROUP_SIZE,

    index(points: Vec2[]): ChainIndex {
        const T = CHAIN_THICKNESS;
        const segments: AABB[] = [];
        for (let i = 0; i + 1 < points.length; i++) {
            const a = points[i];
            const b = points[i + 1];
            segments.push({
                minX: Math.min(a.x, b.x) - T,
                minY: Math.min(a.y, b.y) - T,
                maxX: Math.max(a.x, b.x) + T,
                maxY: Math.max(a.y, b.y) + T,
            });
        }
        const groups: AABB[] = [];
        for (let g = 0; g < segments.length; g += CHAIN_GROUP_SIZE) {
            const group = { ...segments[g] };
            for (
                let i = g + 1;
                i < Math.min(g + CHAIN_GROUP_SIZE, segments.length);
                i++
            ) {
                const seg = segments[i];
                group.minX = Math.min(group.minX, seg.minX);
                group.minY = Math.min(group.minY, seg.minY);
                group.maxX = Math.max(group.maxX, seg.maxX);
                group.maxY = Math.max(group.maxY, seg.maxY);
            }
            groups.push(group);
        }
        const bounds = groups.length
            ? groups.reduce((acc, g) => ({
                  minX: Math.min(acc.minX, g.minX),
                  minY: Math.min(acc.minY, g.minY),
                  maxX: Math.max(acc.maxX, g.maxX),
                  maxY: Math.max(acc.maxY, g.maxY),
              }))
            : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        return { segments, groups, bounds };
    },
};

export type CircleShape = {
    kind: "circle";
    radius: number;
};

/** Convex polygon, vertices in LOCAL space (origin = center of mass). */
export type PolygonShape = {
    kind: "polygon";
    vertices: Vec2[];
};

/** Open segment chain in WORLD space — static-only stroke colliders. */
export type ChainShape = {
    kind: "chain";
    points: Vec2[];
    index?: ChainIndex;
};

export type Shape = CircleShape | PolygonShape | ChainShape;

export type Body = {
    id: string;
    shape: Shape;
    /** Center of mass, world space. */
    pos: Vec2;
    /** Radians, on top of the rest pose. */
    angle: number;
    vel: Vec2;
    angVel: number;
    /** 0 for static bodies (infinite mass). */
    invMass: number;
    /** 0 for static bodies. */
    invInertia: number;
    restitution: number;
    /** Coulomb friction coefficient; pairs combine as √(μa·μb). */
    friction: number;
    isStatic: boolean;
    /** The pose the body started from, to report deltas back to the board. */
    restPos: Vec2;
    /** Set by the solver when a frictional contact fired this step. */
    touching: boolean;
    /** worldVertices cache; valid while pos/angle are these exact objects. */
    _worldVerts?: { pos: Vec2; angle: number; verts: Vec2[] };
};

const DENSITY = 0.001; // only mass ratios matter

export const DEFAULT_FRICTION = 0.3;

export const Body = {
    dynamicCircle(
        id: string,
        center: Vec2,
        radius: number,
        restitution: number,
        friction: number = DEFAULT_FRICTION
    ): Body {
        const mass = DENSITY * Math.PI * radius * radius;
        const inertia = 0.5 * mass * radius * radius;
        return {
            id,
            shape: { kind: "circle", radius },
            pos: { ...center },
            angle: 0,
            vel: Vec2.zero(),
            angVel: 0,
            invMass: 1 / mass,
            invInertia: 1 / inertia,
            restitution,
            friction,
            isStatic: false,
            restPos: { ...center },
            touching: false,
        };
    },

    /** Dynamic convex polygon from world-space vertices. */
    dynamicPolygon(
        id: string,
        worldVertices: Vec2[],
        restitution: number,
        friction: number = DEFAULT_FRICTION
    ): Body {
        const { centroid, area, inertiaPerMass } = polygonMassProps(worldVertices);
        const mass = Math.max(DENSITY * area, 1e-9);
        const inertia = Math.max(mass * inertiaPerMass, 1e-9);
        return {
            id,
            shape: {
                kind: "polygon",
                vertices: worldVertices.map((v) => Vec2.sub(v, centroid)),
            },
            pos: centroid,
            angle: 0,
            vel: Vec2.zero(),
            angVel: 0,
            invMass: 1 / mass,
            invInertia: 1 / inertia,
            restitution,
            friction,
            isStatic: false,
            restPos: { ...centroid },
            touching: false,
        };
    },

    staticFrom(
        id: string,
        shape: Shape,
        pos: Vec2,
        restitution: number,
        friction: number = DEFAULT_FRICTION
    ): Body {
        if (shape.kind === "chain" && !shape.index) {
            shape.index = Chain.index(shape.points);
        }
        return {
            id,
            shape,
            pos: { ...pos },
            angle: 0,
            vel: Vec2.zero(),
            angVel: 0,
            invMass: 0,
            invInertia: 0,
            restitution,
            friction,
            isStatic: true,
            restPos: { ...pos },
            touching: false,
        };
    },

    /**
     * World-space vertices of a polygon body at its current pose. Cached by
     * pos/angle identity — the integrator assigns fresh objects, so the cache
     * stays valid exactly for the solver iterations of one substep.
     */
    worldVertices(body: Body): Vec2[] {
        if (body.shape.kind !== "polygon") {
            throw new Error("worldVertices: not a polygon");
        }
        const cache = body._worldVerts;
        if (cache && cache.pos === body.pos && cache.angle === body.angle) {
            return cache.verts;
        }
        const verts = body.shape.vertices.map((v) =>
            Vec2.add(Vec2.rotate(v, body.angle), body.pos)
        );
        body._worldVerts = { pos: body.pos, angle: body.angle, verts };
        return verts;
    },
};

/** Area, centroid, and inertia-per-mass of a simple polygon (shoelace). */
export function polygonMassProps(vertices: Vec2[]): {
    centroid: Vec2;
    area: number;
    inertiaPerMass: number;
} {
    let area2 = 0; // 2×signed area
    let cx = 0;
    let cy = 0;
    let inertiaNum = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const p = vertices[i];
        const q = vertices[(i + 1) % n];
        const cross = Vec2.cross(p, q);
        area2 += cross;
        cx += (p.x + q.x) * cross;
        cy += (p.y + q.y) * cross;
        inertiaNum +=
            cross *
            (p.x * p.x + p.x * q.x + q.x * q.x + p.y * p.y + p.y * q.y + q.y * q.y);
    }
    const area = Math.abs(area2) / 2;
    if (area < 1e-12) {
        // degenerate: point mass at the vertex mean
        const mean = vertices.reduce(
            (acc, v) => Vec2.add(acc, Vec2.scale(v, 1 / n)),
            Vec2.zero()
        );
        return { centroid: mean, area: 1e-9, inertiaPerMass: 1e-9 };
    }
    const centroid = { x: cx / (3 * area2), y: cy / (3 * area2) };
    const inertiaOriginPerMass = inertiaNum / (6 * area2);
    const inertiaPerMass =
        Math.abs(inertiaOriginPerMass) - Vec2.lengthSq(centroid);
    return {
        centroid,
        area,
        inertiaPerMass: Math.max(inertiaPerMass, 1e-9),
    };
}
