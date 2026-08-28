// The message protocol between the driver (worker) and the palette webview.
// Imported by both bundles, so the two sides can't drift apart.

export type SymbolEntry = {
    /** The unicode glyph dropped onto the canvas. */
    glyph: string;
    /** Human-readable name, shown as the drag item's tooltip. */
    name: string;
};

export type SymbolCategory = {
    label: string;
    symbols: SymbolEntry[];
};

/** webview -> driver */
export type WebviewToDriver =
    | { type: "ready" }
    /**
     * A drag released. The tile captures the pointer (`setPointerCapture`) so
     * pointermove/up keep firing inside the iframe even after the cursor
     * crosses out onto the canvas; `x`/`y` are the release point in the
     * iframe's own viewport frame (negative past its left edge). The driver
     * offsets by the iframe rect and converts to canvas space.
     */
    | { type: "drop-glyph"; glyph: string; x: number; y: number }
    /** A plain click (no drag) drops the glyph at the viewport center. */
    | { type: "insert-glyph"; glyph: string };

/** driver -> webview */
export type DriverToWebview = {
    type: "init";
    categories: SymbolCategory[];
};
