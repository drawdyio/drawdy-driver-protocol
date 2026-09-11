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
main {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
section {
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-lg, 12px);
    padding: 10px;
}
.sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 8px;
}
.sec-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--drawdy-muted-foreground, #888);
}
input {
    height: 28px;
    padding: 2px 8px;
    font: inherit;
    color: var(--drawdy-foreground, #111);
    background: var(--drawdy-surface, #fff);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-md, 8px);
    outline: none;
}
input:focus-visible {
    box-shadow: 0 0 0 2px var(--drawdy-ring, #94ba00);
}
button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
.icon-btn { width: 28px; padding: 0; }
.sb-item {
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-md, 8px);
    margin-bottom: 6px;
    overflow: hidden;
}
.sb-item:last-child { margin-bottom: 0; }
.sb-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    user-select: none;
}
.sb-name {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.sb-name-edit { flex: 1; width: 0; min-width: 0; height: 24px; font-weight: 500; }
.sb-dim { color: var(--drawdy-muted-foreground, #888); font-size: 11px; }
.sb-body { padding: 2px 8px 8px; display: flex; flex-direction: column; gap: 6px; }
.size-row { display: flex; gap: 6px; align-items: center; }
.size-row input { flex: 1; width: 0; min-width: 0; }
.size-row .x { color: var(--drawdy-muted-foreground, #888); }
.row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-radius: var(--drawdy-radius-md, 8px);
    cursor: pointer;
}
.row:hover { background: var(--drawdy-surface, #f4f4f4); }
.row .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.row .id { color: var(--drawdy-muted-foreground, #888); font-size: 11px; }
.row button { height: 22px; width: 22px; padding: 0; font-size: 12px; }
.empty { font-size: 12px; color: var(--drawdy-muted-foreground, #888); padding: 4px 6px; }
.hint {
    font-size: 10.5px;
    font-style: italic;
    color: var(--drawdy-muted-foreground, #888);
    margin-top: 8px;
}
</style>
</head>
<body>
<main>
    <section>
        <div class="sec-head">
            <span class="sec-label">Sandboxes</span>
            <button id="sb-new">+ New</button>
        </div>
        <div id="sandbox-list"></div>
        <div class="hint">* Elements leaving a sandbox lose their physics.</div>
    </section>

    <section>
        <div class="sec-label sec-head">Static colliders</div>
        <div id="static-list"></div>
    </section>

    <section>
        <div class="sec-label sec-head">Dynamic bodies</div>
        <div id="dynamic-list"></div>
    </section>
</main>
<script>
(function () {
    var api = acquireDrawdyApi();
    var themeStyle = document.getElementById("theme");
    var sandboxList = document.getElementById("sandbox-list");
    var pendingState = null;

    function renderSandboxes(items) {
        sandboxList.textContent = "";
        if (items.length === 0) {
            var empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent =
                "No sandbox yet — one appears around your tagged elements " +
                "when the first simulation runs.";
            sandboxList.appendChild(empty);
            return;
        }
        items.forEach(function (item) {
            var box = document.createElement("div");
            box.className = "sb-item";

            var head = document.createElement("div");
            head.className = "sb-head";
            var name = document.createElement("span");
            name.className = "sb-name";
            name.textContent = item.name;
            name.title = "Double-click to rename";
            var dim = document.createElement("span");
            dim.className = "sb-dim";
            dim.textContent =
                Math.round(item.width) + "\\u00d7" + Math.round(item.height);
            head.appendChild(name);
            head.appendChild(dim);
            box.appendChild(head);

            var body = document.createElement("div");
            body.className = "sb-body";

            var sizeRow = document.createElement("div");
            sizeRow.className = "size-row";
            var w = document.createElement("input");
            w.type = "number";
            w.min = "200";
            w.step = "50";
            w.value = String(Math.round(item.width));
            var x = document.createElement("span");
            x.className = "x";
            x.textContent = "\\u00d7";
            var h = document.createElement("input");
            h.type = "number";
            h.min = "200";
            h.step = "50";
            h.value = String(Math.round(item.height));
            var apply = document.createElement("button");
            apply.textContent = "Apply";
            apply.addEventListener("click", function () {
                var wv = Number(w.value);
                var hv = Number(h.value);
                if (!isFinite(wv) || !isFinite(hv) || wv < 200 || hv < 200) {
                    return;
                }
                api.postMessage({
                    type: "resize-sandbox",
                    id: item.id,
                    width: wv,
                    height: hv,
                });
            });
            var fly = document.createElement("button");
            fly.className = "icon-btn";
            fly.textContent = "\\u2192";
            fly.title = "Fly to sandbox";
            fly.addEventListener("click", function () {
                api.postMessage({ type: "fly-to", id: item.id });
            });
            var del = document.createElement("button");
            del.className = "icon-btn";
            del.textContent = "\\u{1F5D1}\\uFE0F";
            del.title = "Delete sandbox";
            del.addEventListener("click", function () {
                api.postMessage({ type: "delete-sandbox", id: item.id });
            });
            sizeRow.appendChild(w);
            sizeRow.appendChild(x);
            sizeRow.appendChild(h);
            sizeRow.appendChild(apply);
            sizeRow.appendChild(fly);
            sizeRow.appendChild(del);
            body.appendChild(sizeRow);
            box.appendChild(body);

            name.addEventListener("dblclick", function (e) {
                e.stopPropagation();
                var edit = document.createElement("input");
                edit.type = "text";
                edit.className = "sb-name-edit";
                edit.value = item.name;
                var done = false;
                var finish = function (commit) {
                    if (done) return;
                    done = true;
                    var next = edit.value.trim();
                    if (commit && next && next !== item.name) {
                        item.name = next;
                        name.textContent = next;
                        api.postMessage({
                            type: "rename-sandbox",
                            id: item.id,
                            name: next,
                        });
                    }
                    edit.replaceWith(name);
                };
                edit.addEventListener("blur", function () {
                    finish(true);
                });
                edit.addEventListener("keydown", function (ev) {
                    if (ev.key === "Enter") finish(true);
                    if (ev.key === "Escape") finish(false);
                });
                name.replaceWith(edit);
                edit.focus();
                edit.select();
            });

            sandboxList.appendChild(box);
        });
    }

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
            row.title = "Select in scene";
            row.addEventListener("click", function () {
                api.postMessage({ type: "select", id: item.id });
            });
            var name = document.createElement("span");
            name.className = "name";
            name.textContent = item.label + " ";
            var id = document.createElement("span");
            id.className = "id";
            id.textContent = item.id.slice(-4);
            name.appendChild(id);
            var fly = document.createElement("button");
            fly.textContent = "\\u2192";
            fly.title = "Fly to";
            fly.addEventListener("click", function (e) {
                e.stopPropagation();
                api.postMessage({ type: "fly-to", id: item.id });
            });
            var untag = document.createElement("button");
            untag.textContent = "\\u2715";
            untag.title = "Remove physics tag";
            untag.addEventListener("click", function (e) {
                e.stopPropagation();
                api.postMessage({ type: "untag", id: item.id });
            });
            row.appendChild(name);
            row.appendChild(fly);
            row.appendChild(untag);
            root.appendChild(row);
        });
    }

    function renderState(msg) {
        renderSandboxes(msg.sandboxes);
        renderList("static-list", msg.statics);
        renderList("dynamic-list", msg.dynamics);
    }

    api.onMessage(function (msg) {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "theme") {
            themeStyle.textContent = ":root{" + msg.css + "}";
            return;
        }
        if (msg.type !== "state") return;
        // Never re-render under the user's cursor mid-edit.
        if (sandboxList.contains(document.activeElement)) {
            pendingState = msg;
            return;
        }
        renderState(msg);
    });

    sandboxList.addEventListener("focusout", function () {
        setTimeout(function () {
            if (pendingState && !sandboxList.contains(document.activeElement)) {
                var msg = pendingState;
                pendingState = null;
                renderState(msg);
            }
        }, 0);
    });

    document.getElementById("sb-new").addEventListener("click", function () {
        api.postMessage({ type: "create-sandbox" });
    });

    api.postMessage({ type: "ready" });
})();
</script>
</body>
</html>`;
