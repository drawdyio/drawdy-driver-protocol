import { DrawdyElementSchema, TextAlign } from "@drawdy/driver-protocol";

/** Matches drawdy's slide canvas (see presentation presets/types.ts). */
export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 800;

const M = 96;
const CONTENT_WIDTH = SLIDE_WIDTH - M * 2;

/** Same visual language as drawdy's built-in presets. */
const THEME = {
    accent: "#ec4899",
    heading: "#f2f5fb",
    body: "#c3ccdb",
    muted: "#8a94a6",
    placeholderFill: "#1c2230",
    placeholderBorder: "#33405a",
} as const;

/**
 * Build a preset's slide content as DriverElements, mirroring drawdy's
 * preset builders (editor-extension/presentation/presets/layouts.ts) but in
 * the protocol's simplified element vocabulary. Elements are emitted directly
 * in board space at `origin` (the slide frame's top-left).
 */
export function buildSlideContent(
    presetId: string,
    origin: { x: number; y: number },
    generateId: () => string
): DrawdyElementSchema[] {
    const text = (opts: {
        x: number;
        y: number;
        width: number;
        text: string;
        fontSize: number;
        color: string;
        align?: TextAlign;
    }): DrawdyElementSchema => ({
        type: "text",
        drawdyElementId: generateId(),
        x: origin.x + opts.x,
        y: origin.y + opts.y,
        width: opts.width,
        text: opts.text,
        fontSize: opts.fontSize,
        color: opts.color,
        textAlign: opts.align ?? "left",
    });

    const heading = (opts: {
        x: number;
        y: number;
        width: number;
        text: string;
        fontSize?: number;
        align?: TextAlign;
    }) =>
        text({
            ...opts,
            fontSize: opts.fontSize ?? 72,
            color: THEME.heading,
        });

    const body = (opts: {
        x: number;
        y: number;
        width: number;
        text: string;
        fontSize?: number;
        color?: string;
        align?: TextAlign;
    }) =>
        text({
            ...opts,
            fontSize: opts.fontSize ?? 28,
            color: opts.color ?? THEME.body,
        });

    const kicker = (opts: {
        x: number;
        y: number;
        width: number;
        text: string;
        align?: TextAlign;
    }) => text({ ...opts, fontSize: 24, color: THEME.accent });

    const bullets = (opts: {
        x: number;
        y: number;
        width: number;
        items: string[];
        fontSize?: number;
    }) =>
        body({
            ...opts,
            text: opts.items.map((it) => `•  ${it}`).join("\n"),
            fontSize: opts.fontSize ?? 30,
        });

    const accentRule = (x: number, y: number, width: number): DrawdyElementSchema => ({
        type: "line",
        drawdyElementId: generateId(),
        from: [origin.x + x, origin.y + y],
        to: [origin.x + x + width, origin.y + y],
        color: THEME.accent,
        strokeWidth: 4,
    });

    const placeholder = (opts: {
        x: number;
        y: number;
        width: number;
        height: number;
    }): DrawdyElementSchema => ({
        type: "shape",
        drawdyElementId: generateId(),
        x: origin.x + opts.x,
        y: origin.y + opts.y,
        width: opts.width,
        height: opts.height,
        strokeColor: THEME.placeholderBorder,
        fillColor: THEME.placeholderFill,
        strokeWidth: 2,
        strokeDash: "dashed",
        cornerRadius: 16,
        roughness: 0,
        text: "Add image or content",
        fontSize: 22,
        textAlign: "center",
        textVerticalAlign: "middle",
    });

    switch (presetId) {
        case "blank":
            return [];
        case "title": {
            const cy = SLIDE_HEIGHT / 2;
            return [
                kicker({
                    x: M,
                    y: cy - 150,
                    width: CONTENT_WIDTH,
                    text: "PRESENTATION",
                    align: "center",
                }),
                heading({
                    x: M,
                    y: cy - 100,
                    width: CONTENT_WIDTH,
                    text: "Presentation title",
                    fontSize: 84,
                    align: "center",
                }),
                body({
                    x: M,
                    y: cy + 40,
                    width: CONTENT_WIDTH,
                    text: "Add a subtitle or your name here",
                    fontSize: 32,
                    color: THEME.muted,
                    align: "center",
                }),
            ];
        }
        case "title-content":
            return [
                heading({
                    x: M,
                    y: M,
                    width: CONTENT_WIDTH,
                    text: "Heading",
                    fontSize: 64,
                }),
                accentRule(M, M + 96, 120),
                bullets({
                    x: M,
                    y: M + 150,
                    width: CONTENT_WIDTH,
                    items: [
                        "First key point goes here",
                        "Second key point goes here",
                        "Third key point goes here",
                    ],
                }),
            ];
        case "two-column": {
            const gap = 64;
            const colWidth = (CONTENT_WIDTH - gap) / 2;
            const colX2 = M + colWidth + gap;
            const colY = M + 150;
            return [
                heading({
                    x: M,
                    y: M,
                    width: CONTENT_WIDTH,
                    text: "Heading",
                    fontSize: 64,
                }),
                accentRule(M, M + 96, 120),
                body({
                    x: M,
                    y: colY,
                    width: colWidth,
                    text: "Column one",
                    fontSize: 34,
                    color: THEME.heading,
                }),
                bullets({
                    x: M,
                    y: colY + 60,
                    width: colWidth,
                    items: ["Point one", "Point two"],
                    fontSize: 28,
                }),
                body({
                    x: colX2,
                    y: colY,
                    width: colWidth,
                    text: "Column two",
                    fontSize: 34,
                    color: THEME.heading,
                }),
                bullets({
                    x: colX2,
                    y: colY + 60,
                    width: colWidth,
                    items: ["Point one", "Point two"],
                    fontSize: 28,
                }),
            ];
        }
        case "section-header": {
            const cy = SLIDE_HEIGHT / 2;
            return [
                kicker({
                    x: M,
                    y: cy - 90,
                    width: CONTENT_WIDTH,
                    text: "SECTION 01",
                }),
                accentRule(M, cy - 40, 160),
                heading({
                    x: M,
                    y: cy - 10,
                    width: CONTENT_WIDTH,
                    text: "Section title",
                    fontSize: 76,
                }),
            ];
        }
        case "big-statement":
            return [
                heading({
                    x: M,
                    y: SLIDE_HEIGHT / 2 - 120,
                    width: CONTENT_WIDTH,
                    text: "A single powerful idea, stated simply.",
                    fontSize: 68,
                    align: "center",
                }),
                body({
                    x: M,
                    y: SLIDE_HEIGHT / 2 + 110,
                    width: CONTENT_WIDTH,
                    text: "— Attribution",
                    fontSize: 26,
                    color: THEME.muted,
                    align: "center",
                }),
            ];
        case "image-caption": {
            const gap = 72;
            const imgWidth = CONTENT_WIDTH * 0.5;
            const textX = M + imgWidth + gap;
            const textWidth = CONTENT_WIDTH - imgWidth - gap;
            return [
                placeholder({
                    x: M,
                    y: M,
                    width: imgWidth,
                    height: SLIDE_HEIGHT - M * 2,
                }),
                heading({
                    x: textX,
                    y: M + 60,
                    width: textWidth,
                    text: "Heading",
                    fontSize: 56,
                }),
                accentRule(textX, M + 156, 100),
                body({
                    x: textX,
                    y: M + 200,
                    width: textWidth,
                    text: "Add a short caption or description that supports the image.",
                    fontSize: 28,
                }),
            ];
        }
        case "bullet-list":
            return [
                heading({
                    x: M,
                    y: M,
                    width: CONTENT_WIDTH,
                    text: "Agenda",
                    fontSize: 64,
                }),
                accentRule(M, M + 96, 120),
                bullets({
                    x: M,
                    y: M + 150,
                    width: CONTENT_WIDTH,
                    items: [
                        "First topic",
                        "Second topic",
                        "Third topic",
                        "Fourth topic",
                        "Fifth topic",
                    ],
                    fontSize: 32,
                }),
            ];
        default:
            console.error(`Unknown preset: ${presetId}`);
            return [];
    }
}
