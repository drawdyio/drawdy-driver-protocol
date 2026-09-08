import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
    applyAlpha,
    bytesToHex,
    fitWithin,
    maskFromOutput,
    MODEL_INPUT_SIZE,
    preprocess,
    resizeMaskBilinear,
} from "./segment.ts";

const close = (a: number, b: number, eps = 1e-5) =>
    assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test("preprocess produces NCHW planes normalized with ImageNet mean/std", () => {
    const size = 2;
    const rgba = new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const out = preprocess(rgba, size);
    assert.equal(out.length, 3 * size * size);
    close(out[0], (1 - 0.485) / 0.229);
    close(out[4], (0 - 0.456) / 0.224);
    close(out[8], (0 - 0.406) / 0.225);
    close(out[3], (1 - 0.485) / 0.229);
    close(out[7], (1 - 0.456) / 0.224);
    close(out[11], (1 - 0.406) / 0.225);
});

test("preprocess divides by the max channel value, not 255", () => {
    const size = 1;
    const rgba = new Uint8ClampedArray([100, 50, 0, 255]);
    const out = preprocess(rgba, size);
    close(out[0], (1 - 0.485) / 0.229);
    close(out[1], (0.5 - 0.456) / 0.224);
});

test("preprocess rejects mismatched buffers", () => {
    assert.throws(() => preprocess(new Uint8ClampedArray(3), 1));
});

test("maskFromOutput min-max normalizes to 0..255", () => {
    const mask = maskFromOutput([0.2, 0.6, 0.4, 0.2], 2);
    assert.deepEqual(Array.from(mask), [0, 255, 128, 0]);
});

test("maskFromOutput returns all-zero on a flat output", () => {
    const mask = maskFromOutput([0.5, 0.5, 0.5, 0.5], 2);
    assert.deepEqual(Array.from(mask), [0, 0, 0, 0]);
});

test("resizeMaskBilinear is identity at equal size", () => {
    const src = new Uint8ClampedArray([0, 255, 128, 64]);
    const out = resizeMaskBilinear(src, { width: 2, height: 2 }, { width: 2, height: 2 });
    assert.deepEqual(Array.from(out), Array.from(src));
});

test("resizeMaskBilinear upscales with interpolated interior and clamped edges", () => {
    const src = new Uint8ClampedArray([0, 255, 0, 255]);
    const out = resizeMaskBilinear(src, { width: 2, height: 2 }, { width: 4, height: 1 });
    assert.equal(out[0], 0);
    assert.equal(out[3], 255);
    assert.ok(out[1] > 0 && out[1] < out[2] && out[2] < 255);
});

test("resizeMaskBilinear downscales a solid mask to a solid mask", () => {
    const src = new Uint8ClampedArray(16).fill(200);
    const out = resizeMaskBilinear(src, { width: 4, height: 4 }, { width: 2, height: 2 });
    assert.deepEqual(Array.from(out), [200, 200, 200, 200]);
});

test("applyAlpha multiplies existing alpha by the mask", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);
    applyAlpha(rgba, [255, 0]);
    assert.deepEqual(Array.from(rgba), [10, 20, 30, 255, 40, 50, 60, 0]);
    assert.throws(() => applyAlpha(rgba, [1]));
});

test("fitWithin caps the longest side and keeps aspect", () => {
    assert.deepEqual(fitWithin({ width: 8000, height: 4000 }, 4096), { width: 4096, height: 2048 });
    assert.deepEqual(fitWithin({ width: 300, height: 200 }, 4096), { width: 300, height: 200 });
});

test("bytesToHex renders lowercase zero-padded hex", () => {
    assert.equal(bytesToHex(new Uint8Array([0, 1, 255, 16])), "0001ff10");
});

const modelPath = process.env.BG_REMOVER_MODEL;
test(
    "end to end: u2netp separates a bright subject from a dark background",
    { skip: !modelPath || !existsSync(modelPath) ? "set BG_REMOVER_MODEL=/path/to/u2netp.onnx" : false },
    async () => {
        const ort = await import("onnxruntime-web");
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create(
            new Uint8Array(readFileSync(modelPath!)),
            { executionProviders: ["wasm"] }
        );
        assert.deepEqual(session.inputNames, ["input.1"]);
        const N = MODEL_INPUT_SIZE;
        const rgba = new Uint8ClampedArray(N * N * 4);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const inside = x > N * 0.3 && x < N * 0.7 && y > N * 0.2 && y < N * 0.8;
                const o = (y * N + x) * 4;
                rgba[o] = inside ? 230 : 20;
                rgba[o + 1] = inside ? 120 : 25;
                rgba[o + 2] = inside ? 40 : 30;
                rgba[o + 3] = 255;
            }
        }
        const input = new ort.Tensor("float32", preprocess(rgba), [1, 3, N, N]);
        const out = await session.run({ "input.1": input });
        const first = out[session.outputNames[0]];
        assert.deepEqual(first.dims, [1, 1, N, N]);
        const mask = maskFromOutput(first.data as Float32Array);
        const at = (x: number, y: number) => mask[y * N + x];
        const center = at(N / 2, N / 2);
        const corner = (at(4, 4) + at(N - 5, 4) + at(4, N - 5) + at(N - 5, N - 5)) / 4;
        assert.ok(center > 200, `center should be foreground, got ${center}`);
        assert.ok(corner < 60, `corners should be background, got ${corner}`);
    }
);
