import { spawn } from "node:child_process";

export const openBrowser = (url: string): void => {
    const command =
        process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "cmd"
              : "xdg-open";
    const args =
        process.platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
        spawn(command, args, { stdio: "ignore", detached: true }).unref();
    } catch {
        return;
    }
};

export const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));
