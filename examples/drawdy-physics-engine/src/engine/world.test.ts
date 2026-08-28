import { Body } from "./body";
import { closestPointOnSegment } from "./narrowphase";
import { Vec2 } from "./vec2";
import { TIME_STEP, World } from "./world";

const stepSeconds = (world: World, seconds: number) => {
    const steps = Math.round(seconds / TIME_STEP);
    for (let i = 0; i < steps; i++) world.step(TIME_STEP);
};

describe("free fall", () => {
    it("integrates y ≈ ½gt² under gravity with no colliders", () => {
        const world = new World();
        const ball = Body.dynamicCircle("ball", { x: 0, y: 0 }, 10, 1);
        world.add(ball);
        const t = 0.5; // short enough that MAX_SPEED never clips the fall
        stepSeconds(world, t);
        const expected = 0.5 * world.gravity.y * t * t;
        expect(ball.pos.y).toBeGreaterThan(expected * 0.99);
        expect(ball.pos.y).toBeLessThan(expected * 1.02);
        expect(ball.pos.x).toBe(0);
    });
});

describe("static bodies", () => {
    it("never move, even when hit", () => {
        const world = new World();
        const floor = Body.staticFrom(
            "floor",
            { kind: "chain", points: [{ x: -500, y: 100 }, { x: 500, y: 100 }] },
            { x: -500, y: 100 },
            1
        );
        const ball = Body.dynamicCircle("ball", { x: 0, y: 0 }, 10, 1);
        world.add(floor);
        world.add(ball);
        stepSeconds(world, 2);
        expect(floor.pos).toEqual({ x: -500, y: 100 });
        expect(world.poseDeltas().map((d) => d.id)).toEqual(["ball"]);
    });
});

describe("elastic bounce (e = 1)", () => {
    it("reflects the perpendicular velocity, conserving speed", () => {
        const world = new World();
        world.gravity = { x: 0, y: 0 }; // isolate the reflection
        const floor = Body.staticFrom(
            "floor",
            { kind: "chain", points: [{ x: -500, y: 50 }, { x: 500, y: 50 }] },
            { x: -500, y: 50 },
            1,
            0 // frictionless: isolate the reflection
        );
        const ball = Body.dynamicCircle("ball", { x: 0, y: 0 }, 10, 1, 0);
        ball.vel = { x: 30, y: 200 };
        world.add(floor);
        world.add(ball);
        stepSeconds(world, 0.5);
        expect(ball.vel.y).toBeCloseTo(-200, 0);
        expect(ball.vel.x).toBeCloseTo(30, 5);
        expect(Vec2.length(ball.vel)).toBeCloseTo(Math.hypot(30, 200), 0);
    });
});

describe("momentum conservation", () => {
    it("conserves linear momentum in a dynamic-dynamic collision", () => {
        const world = new World();
        world.gravity = { x: 0, y: 0 };
        // Frictionless: contact damping is deliberately non-conservative.
        const a = Body.dynamicCircle("a", { x: -50, y: 0 }, 10, 1, 0);
        const b = Body.dynamicCircle("b", { x: 50, y: 0 }, 10, 1, 0);
        a.vel = { x: 100, y: 0 };
        world.add(a);
        world.add(b);
        const momentumBefore = a.vel.x / a.invMass + b.vel.x / b.invMass;
        stepSeconds(world, 1.5);
        const momentumAfter = a.vel.x / a.invMass + b.vel.x / b.invMass;
        expect(momentumAfter).toBeCloseTo(momentumBefore, 5);
        // equal masses, head-on elastic: velocities swap
        expect(a.vel.x).toBeCloseTo(0, 0);
        expect(b.vel.x).toBeCloseTo(100, 0);
    });
});

describe("circle–segment contact math", () => {
    it("projects onto the midline when between endpoints", () => {
        const p = closestPointOnSegment(
            { x: 5, y: 7 },
            { x: 0, y: 0 },
            { x: 10, y: 0 }
        );
        expect(p).toEqual({ x: 5, y: 0 });
    });
    it("clamps to the endpoint when the angle exceeds 90°", () => {
        const p = closestPointOnSegment(
            { x: -4, y: 3 },
            { x: 0, y: 0 },
            { x: 10, y: 0 }
        );
        expect(p).toEqual({ x: 0, y: 0 });
    });
});

describe("friction", () => {
    it("stops a sliding box — runs settle instead of sliding forever", () => {
        const world = new World();
        const floor = Body.staticFrom(
            "floor",
            {
                kind: "polygon",
                vertices: [
                    { x: -2000, y: -10 },
                    { x: 2000, y: -10 },
                    { x: 2000, y: 10 },
                    { x: -2000, y: 10 },
                ],
            },
            { x: 0, y: 60 },
            0.1
        );
        const box = Body.dynamicPolygon(
            "box",
            [
                { x: -20, y: -20 },
                { x: 20, y: -20 },
                { x: 20, y: 20 },
                { x: -20, y: 20 },
            ],
            0.1
        );
        box.vel = { x: 400, y: 0 };
        world.add(floor);
        world.add(box);
        stepSeconds(world, 5);
        expect(Vec2.length(box.vel)).toBeLessThan(4);
        expect(Math.abs(box.angVel)).toBeLessThan(0.25);
    });

    it("brings a bouncing, rolling ball to rest", () => {
        const world = new World();
        const floor = Body.staticFrom(
            "floor",
            {
                kind: "polygon",
                vertices: [
                    { x: -2000, y: -10 },
                    { x: 2000, y: -10 },
                    { x: 2000, y: 10 },
                    { x: -2000, y: 10 },
                ],
            },
            { x: 0, y: 200 },
            0.6
        );
        const ball = Body.dynamicCircle("ball", { x: 0, y: 0 }, 15, 0.6);
        ball.vel = { x: 250, y: 0 };
        world.add(floor);
        world.add(ball);
        stepSeconds(world, 10);
        expect(Vec2.length(ball.vel)).toBeLessThan(12);
        expect(Math.abs(ball.angVel)).toBeLessThan(0.25);
    });
});

describe("contact point selection", () => {
    it("a box resting on a huge collider does not spin (incident-body contact)", () => {
        const world = new World();
        const box = Body.dynamicPolygon(
            "box",
            [
                { x: -20, y: 60 },
                { x: 20, y: 60 },
                { x: 20, y: 100 },
                { x: -20, y: 100 },
            ],
            0.1
        );
        // Wall added AFTER the dynamic body, the ordering a run uses: the
        // contact point must come from the box, not a far wall corner.
        const wall = Body.staticFrom(
            "wall",
            {
                kind: "polygon",
                vertices: [
                    { x: -1500, y: -250 },
                    { x: 1500, y: -250 },
                    { x: 1500, y: 250 },
                    { x: -1500, y: 250 },
                ],
            },
            { x: 0, y: 370 },
            0.4
        );
        world.add(box);
        world.add(wall);
        stepSeconds(world, 3);
        expect(Math.abs(box.angVel)).toBeLessThan(0.25);
        expect(Math.abs(box.angle)).toBeLessThan(0.1); // never started tumbling
        expect(Math.abs(box.pos.x)).toBeLessThan(5); // no sideways drift
        expect(box.pos.y).toBeGreaterThan(80); // resting on the wall top
        expect(box.pos.y).toBeLessThan(125);
    });
});

describe("resting", () => {
    it("a box settles on a floor without sinking through", () => {
        const world = new World();
        const floor = Body.staticFrom(
            "floor",
            {
                kind: "polygon",
                vertices: [
                    { x: -500, y: -10 },
                    { x: 500, y: -10 },
                    { x: 500, y: 10 },
                    { x: -500, y: 10 },
                ],
            },
            { x: 0, y: 200 },
            0.1
        );
        const box = Body.dynamicPolygon(
            "box",
            [
                { x: -20, y: -20 },
                { x: 20, y: -20 },
                { x: 20, y: 20 },
                { x: -20, y: 20 },
            ],
            0.1
        );
        world.add(floor);
        world.add(box);
        stepSeconds(world, 3);
        expect(box.pos.y).toBeGreaterThan(150);
        expect(box.pos.y).toBeLessThan(195);
    });
});
