import { ModuleStyling } from "@drawdy/driver-protocol";

export type SlidePreset = {
    id: string;
    label: string;
    /** data: uri of the wireframe preview, themed at call time. */
    preview: string;
};

const VIEW_W = 96;
const VIEW_H = 60;
const ACCENT = "#ec4899";

export function slidePresets(styling: ModuleStyling): SlidePreset[] {
    const heading = styling.foreground;
    const body = styling.mutedForeground;
    const placeholder = styling.border;

    const bar = (x: number, y: number, w: number, h = 3, fill = body): string =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${fill}"/>`;

    const frame = (content: string): string =>
        toDataUri(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}">` +
                `<rect x="1" y="1" width="${VIEW_W - 2}" height="${VIEW_H - 2}" rx="4" fill="${styling.background}" stroke="${styling.border}" stroke-width="1"/>` +
                content +
                `</svg>`
        );

    return [
        { id: "blank", label: "Blank", preview: frame("") },
        {
            id: "title",
            label: "Title",
            preview: frame(
                bar(32, 18, 32, 2.5, ACCENT) +
                    bar(22, 26, 52, 6, heading) +
                    bar(30, 38, 36)
            ),
        },
        {
            id: "title-content",
            label: "Title + Content",
            preview: frame(
                bar(12, 12, 40, 5, heading) +
                    bar(12, 20, 14, 2, ACCENT) +
                    bar(12, 30, 60) +
                    bar(12, 37, 54) +
                    bar(12, 44, 58)
            ),
        },
        {
            id: "two-column",
            label: "Two Columns",
            preview: frame(
                bar(12, 12, 40, 5, heading) +
                    bar(12, 20, 14, 2, ACCENT) +
                    bar(12, 30, 30) +
                    bar(12, 37, 26) +
                    bar(54, 30, 30) +
                    bar(54, 37, 26)
            ),
        },
        {
            id: "section-header",
            label: "Section",
            preview: frame(
                bar(12, 22, 22, 2.5, ACCENT) +
                    bar(12, 28, 18, 2, ACCENT) +
                    bar(12, 33, 56, 6, heading)
            ),
        },
        {
            id: "big-statement",
            label: "Statement",
            preview: frame(
                bar(14, 22, 68, 5, heading) +
                    bar(22, 30, 52, 5, heading) +
                    bar(38, 42, 20)
            ),
        },
        {
            id: "image-caption",
            label: "Image + Caption",
            preview: frame(
                `<rect x="10" y="12" width="38" height="36" rx="2" fill="none" stroke="${placeholder}" stroke-width="1" stroke-dasharray="3 2"/>` +
                    bar(54, 16, 30, 5, heading) +
                    bar(54, 24, 10, 2, ACCENT) +
                    bar(54, 32, 30) +
                    bar(54, 39, 26)
            ),
        },
        {
            id: "bullet-list",
            label: "Bullets",
            preview: frame(
                bar(12, 12, 32, 5, heading) +
                    bar(12, 20, 14, 2, ACCENT) +
                    bar(12, 28, 58) +
                    bar(12, 34, 52) +
                    bar(12, 40, 56) +
                    bar(12, 46, 48)
            ),
        },
    ];
}

export function toDataUri(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
