import { Reorder } from "motion/react";
import { useEffect, useRef, useState } from "react";

const drawdy = acquireDrawdyApi();

type SlidePreview = {
    frameId: string;
    order: number;
    /** Object URL of the latest screenshot; null until the first one lands. */
    url: string | null;
};

// frameId tie-break keeps slides with duplicate orders (legacy boards) from
// swapping places on every preview refresh.
const byOrder = (a: SlidePreview, b: SlidePreview): number =>
    a.order - b.order || a.frameId.localeCompare(b.frameId);

export function App() {
    const [slides, setSlides] = useState<SlidePreview[]>([]);
    // Latest order for onDragEnd, which fires outside React's render cycle.
    const slidesRef = useRef(slides);
    slidesRef.current = slides;
    // Distinguishes a click from a drag, same as the app's SlideCard.
    const pointerDown = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const dispose = drawdy.onMessage((raw) => {
            const message = raw as Record<string, any>;
            switch (message?.type) {
                case "slides": {
                    const next = message.slides as {
                        frameId: string;
                        order: number;
                    }[];
                    setSlides((prev) => {
                        const keep = new Map(
                            prev.map((s) => [s.frameId, s] as const)
                        );
                        for (const s of prev) {
                            if (
                                s.url &&
                                !next.some((n) => n.frameId === s.frameId)
                            ) {
                                URL.revokeObjectURL(s.url);
                            }
                        }
                        return next
                            .map(({ frameId, order }) => ({
                                frameId,
                                order,
                                url: keep.get(frameId)?.url ?? null,
                            }))
                            .sort(byOrder);
                    });
                    return;
                }
                case "slide-preview": {
                    const { frameId, order, png } = message as {
                        frameId: string;
                        order: number;
                        png: Blob;
                    };
                    const url = URL.createObjectURL(png);
                    setSlides((prev) => {
                        const existing = prev.find(
                            (s) => s.frameId === frameId
                        );
                        if (existing?.url) URL.revokeObjectURL(existing.url);
                        // Update in place — remove-and-append would shuffle
                        // slides that share an order every refresh.
                        const updated = existing
                            ? prev.map((s) =>
                                  s.frameId === frameId
                                      ? { ...s, order, url }
                                      : s
                              )
                            : [...prev, { frameId, order, url }];
                        return updated.sort(byOrder);
                    });
                    return;
                }
            }
        });
        drawdy.postMessage({ type: "ready" });
        return dispose;
    }, []);

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
                <button
                    title="New slide"
                    aria-label="New slide"
                    className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-(--drawdy-radius-lg) bg-(--drawdy-surface2) text-(--drawdy-foreground) transition-[opacity,scale] hover:opacity-90 active:scale-95"
                    onClick={(e) => {
                        drawdy.postMessage({
                            type: "plus-clicked",
                            x: e.clientX,
                            y: e.clientY,
                        });
                    }}
                >
                    <PlusIcon />
                </button>
                <button
                    title="Start presentation"
                    aria-label="Start presentation"
                    className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-(--drawdy-radius-lg) bg-(--drawdy-primary) font-semibold text-(--drawdy-primary-foreground) transition-[opacity,scale] hover:opacity-90 active:scale-95"
                    onClick={() =>
                        drawdy.postMessage({ type: "present-clicked" })
                    }
                >
                    <PlayIcon />
                    Present
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {slides.length === 0 ? (
                    <div className="py-8 text-center text-xs text-(--drawdy-muted-foreground)">
                        No slides yet
                    </div>
                ) : (
                    <Reorder.Group
                        axis="y"
                        values={slides}
                        onReorder={setSlides}
                        className="flex list-none flex-col gap-3 py-1"
                    >
                        {slides.map((slide, i) => (
                            <Reorder.Item
                                key={slide.frameId}
                                value={slide}
                                onPointerDown={(e) => {
                                    pointerDown.current = {
                                        x: e.clientX,
                                        y: e.clientY,
                                    };
                                }}
                                onPointerUp={(e) => {
                                    const start = pointerDown.current;
                                    pointerDown.current = null;
                                    if (!start) return;
                                    const moved =
                                        Math.abs(e.clientX - start.x) +
                                        Math.abs(e.clientY - start.y);
                                    if (moved < 5) {
                                        drawdy.postMessage({
                                            type: "slide-clicked",
                                            frameId: slide.frameId,
                                        });
                                    }
                                }}
                                onDragEnd={() => {
                                    drawdy.postMessage({
                                        type: "reorder",
                                        orderedFrameIds:
                                            slidesRef.current.map(
                                                (s) => s.frameId
                                            ),
                                    });
                                }}
                                className="flex cursor-grab touch-none list-none flex-col gap-1 active:cursor-grabbing"
                            >
                                <div className="aspect-video w-full overflow-hidden rounded-(--drawdy-radius-md) border border-(--drawdy-border) bg-(--drawdy-surface) transition-[border-color] hover:border-(--drawdy-primary)">
                                    {slide.url && (
                                        <img
                                            src={slide.url}
                                            alt={`Slide ${i + 1}`}
                                            draggable={false}
                                            className="h-full w-full object-contain"
                                        />
                                    )}
                                </div>
                                <div className="text-xs text-(--drawdy-muted-foreground)">
                                    Slide {i + 1}
                                </div>
                            </Reorder.Item>
                        ))}
                    </Reorder.Group>
                )}
            </div>
        </div>
    );
}

function PlusIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
                fill="currentColor"
                d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"
            />
        </svg>
    );
}

function PlayIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="transparent"
            className="remixicon fill-current"
        >
            <path d="M16.3944 12.0001L10 7.7371V16.263L16.3944 12.0001ZM19.376 12.4161L8.77735 19.4818C8.54759 19.635 8.23715 19.5729 8.08397 19.3432C8.02922 19.261 8 19.1645 8 19.0658V4.93433C8 4.65818 8.22386 4.43433 8.5 4.43433C8.59871 4.43433 8.69522 4.46355 8.77735 4.5183L19.376 11.584C19.6057 11.7372 19.6678 12.0477 19.5146 12.2774C19.478 12.3323 19.4309 12.3795 19.376 12.4161Z"></path>
        </svg>
    );
}
