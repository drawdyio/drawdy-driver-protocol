// Build script, don't touch

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildExtension } from "./bundle.ts";

const dir = process.cwd();
const { bytes, manifest } = await buildExtension(dir);
const outName = `${manifest.driverId.replace(/\./g, "-")}.drawdyx`;
mkdirSync(join(dir, "dist"), { recursive: true });
writeFileSync(join(dir, "dist", outName), bytes);
console.log(
    `packed ${manifest.driverId} -> dist/${outName} (${bytes.byteLength} bytes)`
);
