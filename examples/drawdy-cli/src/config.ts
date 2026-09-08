import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface CliConfig {
    apiUrl?: string;
    token?: string;
    githubToken?: string;
}

export const DEFAULT_API_URL = "https://api.drawdy.io";

const configDir = path.join(homedir(), ".drawdy");
const configPath = path.join(configDir, "config.json");

export const readConfig = (): CliConfig => {
    try {
        return JSON.parse(readFileSync(configPath, "utf8")) as CliConfig;
    } catch {
        return {};
    }
};

export const writeConfig = (config: CliConfig): void => {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    writeFileSync(configPath, `${JSON.stringify(config, null, 4)}\n`, {
        mode: 0o600,
    });
    chmodSync(configPath, 0o600);
};

export const resolveApiUrl = (flag?: string): string =>
    (
        flag ||
        process.env.DRAWDY_API_URL ||
        readConfig().apiUrl ||
        DEFAULT_API_URL
    ).replace(/\/+$/, "");
