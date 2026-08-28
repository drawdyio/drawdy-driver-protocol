export type Vec2 = { x: number; y: number };

export const Vec2 = {
    zero(): Vec2 {
        return { x: 0, y: 0 };
    },
    add(a: Vec2, b: Vec2): Vec2 {
        return { x: a.x + b.x, y: a.y + b.y };
    },
    sub(a: Vec2, b: Vec2): Vec2 {
        return { x: a.x - b.x, y: a.y - b.y };
    },
    scale(a: Vec2, s: number): Vec2 {
        return { x: a.x * s, y: a.y * s };
    },
    dot(a: Vec2, b: Vec2): number {
        return a.x * b.x + a.y * b.y;
    },
    /** z of the 3D cross product. */
    cross(a: Vec2, b: Vec2): number {
        return a.x * b.y - a.y * b.x;
    },
    /** ω × r for scalar angular velocity ω. */
    crossScalar(w: number, r: Vec2): Vec2 {
        return { x: -w * r.y, y: w * r.x };
    },
    length(a: Vec2): number {
        return Math.hypot(a.x, a.y);
    },
    lengthSq(a: Vec2): number {
        return a.x * a.x + a.y * a.y;
    },
    normalize(a: Vec2): Vec2 {
        const len = Math.hypot(a.x, a.y);
        return len > 0 ? { x: a.x / len, y: a.y / len } : { x: 0, y: 0 };
    },
    /** Left-hand perpendicular. */
    perp(a: Vec2): Vec2 {
        return { x: -a.y, y: a.x };
    },
    rotate(a: Vec2, angle: number): Vec2 {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
    },
    rotateAbout(a: Vec2, center: Vec2, angle: number): Vec2 {
        return Vec2.add(Vec2.rotate(Vec2.sub(a, center), angle), center);
    },
};
