import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ApiError, apiFetch } from "../api";
import { readConfig } from "../config";
import { getHeadSha, getOriginRepoUrl, hasUncommittedChanges } from "../git";
import { acquireGithubToken } from "./github-auth";

export interface SubmissionSummary {
    id: string;
    driverId: string;
    version: string;
    status: string;
    repoUrl: string;
    commitSha: string;
    buildError?: string;
    reviewNote?: string;
    createdAt: string;
}

interface SubmitFlags {
    repo?: string;
    ref?: string;
}

export async function submit(
    apiUrl: string,
    token: string | undefined,
    flags: SubmitFlags
): Promise<void> {
    if (!token) {
        throw new Error("Not logged in. Run `drawdy login` first.");
    }

    let repoUrl = flags.repo;
    let ref = flags.ref;

    if (!repoUrl) {
        repoUrl = getOriginRepoUrl() ?? undefined;
        if (!repoUrl) {
            throw new Error(
                "No GitHub `origin` remote found in this directory. Run inside your extension repo or pass --repo <url>."
            );
        }
        if (!ref) {
            ref = getHeadSha() ?? undefined;
            if (!ref) {
                throw new Error(
                    "Could not resolve HEAD. Pass --ref <branch|tag|sha>."
                );
            }
        }
        if (hasUncommittedChanges()) {
            console.warn(
                "Warning: this working tree has uncommitted changes; only the committed and pushed state of the ref is submitted."
            );
        }
        const manifestPath = path.join(process.cwd(), "manifest.json");
        if (!existsSync(manifestPath)) {
            console.warn(
                "Warning: no manifest.json found at the repo root here; the server requires one at the root of the submitted ref."
            );
        } else {
            try {
                JSON.parse(readFileSync(manifestPath, "utf8"));
            } catch {
                throw new Error("manifest.json is not valid JSON.");
            }
        }
    } else if (!ref) {
        ref = "HEAD";
    }

    let githubToken = readConfig().githubToken;
    if (!githubToken) {
        githubToken = await acquireGithubToken(apiUrl);
    }

    console.log(`Submitting ${repoUrl} @ ${ref} ...`);

    const post = (ghToken: string) =>
        apiFetch<{ submission: SubmissionSummary }>(
            { apiUrl, token },
            "/api/extensions/submissions",
            { method: "POST", body: { repoUrl, ref, githubToken: ghToken } }
        );

    let submission: SubmissionSummary;
    try {
        let res: { submission: SubmissionSummary };
        try {
            res = await post(githubToken);
        } catch (err) {
            if (
                err instanceof ApiError &&
                err.status === 401 &&
                /github/i.test(err.message)
            ) {
                console.log("Your GitHub authorization expired.");
                res = await post(await acquireGithubToken(apiUrl));
            } else {
                throw err;
            }
        }
        submission = res.submission;
    } catch (err) {
        if (
            err instanceof ApiError &&
            err.status === 400 &&
            /ref not found/i.test(err.message) &&
            !flags.ref
        ) {
            throw new Error(
                `${err.message}\nThe submitted commit must exist on GitHub. Push your latest commits, or pass --ref <branch|tag|sha>.`
            );
        }
        throw err;
    }

    console.log("\nSubmission created:");
    console.log(`  id:        ${submission.id}`);
    console.log(`  extension: ${submission.driverId}@${submission.version}`);
    console.log(`  commit:    ${submission.commitSha.slice(0, 12)}`);
    console.log(`  status:    ${submission.status}`);
    console.log(
        "\nIt will be built automatically and then reviewed by the Drawdy team."
    );
    console.log("Track it with `drawdy submissions`.");
}

export async function listSubmissions(
    apiUrl: string,
    token?: string
): Promise<void> {
    if (!token) {
        throw new Error("Not logged in. Run `drawdy login` first.");
    }
    const { submissions } = await apiFetch<{
        submissions: SubmissionSummary[];
    }>({ apiUrl, token }, "/api/extensions/submissions");

    if (submissions.length === 0) {
        console.log("No submissions yet. Run `drawdy submit` in your extension repo.");
        return;
    }

    const rows = submissions.map((s) => ({
        extension: `${s.driverId}@${s.version}`,
        status: s.status,
        submitted: new Date(s.createdAt).toLocaleString(),
        detail: s.buildError ?? s.reviewNote ?? "",
    }));
    const widths = {
        extension: Math.max(9, ...rows.map((r) => r.extension.length)),
        status: Math.max(6, ...rows.map((r) => r.status.length)),
        submitted: Math.max(9, ...rows.map((r) => r.submitted.length)),
    };

    console.log(
        `${"EXTENSION".padEnd(widths.extension)}  ${"STATUS".padEnd(widths.status)}  ${"SUBMITTED".padEnd(widths.submitted)}  DETAIL`
    );
    for (const row of rows) {
        console.log(
            `${row.extension.padEnd(widths.extension)}  ${row.status.padEnd(widths.status)}  ${row.submitted.padEnd(widths.submitted)}  ${row.detail}`
        );
    }
}
