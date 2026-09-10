/**
 * The physics panel webview, inlined as one self-contained HTML string.
 * Plain DOM — no framework build step. `acquireDrawdyApi()` is injected by
 * drawdy at runtime; content arrives via `state` messages.
 */
export const PANEL_HTML = `<!doctype html>
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
    font-size: 13px;
    background: var(--drawdy-background, #fff);
    color: var(--drawdy-foreground, #111);
    display: flex;
    flex-direction: column;
    height: 100vh;
}
main { flex: 1; overflow-y: auto; padding: 12px; }
.sec-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--drawdy-muted-foreground, #888);
    margin: 16px 0 8px;
}
.sec-label:first-child { margin-top: 0; }
.size-row { display: flex; gap: 6px; align-items: center; }
.size-row input {
    width: 72px;
    height: 28px;
    padding: 2px 8px;
    font: inherit;
    color: var(--drawdy-foreground, #111);
    background: var(--drawdy-surface, #fff);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-md, 8px);
    outline: none;
}
.size-row input:focus-visible {
    box-shadow: 0 0 0 2px var(--drawdy-ring, #94ba00);
}
.size-row .x { color: var(--drawdy-muted-foreground, #888); }
button {
    height: 28px;
    padding: 0 10px;
    font: inherit;
    font-size: 12px;
    color: var(--drawdy-foreground, #111);
    background: var(--drawdy-surface, #f4f4f4);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-md, 8px);
    cursor: pointer;
}
button:hover { border-color: var(--drawdy-primary, #6366f1); }
.btn-row { display: flex; gap: 6px; margin-top: 8px; }
.row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-radius: var(--drawdy-radius-md, 8px);
}
.row:hover { background: var(--drawdy-surface, #f4f4f4); }
.row .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.row .id { color: var(--drawdy-muted-foreground, #888); font-size: 11px; }
.row button { height: 22px; padding: 0 7px; font-size: 11px; }
.empty { font-size: 12px; color: var(--drawdy-muted-foreground, #888); padding: 4px 6px; }
.hint { font-size: 11px; color: var(--drawdy-muted-foreground, #888); margin-top: 6px; }
</style>
</head>
<body>
<main>
    <div class="sec-label">Sandbox</div>
    <div id="sandbox-none" class="empty" hidden>
        No sandbox yet — it appears around your tagged elements when the
        first simulation runs.
    </div>
    <div id="sandbox-controls" hidden>
        <div class="size-row">
            <input id="sb-w" type="number" min="200" step="50" />
            <span class="x">×</span>
            <input id="sb-h" type="number" min="200" step="50" />
            <button id="sb-apply">Apply</button>
        </div>
        <div class="btn-row">
            <button id="sb-fit">Fit to content</button>
            <button id="sb-fly">Fly to sandbox</button>
        </div>
        <div class="hint">Elements leaving the sandbox lose their physics tag.</div>
    </div>

    <div class="sec-label">Static colliders</div>
    <div id="static-list"></div>

    <div class="sec-label">Dynamic bodies</div>
    <div id="dynamic-list"></div>
</main>
<script>
(function () {
    var api = acquireDrawdyApi();
    var themeStyle = document.getElementById("theme");
    var sbNone = document.getElementById("sandbox-none");
    var sbControls = document.getElementById("sandbox-controls");
    var sbW = document.getElementById("sb-w");
    var sbH = document.getElementById("sb-h");

    function renderList(rootId, items) {
        var root = document.getElementById(rootId);
        root.textContent = "";
        if (items.length === 0) {
            var empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "None tagged.";
            root.appendChild(empty);
            return;
        }
        items.forEach(function (item) {
            var row = document.createElement("div");
            row.className = "row";
            var name = document.createElement("span");
            name.className = "name";
            name.textContent = item.label + " ";
            var id = document.createElement("span");
            id.className = "id";
            id.textContent = item.id.slice(-4);
            name.appendChild(id);
            var fly = document.createElement("button");
            fly.textContent = "Fly to";
            fly.addEventListener("click", function () {
                api.postMessage({ type: "fly-to", id: item.id });
            });
            var untag = document.createElement("button");
            untag.textContent = "\\u2715";
            untag.title = "Remove physics tag";
            untag.addEventListener("click", function () {
                api.postMessage({ type: "untag", id: item.id });
            });
            row.appendChild(name);
            row.appendChild(fly);
            row.appendChild(untag);
            root.appendChild(row);
        });
    }

    api.onMessage(function (msg) {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "theme") {
            themeStyle.textContent = ":root{" + msg.css + "}";
            return;
        }
        if (msg.type !== "state") return;
        var hasSandbox = !!msg.sandbox;
        sbNone.hidden = hasSandbox;
        sbControls.hidden = !hasSandbox;
        if (hasSandbox && document.activeElement !== sbW && document.activeElement !== sbH) {
            sbW.value = String(Math.round(msg.sandbox.width));
            sbH.value = String(Math.round(msg.sandbox.height));
        }
        renderList("static-list", msg.statics);
        renderList("dynamic-list", msg.dynamics);
    });

    document.getElementById("sb-apply").addEventListener("click", function () {
        var w = Number(sbW.value);
        var h = Number(sbH.value);
        if (!isFinite(w) || !isFinite(h) || w < 200 || h < 200) return;
        api.postMessage({ type: "resize-sandbox", width: w, height: h });
    });
    document.getElementById("sb-fit").addEventListener("click", function () {
        api.postMessage({ type: "fit-sandbox" });
    });
    document.getElementById("sb-fly").addEventListener("click", function () {
        api.postMessage({ type: "fly-to-sandbox" });
    });

    api.postMessage({ type: "ready" });
})();
</script>
</body>
</html>`;
