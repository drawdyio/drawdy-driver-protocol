#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const root = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(root, "package.json");

const run = (command) => execSync(command, { cwd: root, encoding: "utf8" }).trim();

const kind = process.argv[2];
if (!["major", "minor", "patch"].includes(kind)) {
    console.error("usage: node bump.mjs <major | minor | patch>");
    process.exit(1);
}

if (run("git status --porcelain") !== "") {
    console.error("working tree is not clean, commit or stash first");
    process.exit(1);
}

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split(".").map(Number);

const nextVersion = {
    major: `${major + 1}.0.0`,
    minor: `${major}.${minor + 1}.0`,
    patch: `${major}.${minor}.${patch + 1}`,
}[kind];

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question(`Next version is ${nextVersion}, confirm? [y/N] `);
prompt.close();
if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("aborted");
    process.exit(0);
}

pkg.version = nextVersion;
writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 4) + "\n");

const tag = `v${nextVersion}`;
const branch = run("git branch --show-current");

run("git add package.json");
run(`git commit -m "${tag}"`);
run(`git tag ${tag}`);
run(`git push origin ${branch}`);
run(`git push origin ${tag}`);

console.log(`bumped ${currentVersion} -> ${nextVersion} and pushed tag ${tag}`);
console.log("npm login then npm publish to publish the package");
