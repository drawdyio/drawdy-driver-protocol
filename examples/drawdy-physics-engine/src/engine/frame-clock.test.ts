import { FrameClock } from "./frame-clock";

const SUBSTEP = 1000 / 120; // ~8.33ms

describe("FrameClock", () => {
    it("pays exactly wall time at a steady cadence", () => {
        const clock = new FrameClock(SUBSTEP, 30, 1000);
        let t = 0;
        clock.tick(t);
        let steps = 0;
        for (let i = 0; i < 120; i++) {
            t += 1000 / 60;
            steps += clock.tick(t);
        }
        // 2 seconds of wall time → within one substep of 2s simulated.
        expect(Math.abs(steps * SUBSTEP - 2000)).toBeLessThan(SUBSTEP);
    });

    it("repays late-frame debt instead of discarding it", () => {
        const clock = new FrameClock(SUBSTEP, 30, 1000);
        const schedule = [16, 16, 300, 16, 16, 16, 16, 16, 16, 16, 16, 16];
        let t = 0;
        clock.tick(t);
        let steps = 0;
        let elapsed = 0;
        for (const gap of schedule) {
            t += gap;
            elapsed += gap;
            steps += clock.tick(t);
        }
        expect(Math.abs(steps * SUBSTEP - elapsed)).toBeLessThan(SUBSTEP);
    });

    it("caps per-frame catch-up but keeps the remainder as debt", () => {
        const clock = new FrameClock(SUBSTEP, 30, 1000);
        clock.tick(0);
        const burst = clock.tick(500); // 500ms late frame
        expect(burst).toBe(30); // capped
        // The unpaid ~250ms is settled over the next frames.
        let repaid = burst;
        let t = 500;
        for (let i = 0; i < 20; i++) {
            t += 16;
            repaid += clock.tick(t);
        }
        expect(Math.abs(repaid * SUBSTEP - (500 + 20 * 16))).toBeLessThan(
            SUBSTEP
        );
    });

    it("treats gaps beyond the debt cap as suspension, not debt", () => {
        const clock = new FrameClock(SUBSTEP, 30, 1000);
        clock.tick(0);
        let steps = clock.tick(10_000); // 10s sleep
        let t = 10_000;
        for (let i = 0; i < 200; i++) {
            t += 16;
            steps += clock.tick(t);
        }
        // Only the capped 1s of debt plus the live 3.2s is simulated.
        expect(steps * SUBSTEP).toBeLessThan(1000 + 200 * 16 + SUBSTEP);
    });
});
