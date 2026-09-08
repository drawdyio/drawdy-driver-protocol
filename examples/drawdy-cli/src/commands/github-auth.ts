import { apiFetch } from "../api";
import { openBrowser, sleep } from "../browser";
import { readConfig, writeConfig } from "../config";

interface GithubDeviceCode {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
}

interface GithubTokenResponse {
    access_token?: string;
    error?: string;
    error_description?: string;
}

const githubPost = async <T>(url: string, body: unknown): Promise<T> => {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as
        | (T & { error?: string; error_description?: string })
        | null;
    if (!res.ok) {
        if (payload?.error === "device_flow_disabled") {
            throw new Error(
                'The Drawdy GitHub OAuth app does not have Device Flow enabled. Enable it on GitHub under Developer settings → OAuth Apps → your app → "Enable Device Flow".'
            );
        }
        const detail = payload?.error_description || payload?.error;
        throw new Error(
            `GitHub request failed with status ${res.status}${detail ? `: ${detail}` : ""}`
        );
    }
    if (!payload) {
        throw new Error("GitHub returned an unexpected empty response");
    }
    return payload;
};

async function githubDeviceLogin(clientId: string): Promise<string> {
    const device = await githubPost<GithubDeviceCode>(
        "https://github.com/login/device/code",
        { client_id: clientId }
    );

    console.log(
        `\n  To verify you own this repo, sign in to GitHub.\n  One-time code: ${device.user_code}`
    );
    console.log(`  Enter it at: ${device.verification_uri}\n`);
    console.log("  Waiting for GitHub...");
    openBrowser(device.verification_uri);

    let intervalMs = Math.max(device.interval || 5, 1) * 1000;
    const deadline = Date.now() + device.expires_in * 1000;

    while (Date.now() < deadline) {
        await sleep(intervalMs);
        const token = await githubPost<GithubTokenResponse>(
            "https://github.com/login/oauth/access_token",
            {
                client_id: clientId,
                device_code: device.device_code,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }
        );
        if (token.access_token) return token.access_token;
        if (token.error === "authorization_pending") continue;
        if (token.error === "slow_down") {
            intervalMs += 5000;
            continue;
        }
        if (token.error === "access_denied") {
            throw new Error("The GitHub authorization was denied.");
        }
        if (token.error === "expired_token") break;
        throw new Error(
            `GitHub authorization failed: ${token.error_description || token.error}`
        );
    }

    throw new Error("The GitHub authorization expired. Try again.");
}

export async function acquireGithubToken(apiUrl: string): Promise<string> {
    const { clientId } = await apiFetch<{ clientId: string | null }>(
        { apiUrl },
        "/api/extensions/github-app"
    );
    if (!clientId) {
        throw new Error(
            "This Drawdy server has no GitHub OAuth app configured, so repo ownership cannot be verified."
        );
    }
    const githubToken = await githubDeviceLogin(clientId);
    writeConfig({ ...readConfig(), githubToken });
    return githubToken;
}
