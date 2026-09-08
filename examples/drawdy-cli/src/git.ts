import { execFileSync } from "node:child_process";

const REMOTE_PATTERNS = [
    /^git@github\.com:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/,
    /^ssh:\/\/git@github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/,
    /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/,
];

export const parseGitRemote = (remote: string): string | null => {
    const trimmed = remote.trim();
    for (const pattern of REMOTE_PATTERNS) {
        const match = pattern.exec(trimmed);
        if (match) return `https://github.com/${match[1]}/${match[2]}`;
    }
    return null;
};

const git = (args: string[]): string | null => {
    try {
        return execFileSync("git", args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
};

export const getOriginRepoUrl = (): string | null => {
    const raw = git(["remote", "get-url", "origin"]);
    return raw ? parseGitRemote(raw) : null;
};

export const getHeadSha = (): string | null =>
    git(["rev-parse", "HEAD"]);

export const hasUncommittedChanges = (): boolean => {
    const status = git(["status", "--porcelain"]);
    return status !== null && status.length > 0;
};
