import { ImageBlock, ImageMediaType } from "./anthropic";

// Anthropic's sweet spot: images beyond ~1568px on the long edge are scaled
// down server-side anyway, so sending more is pure upload cost.
const MAX_EDGE = 1568;

export async function blobToImageBlock(blob: Blob): Promise<ImageBlock> {
    const encoded = await reencode(blob);
    return {
        type: "image",
        source: {
            type: "base64",
            media_type: encoded.mediaType,
            data: await blobToBase64(encoded.blob),
        },
    };
}

/**
 * Downscale to MAX_EDGE and re-encode as webp — screenshots come in as PNG,
 * which is huge for photographic-ish canvas content. Falls back to the
 * original blob where OffscreenCanvas isn't available.
 */
async function reencode(
    blob: Blob
): Promise<{ blob: Blob; mediaType: ImageMediaType }> {
    try {
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(
            1,
            MAX_EDGE / Math.max(bitmap.width, bitmap.height)
        );
        const canvas = new OffscreenCanvas(
            Math.max(1, Math.round(bitmap.width * scale)),
            Math.max(1, Math.round(bitmap.height * scale))
        );
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d context");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const out = await canvas.convertToBlob({
            type: "image/webp",
            quality: 0.8,
        });
        return { blob: out, mediaType: asMediaType(out.type) };
    } catch {
        return { blob, mediaType: asMediaType(blob.type) };
    }
}

function asMediaType(type: string): ImageMediaType {
    switch (type) {
        case "image/webp":
        case "image/jpeg":
        case "image/gif":
        case "image/png":
            return type;
        default:
            return "image/png";
    }
}

async function blobToBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
