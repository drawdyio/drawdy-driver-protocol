export const MODEL_INPUT_SIZE = 320;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export type Size = { width: number; height: number };

export function preprocess(
    rgba: ArrayLike<number>,
    size: number = MODEL_INPUT_SIZE
): Float32Array {
    const pixels = size * size;
    if (rgba.length !== pixels * 4) {
        throw new Error(
            `preprocess: expected ${pixels * 4} bytes for ${size}x${size} RGBA, got ${rgba.length}`
        );
    }
    let max = 0;
    for (let i = 0; i < rgba.length; i++) {
        if ((i & 3) === 3) continue;
        if (rgba[i] > max) max = rgba[i];
    }
    const scale = max > 0 ? 1 / max : 1;
    const out = new Float32Array(3 * pixels);
    for (let p = 0; p < pixels; p++) {
        const o = p * 4;
        for (let c = 0; c < 3; c++) {
            out[c * pixels + p] = (rgba[o + c] * scale - MEAN[c]) / STD[c];
        }
    }
    return out;
}

export function maskFromOutput(
    output: ArrayLike<number>,
    size: number = MODEL_INPUT_SIZE
): Uint8ClampedArray {
    const pixels = size * size;
    if (output.length !== pixels) {
        throw new Error(
            `maskFromOutput: expected ${pixels} values, got ${output.length}`
        );
    }
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pixels; i++) {
        const v = output[i];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const range = max - min;
    const mask = new Uint8ClampedArray(pixels);
    if (!(range > 0)) return mask;
    for (let i = 0; i < pixels; i++) {
        mask[i] = ((output[i] - min) / range) * 255;
    }
    return mask;
}

export function resizeMaskBilinear(
    mask: ArrayLike<number>,
    from: Size,
    to: Size
): Uint8ClampedArray {
    if (mask.length !== from.width * from.height) {
        throw new Error("resizeMaskBilinear: mask does not match `from` size");
    }
    const out = new Uint8ClampedArray(to.width * to.height);
    if (from.width === to.width && from.height === to.height) {
        for (let i = 0; i < out.length; i++) out[i] = mask[i];
        return out;
    }
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    const maxX = from.width - 1;
    const maxY = from.height - 1;
    for (let y = 0; y < to.height; y++) {
        const fy = Math.min(maxY, Math.max(0, (y + 0.5) * sy - 0.5));
        const y0 = Math.floor(fy);
        const y1 = Math.min(maxY, y0 + 1);
        const wy = fy - y0;
        for (let x = 0; x < to.width; x++) {
            const fx = Math.min(maxX, Math.max(0, (x + 0.5) * sx - 0.5));
            const x0 = Math.floor(fx);
            const x1 = Math.min(maxX, x0 + 1);
            const wx = fx - x0;
            const top =
                mask[y0 * from.width + x0] * (1 - wx) +
                mask[y0 * from.width + x1] * wx;
            const bottom =
                mask[y1 * from.width + x0] * (1 - wx) +
                mask[y1 * from.width + x1] * wx;
            out[y * to.width + x] = top * (1 - wy) + bottom * wy;
        }
    }
    return out;
}

export function applyAlpha(
    rgba: Uint8ClampedArray,
    alpha: ArrayLike<number>
): void {
    if (rgba.length !== alpha.length * 4) {
        throw new Error("applyAlpha: alpha does not match RGBA pixel count");
    }
    for (let p = 0; p < alpha.length; p++) {
        const o = p * 4 + 3;
        rgba[o] = Math.round((rgba[o] * alpha[p]) / 255);
    }
}

export function fitWithin(size: Size, maxSide: number): Size {
    const longest = Math.max(size.width, size.height);
    if (longest <= maxSide) return { ...size };
    const k = maxSide / longest;
    return {
        width: Math.max(1, Math.round(size.width * k)),
        height: Math.max(1, Math.round(size.height * k)),
    };
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let hex = "";
    for (let i = 0; i < view.length; i++) {
        hex += view[i].toString(16).padStart(2, "0");
    }
    return hex;
}
