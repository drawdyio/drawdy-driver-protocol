// embeds webview code within driver code directly. See the output dist to see how this works.
// you will see a big `const WEBVIEW_HTML = ...` at the top.

import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import tailwindcss from "@tailwindcss/postcss";
import { zipSync, strToU8 } from "fflate";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const pkgRoot = dirname(fileURLToPath(import.meta.url));

const WEBVIEW_HTML_MODULE = "virtual:webview-html";

function webviewHtml() {
    return {
        name: "webview-html",
        resolveId(id) {
            return id === WEBVIEW_HTML_MODULE ? `\0${id}` : null;
        },
        async load(id) {
            if (id !== `\0${WEBVIEW_HTML_MODULE}`) return null;

            const cssEntry = join(pkgRoot, "webview", "styles.css");
            const { css } = await postcss([
                tailwindcss({ optimize: { minify: true } }),
            ]).process(readFileSync(cssEntry, "utf8"), { from: cssEntry });

            const js = readFileSync(
                join(pkgRoot, "dist", "webview.js"),
                "utf8"
            ).replaceAll("</script", "<\\/script");

            const html = `<!doctype html><html><head><meta charset="utf-8"/><style>:root{/*__DRAWDY_STYLING__*/}</style><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
            return `export const WEBVIEW_HTML = ${JSON.stringify(html)};`;
        },
    };
}

function packDrawdyx() {
    return {
        name: "pack-drawdyx",
        writeBundle() {
            const manifest = readFileSync(
                join(pkgRoot, "manifest.json"),
                "utf8"
            );
            const code = readFileSync(join(pkgRoot, "dist", "main.js"), "utf8");
            const drawdyx = zipSync({
                "manifest.json": strToU8(manifest),
                "main.js": strToU8(code),
            });

            const outName = `${JSON.parse(manifest).driverId.replace(/\./g, "-")}.drawdyx`;
            writeFileSync(join(pkgRoot, "dist", outName), drawdyx);

            const publicDir = join(
                pkgRoot,
                "..",
                "..",
                "..",
                "..",
                "frontend",
                "public",
                "extensions"
            );
            if (!existsSync(publicDir)) return;
            writeFileSync(join(publicDir, outName), drawdyx);

            console.log(
                `packed ${outName} (${drawdyx.byteLength} bytes) -> dist/ and frontend/public/extensions/`
            );
        },
    };
}

/** The webview react app, bundled for the sandboxed iframe. */
const webview = {
    input: "webview/index.tsx",
    output: {
        file: "dist/webview.js",
        format: "iife",
    },
    plugins: [
        typescript(),
        resolve({ browser: true }),
        commonjs(),
        replace({
            preventAssignment: true,
            "process.env.NODE_ENV": JSON.stringify("production"),
        }),
        terser(),
    ],
};

const driver = {
    input: "src/index.ts",
    output: {
        file: "dist/main.js",
        format: "cjs",
        exports: "named",
    },
    plugins: [webviewHtml(), typescript(), packDrawdyx()],
};

export default [webview, driver];
