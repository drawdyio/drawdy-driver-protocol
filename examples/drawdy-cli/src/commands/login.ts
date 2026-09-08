import { ApiError, apiFetch } from "../api";
import { openBrowser, sleep } from "../browser";
import { readConfig, writeConfig } from "../config";

export const CLI_CLIENT_ID = "drawdy-cli";

interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
}

interface DeviceTokenResponse {
    access_token: string;
}

interface SessionResponse {
    user?: { email?: string; name?: string };
}

export async function login(apiUrl: string): Promise<void> {
    const device = await apiFetch<DeviceCodeResponse>(
        { apiUrl },
        "/api/auth/device/code",
        { method: "POST", body: { client_id: CLI_CLIENT_ID } }
    );

    console.log(`\n  One-time code: ${device.user_code}`);
    console.log(
        `  Approve the request in your browser:\n  ${device.verification_uri_complete}\n`
    );
    console.log("  Waiting for approval...");
    openBrowser(device.verification_uri_complete);

    let intervalMs = Math.max(device.interval || 5, 1) * 1000;
    const deadline = Date.now() + device.expires_in * 1000;

    while (Date.now() < deadline) {
        await sleep(intervalMs);
        try {
            const token = await apiFetch<DeviceTokenResponse>(
                { apiUrl },
                "/api/auth/device/token",
                {
                    method: "POST",
                    body: {
                        grant_type:
                            "urn:ietf:params:oauth:grant-type:device_code",
                        device_code: device.device_code,
                        client_id: CLI_CLIENT_ID,
                    },
                }
            );
            writeConfig({
                ...readConfig(),
                apiUrl,
                token: token.access_token,
            });
            const session = await apiFetch<SessionResponse | null>(
                { apiUrl, token: token.access_token },
                "/api/auth/get-session"
            );
            const who = session?.user?.email ?? "your Drawdy account";
            console.log(`\nLogged in as ${who}.`);
            return;
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.code === "authorization_pending") continue;
                if (err.code === "slow_down") {
                    intervalMs += 5000;
                    continue;
                }
                if (err.code === "access_denied") {
                    throw new Error("The login request was denied.");
                }
                if (err.code === "expired_token") break;
            }
            throw err;
        }
    }

    throw new Error("The login request expired. Run `drawdy login` again.");
}
