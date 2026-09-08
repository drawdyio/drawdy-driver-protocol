import { apiFetch } from "../api";
import { readConfig, writeConfig } from "../config";

interface SessionResponse {
    user?: { email?: string; name?: string };
}

export async function whoami(apiUrl: string, token?: string): Promise<void> {
    if (!token) {
        console.log("Not logged in. Run `drawdy login`.");
        process.exitCode = 1;
        return;
    }
    const session = await apiFetch<SessionResponse | null>(
        { apiUrl, token },
        "/api/auth/get-session"
    );
    if (!session?.user?.email) {
        console.log("Your session has expired. Run `drawdy login`.");
        process.exitCode = 1;
        return;
    }
    const name = session.user.name?.trim();
    console.log(
        name ? `${name} <${session.user.email}>` : session.user.email
    );
}

export async function logout(apiUrl: string, token?: string): Promise<void> {
    if (token) {
        try {
            await apiFetch({ apiUrl, token }, "/api/auth/sign-out", {
                method: "POST",
                body: {},
            });
        } catch {}
    }
    const config = readConfig();
    delete config.token;
    delete config.githubToken;
    writeConfig(config);
    console.log("Logged out.");
}
