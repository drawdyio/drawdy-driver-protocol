/**
 * The palette webview, inlined as one self-contained HTML string. Plain DOM —
 * no framework build step. `acquireDrawdyApi()` is injected by drawdy at
 * runtime; the symbol catalog arrives via the `init` message.
 *
 * `:root { /*__DRAWDY_STYLING__* / }` is filled with the current theme's
 * `--drawdy-*` css variables when the driver creates the webview; a `theme`
 * message swaps them in place when the host theme changes.
 */
export const WEBVIEW_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style id="theme">:root{/*__DRAWDY_STYLING__*/}</style>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: var(--drawdy-background, #fff);
    color: var(--drawdy-foreground, #111);
    display: flex;
    flex-direction: column;
    height: 100vh;
}
header { padding: 12px 12px 4px; }
#search {
    width: 100%;
    height: 32px;
    padding: 4px 10px;
    font: inherit;
    font-size: 14px;
    color: var(--drawdy-foreground, #111);
    background: var(--drawdy-surface, #fff);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-lg, 12px);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
}
#search::placeholder { color: var(--drawdy-muted-foreground, #888); font-weight: 500; }
#search:focus-visible {
    box-shadow: 0 0 0 2px var(--drawdy-background, #fff), 0 0 0 4px var(--drawdy-ring, #94ba00);
}
main { flex: 1; overflow-y: auto; padding: 8px 12px 16px; }
.cat-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--drawdy-muted-foreground, #888);
    margin: 14px 0 6px;
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 6px;
}
.tile {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    cursor: grab;
    user-select: none;
    /* Let pointer events drive the drag instead of scroll/zoom gestures. */
    touch-action: none;
    background: var(--drawdy-surface, #f4f4f4);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-md, 8px);
    transition: background 0.08s, border-color 0.08s, transform 0.08s;
}
.tile:hover {
    background: var(--drawdy-surface2, var(--drawdy-surface, #ececec));
    border-color: var(--drawdy-primary, #6366f1);
}
.tile:active { cursor: grabbing; transform: scale(0.94); }
.tile.dragging { opacity: 0.4; }
.empty { font-size: 12px; color: var(--drawdy-muted-foreground, #888); padding: 24px 0; text-align: center; }
</style>
</head>
<body>
<header>
    <input id="search" type="text" placeholder="Search (sum, alpha, integral…)" autocomplete="off" />
</header>
<main id="list"></main>
<script>
(function () {
    var api = acquireDrawdyApi();
    var CATEGORIES = [];
    var query = "";

    var list = document.getElementById("list");
    var search = document.getElementById("search");
    var themeStyle = document.getElementById("theme");

    function matches(entry, q) {
        if (!q) return true;
        return entry.name.toLowerCase().indexOf(q) !== -1 || entry.glyph === q;
    }

    // Pixels the pointer must travel before a press counts as a drag.
    var DRAG_THRESHOLD = 5;

    function makeTile(entry) {
        var tile = document.createElement("div");
        tile.className = "tile";
        tile.textContent = entry.glyph;
        tile.title = entry.name;

        var startX = 0;
        var startY = 0;
        var pressing = false;
        var dragging = false;

        tile.addEventListener("pointerdown", function (e) {
            pressing = true;
            dragging = false;
            startX = e.clientX;
            startY = e.clientY;
            // Capture the pointer so pointermove/up keep firing on this tile
            // even once the cursor leaves the iframe and moves over the canvas.
            // This is what lets a drag cross the cross-origin iframe boundary.
            tile.setPointerCapture(e.pointerId);
        });

        tile.addEventListener("pointermove", function (e) {
            if (!pressing || dragging) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
            dragging = true;
            tile.classList.add("dragging");
        });

        var release = function (e) {
            if (tile.hasPointerCapture(e.pointerId)) {
                tile.releasePointerCapture(e.pointerId);
            }
            tile.classList.remove("dragging");
        };

        tile.addEventListener("pointerup", function (e) {
            release(e);
            if (!pressing) return;
            pressing = false;
            if (dragging) {
                // clientX/clientY stay in this iframe's frame (they go negative
                // past the left edge), so the driver offsets them by the iframe
                // rect and converts to canvas space.
                api.postMessage({
                    type: "drop-glyph",
                    glyph: entry.glyph,
                    x: e.clientX,
                    y: e.clientY,
                });
            } else {
                // A press that never crossed the threshold is a click: drop at
                // the viewport center.
                api.postMessage({ type: "insert-glyph", glyph: entry.glyph });
            }
        });

        tile.addEventListener("pointercancel", function (e) {
            release(e);
            pressing = false;
            dragging = false;
        });

        return tile;
    }

    function render() {
        var q = query.trim().toLowerCase();
        list.innerHTML = "";
        var any = false;
        for (var i = 0; i < CATEGORIES.length; i++) {
            var cat = CATEGORIES[i];
            var visible = cat.symbols.filter(function (s) {
                return matches(s, q);
            });
            if (visible.length === 0) continue;
            any = true;
            var label = document.createElement("div");
            label.className = "cat-label";
            label.textContent = cat.label;
            list.appendChild(label);
            var grid = document.createElement("div");
            grid.className = "grid";
            for (var j = 0; j < visible.length; j++) {
                grid.appendChild(makeTile(visible[j]));
            }
            list.appendChild(grid);
        }
        if (!any) {
            var empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No symbols match \\u201C" + query + "\\u201D";
            list.appendChild(empty);
        }
    }

    search.addEventListener("input", function () {
        query = search.value;
        render();
    });

    api.onMessage(function (raw) {
        if (!raw) return;
        if (raw.type === "theme") {
            themeStyle.textContent = ":root{" + raw.css + "}";
            return;
        }
        if (raw.type !== "init") return;
        CATEGORIES = raw.categories || [];
        render();
    });

    api.postMessage({ type: "ready" });
})();
</script>
</body>
</html>`;
