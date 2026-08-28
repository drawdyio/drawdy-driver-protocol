import { Vec2 } from "./vec2";

const pointSegmentDistance = (p: Vec2, a: Vec2, b: Vec2): number => {
    const ab = Vec2.sub(b, a);
    const lenSq = Vec2.lengthSq(ab);
    if (lenSq === 0) return Vec2.length(Vec2.sub(p, a));
    const t = Math.max(0, Math.min(1, Vec2.dot(Vec2.sub(p, a), ab) / lenSq));
    return Vec2.length(Vec2.sub(p, Vec2.add(a, Vec2.scale(ab, t))));
};

export function simplifyPolyline(points: Vec2[], epsilon: number): Vec2[] {
    if (points.length <= 2) return points;
    const keep = new Array<boolean>(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length > 0) {
        const [a, b] = stack.pop()!;
        let maxDist = -1;
        let maxI = -1;
        for (let i = a + 1; i < b; i++) {
            const d = pointSegmentDistance(points[i], points[a], points[b]);
            if (d > maxDist) {
                maxDist = d;
                maxI = i;
            }
        }
        if (maxDist > epsilon) {
            keep[maxI] = true;
            stack.push([a, maxI], [maxI, b]);
        }
    }
    return points.filter((_, i) => keep[i]);
}
