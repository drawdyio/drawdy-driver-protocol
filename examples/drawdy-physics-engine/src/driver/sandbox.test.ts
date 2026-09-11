import {
    MIN_SANDBOX_H,
    MIN_SANDBOX_W,
    defaultRectAround,
    findSandboxes,
    isInside,
    isPointInside,
    sandboxName,
    singleLineName,
} from "./sandbox";

const rect = { x: 0, y: 0, w: 1000, h: 800 };

describe("isInside", () => {
    it("keeps an element whose bbox center is inside, even when it overhangs", () => {
        expect(isInside(rect, { x: -50, y: 100, w: 200, h: 100 })).toBe(true);
    });

    it("rejects an element whose center crossed the edge", () => {
        expect(isInside(rect, { x: -150, y: 100, w: 200, h: 100 })).toBe(false);
        expect(isInside(rect, { x: 400, y: 790, w: 100, h: 100 })).toBe(false);
    });
});

describe("isPointInside", () => {
    it("bounds check including the edges", () => {
        expect(isPointInside(rect, { x: 0, y: 0 })).toBe(true);
        expect(isPointInside(rect, { x: 1000, y: 800 })).toBe(true);
        expect(isPointInside(rect, { x: 1000.1, y: 400 })).toBe(false);
        expect(isPointInside(rect, { x: 500, y: -0.1 })).toBe(false);
    });
});

describe("defaultRectAround", () => {
    it("inflates the content by 50% per side, centered", () => {
        const box = defaultRectAround({
            x: 0,
            y: 0,
            width: 2000,
            height: 2000,
        });
        expect(box.w).toBe(4000);
        expect(box.h).toBe(4000);
        expect(box.x).toBe(-1000);
        expect(box.y).toBe(-1000);
    });

    it("clamps small content to the minimum size", () => {
        const box = defaultRectAround({ x: 100, y: 100, width: 50, height: 50 });
        expect(box.w).toBe(MIN_SANDBOX_W);
        expect(box.h).toBe(MIN_SANDBOX_H);
        expect(box.x + box.w / 2).toBe(125);
        expect(box.y + box.h / 2).toBe(125);
    });

    it("falls back to an origin-centered box when there is no content", () => {
        const box = defaultRectAround(null);
        expect(box.w).toBe(MIN_SANDBOX_W);
        expect(box.x).toBe(-MIN_SANDBOX_W / 2);
    });
});

describe("findSandboxes", () => {
    const sandbox = (id: string, geom = true, name?: string) => ({
        id,
        meta: { physics: name ? { mode: "sandbox", name } : { mode: "sandbox" } },
        ...(geom ? { x: 0, y: 0, width: 100, height: 100 } : {}),
    });

    it("returns every sandbox, id-sorted, so all clients list them alike", () => {
        const els = [sandbox("b"), sandbox("a"), sandbox("c")];
        expect(findSandboxes(els).map((el) => el.id)).toEqual(["a", "b", "c"]);
    });

    it("ignores sandboxes without geometry and non-sandbox elements", () => {
        const els = [
            sandbox("a", false),
            { id: "x", meta: { physics: { mode: "dynamic" } } },
            sandbox("b"),
        ];
        expect(findSandboxes(els).map((el) => el.id)).toEqual(["b"]);
    });

    it("returns an empty list when there is none", () => {
        expect(findSandboxes([{ id: "x" }])).toEqual([]);
    });
});

describe("singleLineName", () => {
    it("collapses line breaks (and surrounding spaces) to one space", () => {
        expect(singleLineName("Ball\npit")).toBe("Ball pit");
        expect(singleLineName("Ball  \r\n  pit\n\n2")).toBe("Ball pit 2");
        expect(singleLineName("  plain  ")).toBe("plain");
        expect(singleLineName("\n\n")).toBe("");
    });
});

describe("sandboxName", () => {
    it("reads meta.physics.name, treating blank as unnamed", () => {
        expect(
            sandboxName({
                id: "a",
                meta: { physics: { mode: "sandbox", name: "Pit" } },
            })
        ).toBe("Pit");
        expect(
            sandboxName({
                id: "a",
                meta: { physics: { mode: "sandbox", name: "  " } },
            })
        ).toBeNull();
        expect(
            sandboxName({ id: "a", meta: { physics: { mode: "sandbox" } } })
        ).toBeNull();
    });
});
