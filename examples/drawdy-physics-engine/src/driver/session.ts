import {
    SubscribeableKey,
    SubscribedDrawdyElement,
} from "@drawdy/driver-protocol";
import { Body } from "../engine/body";
import { FrameClock } from "../engine/frame-clock";
import { SIM_MULTIPLIER, TICK, TIME_STEP, World } from "../engine/world";
import { Vec2 } from "../engine/vec2";
import { buildDynamicBody, buildStaticBody } from "./colliders";
import { Ctx, stamp, unwrap } from "./context";
import { isDynamicEligible, physicsMode } from "./meta";
import {
    SandboxRect,
    createSandbox,
    defaultRectAround,
    findSandboxes,
    isInside,
    isPointInside,
    sandboxRect,
} from "./sandbox";

const ELEMENT_PROPERTIES: SubscribeableKey[] = [
    "type",
    "componentType",
    "meta",
    "locked",
    "points",
    "rotation",
    "x",
    "y",
    "width",
    "height",
];

// Sleep thresholds. Resting-contact noise scales with GRAVITY·dt (~21 px/s
// injected per substep at g=5000), so the linear threshold sits above the
// post-resolve residual — too strict and runs never settle.
const SLEEP_LINEAR = 12; // px/s
const SLEEP_ANGULAR = 0.25; // rad/s
/** Calm wall-time before the run auto-commits. */
const SETTLE_MS = 750;
// Pose deltas below these are "didn't move" and are not committed.
const COMMIT_EPSILON_PX = 0.01;
const COMMIT_EPSILON_RAD = 0.001;
/** Geometry drift above this in an event = someone moved the element. */
const GEOM_EPSILON = 0.01;
const AUTO_START_DEBOUNCE_MS = 400;

const WALL_ID_PREFIX = "__sandbox-wall:";
/** Thin walls let fast bodies tunnel. */
const WALL_THICKNESS = 500;

const DRAG_HOLD_MS = 500;

/** Wall milliseconds each physics substep represents. */
const SUBSTEP_WALL_MS = 1000 / (TICK * SIM_MULTIPLIER);
/** Catch-up cap per frame; unpaid time stays as debt (never discarded). */
const MAX_CATCHUP_SUBSTEPS = 30;
/** Debt cap: longer gaps are suspension (tab sleep), not debt. */
const MAX_DEBT_MS = 1000;
/** Preview sends allowed in flight; beyond it, latest-wins skip. */
const MAX_SENDS_IN_FLIGHT = 2;
/**
 * Wall budget for one frame's stepping. A pathological pile can't produce
 * multi-hundred-ms frames — unexecuted substeps are refunded to the clock
 * and repaid later, so gravity stays wall-true while frames stay responsive.
 */
const STEP_BUDGET_MS = 30;

/**
 * Frame scheduler: requestAnimationFrame when the worker exposes it (smooth,
 * display-synced), raced against a timeout so a throttled rAF can't stall
 * the simulation. Whichever fires first runs the frame once.
 */
const scheduleFrame = (cb: () => void): void => {
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        cb();
    };
    const timer = setTimeout(run, 1000 / TICK);
    const raf = (
        globalThis as { requestAnimationFrame?: (cb: () => void) => number }
    ).requestAnimationFrame;
    if (typeof raf === "function") {
        raf(() => {
            clearTimeout(timer);
            run();
        });
    }
};

type SourceGeom = {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
};

const sourceGeomOf = (el: SubscribedDrawdyElement): SourceGeom | null =>
    el.x == null || el.y == null || el.width == null || el.height == null
        ? null
        : {
              x: el.x,
              y: el.y,
              w: el.width,
              h: el.height,
              rotation: el.rotation ?? 0,
          };

const geomChanged = (a: SourceGeom, b: SourceGeom): boolean =>
    Math.abs(a.x - b.x) > GEOM_EPSILON ||
    Math.abs(a.y - b.y) > GEOM_EPSILON ||
    Math.abs(a.w - b.w) > GEOM_EPSILON ||
    Math.abs(a.h - b.h) > GEOM_EPSILON ||
    Math.abs(a.rotation - b.rotation) > GEOM_EPSILON;

/**
 * A live simulation run: tagging (re)starts it, it auto-commits as one undo
 * step once every body settles, and user edits mid-run rebuild the affected
 * bodies in place.
 */
export class PhysicsSession {
    private _world: World | null = null;
    private _running = false;
    /** Geometry each body was built from, to tell user edits from our echoes. */
    private _sourceGeom = new Map<string, SourceGeom>();
    private _settleMs = 0;
    /** Serializes restart/commit — tag clicks can arrive mid-transition. */
    private _busy = false;
    private _autoStartTimer: ReturnType<typeof setTimeout> | null = null;
    /** Bodies pinned under the user's cursor: id → {holdUntil, last element}. */
    private _held = new Map<
        string,
        { until: number; el: SubscribedDrawdyElement }
    >();
    /** Held ids whose release (re-snapshot round-trip) is in flight. */
    private _releasing = new Set<string>();
    /** Pre-run poses of the last run's dynamic bodies (undo detection). */
    private _lastRunRest = new Map<string, SourceGeom>();
    /** Last seen geometry of every tagged element, kept while idle. */
    private _idleGeom = new Map<string, SourceGeom>();
    /** Elements being dragged when a restart fires — re-held on start. */
    private _pendingHeldIds = new Set<string>();
    /** Ids in the host's current drag gesture (dragStart → dragEnd). */
    private _draggedIds = new Set<string>();
    /** Gates the load-time auto-start retries. */
    public hasEverRun = false;
    /** Every sandbox on the board: element id → interior rect. */
    private _sandboxes = new Map<string, SandboxRect>();
    /** Pose deltas of bodies that escaped mid-run, kept for the commit. */
    private _escaped = new Map<
        string,
        { dx: number; dy: number; dRotation: number }
    >();

    constructor(private _ctx: Ctx) {}

    /**
     * Tagged elements appeared (paste, board restore, peer add): simulate
     * them, debounced. Undo restoring the last run's pre-sim pose must not
     * re-drop everything, so those are filtered out.
     */
    onElementsAppeared(els: ReadonlyArray<SubscribedDrawdyElement>): void {
        if (this.running && this._world) {
            // Join the running world in place — a full restart would leave
            // the sim worldless for the round-trips (mid-air freezes).
            void this._addToRunningWorld(els);
            return;
        }
        let trigger = false;
        for (const el of els) {
            const mode = physicsMode(el);
            // A sandbox appearing (our own creation echo, or a peer's) has
            // no bodies to drop; the next run adopts it.
            if (mode === "none" || mode === "sandbox") continue;
            const now = sourceGeomOf(el);
            if (now) {
                const rest = this._lastRunRest.get(el.id);
                this._idleGeom.set(el.id, now);
                if (rest && !geomChanged(rest, now)) continue; // undo
            }
            trigger = true;
        }
        if (!trigger) return;
        if (this._autoStartTimer) clearTimeout(this._autoStartTimer);
        this._autoStartTimer = setTimeout(() => {
            this._autoStartTimer = null;
            void this.restart();
        }, AUTO_START_DEBOUNCE_MS);
    }

    /** Pasted/added tagged elements join the running simulation directly. */
    private async _addToRunningWorld(
        els: ReadonlyArray<SubscribedDrawdyElement>
    ): Promise<void> {
        const world = this._world;
        if (!world) return;
        const fresh = els.filter(
            (el) =>
                !this._sourceGeom.has(el.id) &&
                !world.bodies.some((b) => b.id === el.id)
        );
        const dynamicEls = fresh.filter(
            (el) => physicsMode(el) === "dynamic" && isDynamicEligible(el)
        );
        const staticEls = fresh.filter((el) => physicsMode(el) === "static");
        for (const el of staticEls) {
            const body = buildStaticBody(el);
            if (!body) continue;
            world.add(body);
            const src = sourceGeomOf(el);
            if (src) {
                this._sourceGeom.set(el.id, src);
                this._idleGeom.set(el.id, src);
            }
        }
        if (dynamicEls.length > 0) {
            const { began } = unwrap(
                await this._ctx.issueCommand({
                    type: "command:scene:begin-preview",
                    ...stamp(this._ctx),
                    req: {
                        drawdyElementIds: dynamicEls.map((el) => el.id),
                    },
                })
            );
            if (this._world !== world) return; // run ended meanwhile
            const beganSet = new Set(began);
            for (const el of dynamicEls) {
                if (!beganSet.has(el.id)) continue;
                const body = buildDynamicBody(el);
                if (!body) continue;
                world.add(body);
                const src = sourceGeomOf(el);
                if (src) {
                    this._sourceGeom.set(el.id, src);
                    this._idleGeom.set(el.id, src);
                    this._lastRunRest.set(el.id, src);
                }
            }
        }
        this._settleMs = 0;
    }

    get running(): boolean {
        return this._running;
    }

    /**
     * (Re)start the simulation. A run in flight commits first and carries
     * body velocities over, so retagging mid-air doesn't stall objects.
     */
    async restart(): Promise<void> {
        if (this._busy) return;
        this._busy = true;
        try {
            const carriedVel = new Map<
                string,
                { vel: Vec2; angVel: number }
            >();
            if (this._world) {
                for (const b of this._world.bodies) {
                    if (b.isStatic) continue;
                    carriedVel.set(b.id, { vel: { ...b.vel }, angVel: b.angVel });
                }
            }
            await this._commitAndStop();
            await this._start(carriedVel);
        } finally {
            this._busy = false;
        }
    }

    /** Ids joined the host's drag gesture: keep them pinned until dragEnd. */
    onDragActive(ids: string[]): void {
        for (const id of ids) {
            this._draggedIds.add(id);
            const hold = this._held.get(id);
            if (hold) hold.until = Infinity;
        }
    }

    /** The drag gesture ended — release every drag-held body next frame. */
    onDragEnd(): void {
        const now = Date.now();
        for (const hold of this._held.values()) {
            if (!Number.isFinite(hold.until)) hold.until = now;
        }
        this._draggedIds.clear();
    }

    /** An element was deleted on the board — drop its body mid-run. */
    onElementsRemoved(ids: string[]): void {
        for (const id of ids) {
            if (!this._sandboxes.delete(id)) continue;
            // A deleted sandbox takes its walls with it; the escape scan
            // untags whatever it contained. With no sandbox left at all,
            // bank the poses and go idle instead of simulating unbounded.
            this._idleGeom.delete(id);
            this._removeWalls(id);
            if (this._sandboxes.size === 0 && this._world) {
                void this._commitAndStop();
                return;
            }
        }
        if (!this._world) {
            // Idle: deleting a tagged element re-simulates the rest.
            let tagged = false;
            for (const id of ids) {
                if (this._idleGeom.delete(id)) tagged = true;
            }
            if (tagged && !this._busy) void this.restart();
            return;
        }
        for (const id of ids) {
            this._world.remove(id);
            this._sourceGeom.delete(id);
            this._held.delete(id);
            this._idleGeom.delete(id);
        }
        this._settleMs = 0; // a removed support may free resting bodies
    }

    /**
     * Our own writes never move geometry (preview ticks are silent), so a
     * changed pose means the user or a peer moved the element.
     */
    onElementsUpdated(els: ReadonlyArray<SubscribedDrawdyElement>): void {
        if (!this.running || !this._world) {
            // Idle: re-simulate. Commit echoes compare equal against the
            // pre-updated baselines; undo restoring the pre-sim pose is
            // skipped — re-simulating it would make undo impossible.
            if (this._busy) return;
            let trigger = false;
            for (const el of els) {
                const mode = physicsMode(el);
                if (mode === "none") continue;
                const now = sourceGeomOf(el);
                if (!now) continue;
                const before = this._idleGeom.get(el.id);
                this._idleGeom.set(el.id, now);
                if (!before || !geomChanged(before, now)) continue;
                if (mode === "sandbox") {
                    this._sandboxes.set(el.id, {
                        x: now.x,
                        y: now.y,
                        w: now.w,
                        h: now.h,
                    });
                    trigger = true;
                    continue;
                }
                const rest = this._lastRunRest.get(el.id);
                if (rest && !geomChanged(rest, now)) continue; // undo
                if (this._sandboxes.size > 0 && !this._insideAny(now)) {
                    void this._untag([el.id]);
                    continue;
                }
                // A moving dynamic element is mid-drag: the new run must
                // grip it from its first frame, or it falls out of the hand.
                if (mode === "dynamic" && isDynamicEligible(el)) {
                    this._pendingHeldIds.add(el.id);
                }
                trigger = true;
            }
            if (trigger) void this.restart();
            return;
        }
        for (const el of els) {
            if (this._sandboxes.has(el.id)) {
                const rect = sandboxRect(el);
                const prev = this._sandboxes.get(el.id);
                if (
                    rect &&
                    prev &&
                    (rect.x !== prev.x ||
                        rect.y !== prev.y ||
                        rect.w !== prev.w ||
                        rect.h !== prev.h)
                ) {
                    this._sandboxes.set(el.id, rect);
                    this._buildWallsFor(this._world, el.id, rect);
                    this._settleMs = 0;
                }
                continue;
            }
            const before = this._sourceGeom.get(el.id);
            if (!before) continue;
            const now = sourceGeomOf(el);
            if (!now || !geomChanged(before, now)) continue;

            const mode = physicsMode(el);
            if (mode === "dynamic" && isDynamicEligible(el)) {
                // Mid-drag: pin an immovable placeholder at the cursor pose
                // (others collide with it) — the drag itself renders
                // natively through the select tool, since pinned bodies are
                // static and excluded from preview writes.
                if (!this._held.has(el.id)) {
                    console.info(`[drawdy-physics] grab ${el.id}`);
                }
                this._world.remove(el.id);
                const body = buildDynamicBody(el);
                if (body) {
                    body.invMass = 0;
                    body.invInertia = 0;
                    body.isStatic = true;
                    this._world.add(body);
                    this._held.set(el.id, {
                        until: this._draggedIds.has(el.id)
                            ? Infinity
                            : Date.now() + DRAG_HOLD_MS,
                        el,
                    });
                }
            } else if (mode === "static") {
                this._world.remove(el.id);
                const rebuilt = buildStaticBody(el);
                if (rebuilt) this._world.add(rebuilt);
            } else {
                this._world.remove(el.id);
            }
            this._sourceGeom.set(el.id, now);
            this._settleMs = 0;
        }
    }

    private async _start(
        carriedVel: Map<string, { vel: Vec2; angVel: number }>
    ): Promise<void> {
        const ctx = this._ctx;

        const { drawdyElements } = unwrap(
            await ctx.issueCommand({
                type: "command:scene:get-drawdy-elements",
                ...stamp(ctx),
                req: { properties: ELEMENT_PROPERTIES },
            })
        );

        const allDynamic = drawdyElements.filter(
            (el) => physicsMode(el) === "dynamic" && isDynamicEligible(el)
        );
        const allStatic = drawdyElements.filter(
            (el) => physicsMode(el) === "static"
        );
        if (allDynamic.length === 0) {
            console.info(
                `[drawdy-physics] no dynamic bodies among ${drawdyElements.length} elements; staying idle`
            );
            return;
        }

        // Adopt the board's sandboxes, or create one around the tagged content.
        const sandboxEls = findSandboxes(drawdyElements);
        this._sandboxes = new Map(
            sandboxEls.map((el) => [el.id, sandboxRect(el)!])
        );
        if (this._sandboxes.size === 0) {
            const { rect } = unwrap(
                await ctx.issueCommand({
                    type: "command:scene:query-combined-rect",
                    ...stamp(ctx),
                    req: {
                        drawdyElementIds: [...allDynamic, ...allStatic].map(
                            (el) => el.id
                        ),
                    },
                })
            );
            const box = defaultRectAround(rect);
            const id = await createSandbox(ctx, box, "Sandbox 1");
            this._sandboxes.set(id, box);
            console.info(
                `[drawdy-physics] sandbox created ${Math.round(box.w)}x${Math.round(box.h)}`
            );
        }

        // Elements outside every sandbox lose their tag and stay out of the world.
        const inBox = (el: SubscribedDrawdyElement): boolean => {
            const g = sourceGeomOf(el);
            return !g || this._insideAny(g);
        };
        const escapedIds = [...allDynamic, ...allStatic]
            .filter((el) => !inBox(el))
            .map((el) => el.id);
        if (escapedIds.length > 0) await this._untag(escapedIds);
        const dynamicEls = allDynamic.filter(inBox);
        const staticEls = allStatic.filter(inBox);
        if (dynamicEls.length === 0) {
            console.info(
                `[drawdy-physics] every dynamic body was outside the sandbox; staying idle`
            );
            return;
        }

        const { began } = unwrap(
            await ctx.issueCommand({
                type: "command:scene:begin-preview",
                ...stamp(ctx),
                req: { drawdyElementIds: dynamicEls.map((el) => el.id) },
            })
        );
        const beganSet = new Set(began);

        const world = new World();
        this._sourceGeom = new Map();
        this._escaped.clear();
        for (const el of dynamicEls) {
            if (!beganSet.has(el.id)) continue; // grouped: rejected by host
            const body = buildDynamicBody(el);
            if (!body) continue;
            const carried = carriedVel.get(el.id);
            if (carried) {
                body.vel = carried.vel;
                body.angVel = carried.angVel;
            }
            world.add(body);
            const src = sourceGeomOf(el);
            if (src) this._sourceGeom.set(el.id, src);
        }
        for (const el of staticEls) {
            const body = buildStaticBody(el);
            if (!body) continue;
            world.add(body);
            const src = sourceGeomOf(el);
            if (src) this._sourceGeom.set(el.id, src);
        }
        for (const [id, rect] of this._sandboxes) {
            this._buildWallsFor(world, id, rect);
        }
        if (world.bodies.every((b) => b.isStatic)) {
            this._world = world;
            await this._commitAndStop();
            return;
        }

        console.info(
            `[drawdy-physics] run started: ${world.bodies.filter((b) => !b.isStatic).length} dynamic, ${staticEls.length} static`
        );
        this._world = world;
        this._settleMs = 0;
        this._held.clear();
        this._releasing.clear();
        // A restart triggered by a drag must grip the dragged bodies
        // immediately — otherwise they free-fall until the next pointermove.
        for (const id of this._pendingHeldIds) {
            const el = dynamicEls.find((x) => x.id === id);
            const body = world.bodies.find((b) => b.id === id);
            if (!el || !body || body.isStatic) continue;
            body.invMass = 0;
            body.invInertia = 0;
            body.isStatic = true;
            this._held.set(id, {
                until: this._draggedIds.has(id)
                    ? Infinity
                    : Date.now() + DRAG_HOLD_MS,
                el,
            });
            console.info(`[drawdy-physics] grab ${id} (restart seed)`);
        }
        this._pendingHeldIds.clear();
        this.hasEverRun = true;
        this._idleGeom = new Map(this._sourceGeom);
        this._lastRunRest = new Map(
            [...this._sourceGeom].filter(([id]) => beganSet.has(id))
        );

        // Wall-clock fixed timestep: FrameClock pays elapsed time in
        // substeps and keeps unpaid debt across frames, so callback jitter
        // (worker timer throttling, busy frames) never changes the gravity
        // scale — late frames catch up instead of playing in slow motion.
        this._running = true;
        let inFlight = 0;
        let lastSendAt = 0;
        // One-line perf telemetry per second — separates scheduling
        // collapse (low frames/s) from step cost (high stepMs) from
        // round-trip gating (high rtt / skips).
        const perf = {
            windowStart: performance.now(),
            frames: 0,
            substeps: 0,
            refunded: 0,
            stepMsTotal: 0,
            stepMsMax: 0,
            sends: 0,
            sendSkips: 0,
            rttTotal: 0,
            rttCount: 0,
        };
        const reportPerf = (now: number) => {
            const dt = now - perf.windowStart;
            if (dt < 1000) return;
            const world = this._world;
            console.info(
                `[drawdy-physics] perf: frames ${Math.round((perf.frames * 1000) / dt)}/s, ` +
                    `substeps ${Math.round((perf.substeps * 1000) / dt)}/s (refunded ${Math.round((perf.refunded * 1000) / dt)}/s), ` +
                    `step avg ${(perf.substeps ? perf.stepMsTotal / perf.substeps : 0).toFixed(2)}ms max ${perf.stepMsMax.toFixed(1)}ms, ` +
                    `sends ${Math.round((perf.sends * 1000) / dt)}/s (skips ${Math.round((perf.sendSkips * 1000) / dt)}/s), ` +
                    `rtt avg ${(perf.rttCount ? perf.rttTotal / perf.rttCount : 0).toFixed(0)}ms, ` +
                    `bodies ${world?.bodies.length ?? 0}, pairs ${world?.lastPairCount ?? 0}, contacts ${world?.lastContactCount ?? 0}`
            );
            perf.windowStart = now;
            perf.frames = 0;
            perf.substeps = 0;
            perf.refunded = 0;
            perf.stepMsTotal = 0;
            perf.stepMsMax = 0;
            perf.sends = 0;
            perf.sendSkips = 0;
            perf.rttTotal = 0;
            perf.rttCount = 0;
        };
        const clock = new FrameClock(
            SUBSTEP_WALL_MS,
            MAX_CATCHUP_SUBSTEPS,
            MAX_DEBT_MS
        );
        clock.tick(performance.now());
        const frame = () => {
            if (!this._running || !this._world) return;

            const frameNow = performance.now();
            perf.frames++;
            reportPerf(frameNow);
            const steps = clock.tick(frameNow);

            if (steps > 0) {
                this._releaseExpiredHolds();
                const budgetStart = performance.now();
                let executed = 0;
                for (let i = 0; i < steps; i++) {
                    const stepStart = performance.now();
                    this._world.step(TIME_STEP);
                    const stepMs = performance.now() - stepStart;
                    perf.stepMsTotal += stepMs;
                    if (stepMs > perf.stepMsMax) perf.stepMsMax = stepMs;
                    executed++;
                    if (performance.now() - budgetStart > STEP_BUDGET_MS) {
                        break;
                    }
                }
                if (executed < steps) {
                    clock.refund(steps - executed);
                    perf.refunded += steps - executed;
                }
                perf.substeps += executed;
                const steppedMs = executed * SUBSTEP_WALL_MS;

                // A body whose center escaped the sandbox (tunneling) loses
                // its tag; its pose is banked for the final commit.
                if (this._sandboxes.size > 0) {
                    for (const b of [...this._world.bodies]) {
                        if (b.isStatic || this._releasing.has(b.id)) continue;
                        if (this._pointInsideAny(b.pos)) continue;
                        this._escaped.set(b.id, {
                            dx: b.pos.x - b.restPos.x,
                            dy: b.pos.y - b.restPos.y,
                            dRotation: b.angle,
                        });
                        this._world.remove(b.id);
                        void this._untag([b.id]);
                    }
                }

                const dynamics = this._world.bodies.filter(
                    (b) => !b.isStatic
                );
                if (this._held.size > 0) {
                    this._settleMs = 0; // never commit under a drag
                } else {
                    const calm = dynamics.every(
                        (b) =>
                            Vec2.length(b.vel) < SLEEP_LINEAR &&
                            Math.abs(b.angVel) < SLEEP_ANGULAR
                    );
                    this._settleMs = calm ? this._settleMs + steppedMs : 0;
                    if (
                        dynamics.length === 0 ||
                        this._settleMs >= SETTLE_MS
                    ) {
                        void this._commitAndStop();
                        return;
                    }
                }

                // A small in-flight window (latest-wins beyond it) keeps
                // the visible motion from freezing on one slow round-trip;
                // stepping above never waits either way. Watchdog clears
                // lost replies so a dropped message can't gate forever.
                if (inFlight > 0 && Date.now() - lastSendAt >= 2000) {
                    inFlight = 0;
                }
                if (inFlight >= MAX_SENDS_IN_FLIGHT) perf.sendSkips++;
                if (inFlight < MAX_SENDS_IN_FLIGHT) {
                    inFlight++;
                    lastSendAt = Date.now();
                    perf.sends++;
                    const sentAt = performance.now();
                    const previews = this._world.poseDeltas().map((d) => ({
                        drawdyElementId: d.id,
                        transform: {
                            x: d.dx,
                            y: d.dy,
                            scale: 1,
                            rotation: d.dRotation,
                        },
                    }));
                    void ctx
                        .issueCommand({
                            type: "command:scene:preview-transforms",
                            ...stamp(ctx),
                            req: { previews },
                        })
                        .finally(() => {
                            inFlight = Math.max(0, inFlight - 1);
                            perf.rttTotal += performance.now() - sentAt;
                            perf.rttCount++;
                        });
                }
            }

            scheduleFrame(frame);
        };
        scheduleFrame(frame);
    }


    /**
     * Drag ended: re-snapshot the rest pose at the host (so ticks bake from
     * the dragged position) and swap the pinned placeholder for a live body.
     */
    private _releaseExpiredHolds(): void {
        if (this._held.size === 0) return;
        const now = Date.now();
        for (const [id, hold] of this._held) {
            if (now < hold.until || this._releasing.has(id)) continue;
            this._releasing.add(id);
            void this._ctx
                .issueCommand({
                    type: "command:scene:begin-preview",
                    ...stamp(this._ctx),
                    req: { drawdyElementIds: [id] },
                })
                .then((response) => {
                    const began =
                        response.res.error === undefined
                            ? response.res.value.began
                            : [];
                    if (!this._world || !began.includes(id)) return;
                    this._world.remove(id);
                    // Dropped outside the sandbox: untag instead of going
                    // live. The re-begun rest pose IS the dragged pose, so
                    // end-preview leaves the element where the user put it.
                    const g = sourceGeomOf(hold.el);
                    if (this._sandboxes.size > 0 && g && !this._insideAny(g)) {
                        void this._untag([id]);
                        return;
                    }
                    const body = buildDynamicBody(hold.el);
                    if (body) this._world.add(body);
                })
                .finally(() => {
                    this._held.delete(id);
                    this._releasing.delete(id);
                    console.info(`[drawdy-physics] release ${id}`);
                    this._settleMs = 0;
                });
        }
    }

    /** Untag elements that left the sandbox (meta write — undoable, synced). */
    private async _untag(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        for (const id of ids) {
            this._idleGeom.delete(id);
            this._lastRunRest.delete(id);
        }
        console.info(
            `[drawdy-physics] out of sandbox — untagged ${ids.join(", ")}`
        );
        try {
            unwrap(
                await this._ctx.issueCommand({
                    type: "command:scene:update-drawdy-elements",
                    ...stamp(this._ctx),
                    req: {
                        updates: ids.map((id) => ({
                            drawdyElementId: id,
                            properties: {
                                meta: { physics: { mode: "none" } },
                            },
                        })),
                    },
                })
            );
        } catch {
            // board mid-teardown; the stale tag resurfaces on the next run
        }
    }

    private _insideAny(geom: {
        x: number;
        y: number;
        w: number;
        h: number;
    }): boolean {
        for (const rect of this._sandboxes.values()) {
            if (isInside(rect, geom)) return true;
        }
        return false;
    }

    private _pointInsideAny(p: { x: number; y: number }): boolean {
        for (const rect of this._sandboxes.values()) {
            if (isPointInside(rect, p)) return true;
        }
        return false;
    }

    private _removeWalls(sandboxId: string): void {
        const world = this._world;
        if (!world) return;
        for (const side of ["top", "bottom", "left", "right"]) {
            world.remove(`${WALL_ID_PREFIX}${sandboxId}:${side}`);
        }
    }

    /** Four thick static walls hugging one sandbox rect's outside. */
    private _buildWallsFor(
        world: World | null,
        sandboxId: string,
        rect: SandboxRect
    ): void {
        if (!world) return;
        const { x, y, w, h } = rect;
        for (const side of ["top", "bottom", "left", "right"]) {
            world.remove(`${WALL_ID_PREFIX}${sandboxId}:${side}`);
        }
        const T = WALL_THICKNESS;
        const walls: {
            id: string;
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
        }[] = [
            {
                id: `${WALL_ID_PREFIX}${sandboxId}:top`,
                minX: x - T,
                minY: y - T,
                maxX: x + w + T,
                maxY: y,
            },
            {
                id: `${WALL_ID_PREFIX}${sandboxId}:bottom`,
                minX: x - T,
                minY: y + h,
                maxX: x + w + T,
                maxY: y + h + T,
            },
            {
                id: `${WALL_ID_PREFIX}${sandboxId}:left`,
                minX: x - T,
                minY: y,
                maxX: x,
                maxY: y + h,
            },
            {
                id: `${WALL_ID_PREFIX}${sandboxId}:right`,
                minX: x + w,
                minY: y,
                maxX: x + w + T,
                maxY: y + h,
            },
        ];
        for (const wall of walls) {
            const cx = (wall.minX + wall.maxX) / 2;
            const cy = (wall.minY + wall.maxY) / 2;
            world.add(
                Body.staticFrom(
                    wall.id,
                    {
                        kind: "polygon",
                        vertices: [
                            { x: wall.minX - cx, y: wall.minY - cy },
                            { x: wall.maxX - cx, y: wall.minY - cy },
                            { x: wall.maxX - cx, y: wall.maxY - cy },
                            { x: wall.minX - cx, y: wall.maxY - cy },
                        ],
                    },
                    { x: cx, y: cy },
                    0.4,
                    0.6
                )
            );
        }
    }

    /** Bake current poses into the document as one undo step, then go idle. */
    private async _commitAndStop(): Promise<void> {
        this._running = false;
        const world = this._world;
        this._world = null;
        this._held.clear();
        this._releasing.clear();
        if (!world) {
            this._sourceGeom = new Map();
            this._escaped.clear();
            return;
        }

        // Escaped bodies were dropped from the world mid-run; their banked
        // poses still commit so the elements stay where they landed.
        const escaped = [...this._escaped].map(([id, d]) => ({
            id,
            ...d,
        }));
        this._escaped.clear();
        const commits = [...world.poseDeltas(), ...escaped]
            .filter(
                (d) =>
                    Math.abs(d.dx) > COMMIT_EPSILON_PX ||
                    Math.abs(d.dy) > COMMIT_EPSILON_PX ||
                    Math.abs(d.dRotation) > COMMIT_EPSILON_RAD
            )
            .map((d) => ({
                drawdyElementId: d.id,
                dx: d.dx,
                dy: d.dy,
                dRotation: d.dRotation,
            }));
        // Keep idle baselines in step with what the commit will write, so
        // its echo doesn't read as a user edit.
        for (const c of commits) {
            const src = this._sourceGeom.get(c.drawdyElementId);
            if (!src) continue;
            this._idleGeom.set(c.drawdyElementId, {
                x: src.x + c.dx,
                y: src.y + c.dy,
                w: src.w,
                h: src.h,
                rotation: src.rotation + c.dRotation,
            });
        }
        this._sourceGeom = new Map();
        console.info(
            `[drawdy-physics] run committed: ${commits.length} element(s) moved`
        );
        unwrap(
            await this._ctx.issueCommand({
                type: "command:scene:end-preview",
                ...stamp(this._ctx),
                req: { commits },
            })
        );
    }
}
