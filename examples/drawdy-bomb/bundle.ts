// Build script, don't touch

import { strToU8, zipSync } from "fflate";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rollup, type OutputOptions, type RollupOptions } from "rollup";
import { loadConfigFile } from "rollup/loadConfigFile";

export type ExtensionManifest = {
    driverId: string;
    main: string;
    [key: string]: unknown;
};

export type PackedExtension = {
    bytes: Uint8Array;
    manifest: ExtensionManifest;
};

const CONFIG_FILES = [
    "rollup.config.mjs",
    "rollup.config.js",
    "rollup.config.ts",
];

export function packExtension(dir: string): PackedExtension {
    const path = join(dir, "manifest.json");
    const manifestRaw = readFileSync(path, "utf8");
    if (!manifestRaw) {
        throw new Error("manifest now found");
    }
    const manifest = JSON.parse(manifestRaw) as ExtensionManifest;
    if (
        typeof manifest?.driverId !== "string" ||
        typeof manifest?.main !== "string"
    ) {
        throw new Error(`${path} must define string "driverId" and "main"`);
    }
    const code = readFileSync(join(dir, "dist", manifest.main), "utf8");
    const bytes = zipSync({
        "manifest.json": strToU8(manifestRaw),
        [manifest.main]: strToU8(code),
    });
    return { bytes, manifest };
}

async function loadOptions(dir: string): Promise<RollupOptions[]> {
    const configPath = CONFIG_FILES.map((f) => join(dir, f)).find(existsSync);
    if (configPath) {
        const { options, warnings } = await loadConfigFile(configPath, {});
        warnings.flush();
        return options;
    }
    const typescript = (await import("@rollup/plugin-typescript")).default;
    return [
        {
            input: join(dir, "src", "index.ts"),
            output: {
                file: join(dir, "dist", "main.js"),
                format: "cjs",
                exports: "named",
            },
            plugins: [typescript({ tsconfig: join(dir, "tsconfig.json") })],
        },
    ];
}

function outputsOf(options: RollupOptions): OutputOptions[] {
    if (!options.output) return [];
    return Array.isArray(options.output) ? options.output : [options.output];
}

export async function buildExtension(dir: string): Promise<PackedExtension> {
    for (const options of await loadOptions(dir)) {
        const bundle = await rollup(options);
        for (const output of outputsOf(options)) {
            await bundle.write(output);
        }
        await bundle.close();
    }
    return packExtension(dir);
}
