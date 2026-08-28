// build script, don't touch

import type { Plugin } from "vite";
import { buildExtension } from "./bundle";

const BUILT_PATH = "/built.drawdyx";
const VERSION_PATH = "/version";

export function drawdyExtension(): Plugin {
    let root = process.cwd();
    let bytes: Uint8Array | null = null;
    let version = 0;
    let building = false;
    let pending = false;
    let log: (message: string) => void = () => {};

    const build = async (): Promise<void> => {
        if (building) {
            pending = true;
            return;
        }
        building = true;
        try {
            const packed = await buildExtension(root);
            bytes = packed.bytes;
            version++;
            log(
                `built v${version} (${packed.manifest.driverId}, ${bytes.byteLength} bytes)`
            );
        } catch (err) {
            log(`build failed: ${err instanceof Error ? err.message : err}`);
        } finally {
            building = false;
            if (pending) {
                pending = false;
                void build();
            }
        }
    };

    return {
        name: "drawdy-extension",
        configResolved(config) {
            root = config.root;
            log = (message) => config.logger.info(`[drawdy] ${message}`);
        },
        configureServer(server) {
            void build();
            server.middlewares.use((req, res, next) => {
                const path = (req.url ?? "/").split("?")[0];
                if (path !== BUILT_PATH && path !== VERSION_PATH) {
                    next();
                    return;
                }
                res.setHeader("access-control-allow-origin", "*");
                res.setHeader("access-control-allow-methods", "GET, OPTIONS");
                res.setHeader("cache-control", "no-store");
                if (req.method === "OPTIONS") {
                    res.statusCode = 204;
                    res.end();
                    return;
                }
                if (path === VERSION_PATH) {
                    res.setHeader("content-type", "application/json");
                    res.end(JSON.stringify({ version }));
                    return;
                }
                if (!bytes) {
                    res.statusCode = 404;
                    res.end();
                    return;
                }
                res.setHeader("content-type", "application/zip");
                res.end(Buffer.from(bytes));
            });
        },
        hotUpdate(ctx) {
            if (ctx.file.includes("/dist/")) return;
            void build();
        },
    };
}
