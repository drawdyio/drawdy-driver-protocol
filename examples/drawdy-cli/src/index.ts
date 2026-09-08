import { ApiError } from "./api";
import { login } from "./commands/login";
import { logout, whoami } from "./commands/session";
import { listSubmissions, submit } from "./commands/submit";
import { readConfig, resolveApiUrl } from "./config";

const VERSION = "0.1.0";

const HELP = `drawdy — the Drawdy extension publisher CLI

Usage
  drawdy login [--api <url>]      Sign in via your browser (device flow)
  drawdy logout                   Sign out and forget the stored token
  drawdy whoami                   Show the signed-in account
  drawdy submit [--repo <url>] [--ref <branch|tag|sha>]
                                  Submit an extension repo to the marketplace.
                                  Defaults to this directory's GitHub origin
                                  remote at the current HEAD commit. Signs you
                                  in to GitHub (once) to verify push access.
  drawdy submissions              List your submissions and their status

Options
  --api <url>    Drawdy API base URL (also DRAWDY_API_URL env var)
  -h, --help     Show this help
  -v, --version  Show the CLI version
`;

interface ParsedArgs {
    command?: string;
    flags: Record<string, string | boolean>;
}

const FLAGS_WITH_VALUES = new Set(["api", "repo", "ref"]);

const parseArgs = (argv: string[]): ParsedArgs => {
    const flags: Record<string, string | boolean> = {};
    let command: string | undefined;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--") continue;
        if (arg.startsWith("--")) {
            const name = arg.slice(2);
            if (FLAGS_WITH_VALUES.has(name)) {
                const value = argv[++i];
                if (value === undefined) {
                    throw new Error(`--${name} requires a value`);
                }
                flags[name] = value;
            } else {
                flags[name] = true;
            }
        } else if (arg === "-h") {
            flags.help = true;
        } else if (arg === "-v") {
            flags.version = true;
        } else if (!command) {
            command = arg;
        } else {
            throw new Error(`Unexpected argument: ${arg}`);
        }
    }
    return { command, flags };
};

async function main(): Promise<void> {
    const { command, flags } = parseArgs(process.argv.slice(2));

    if (flags.version) {
        console.log(VERSION);
        return;
    }
    if (flags.help || !command || command === "help") {
        console.log(HELP);
        if (command === undefined && !flags.help) process.exitCode = 0;
        return;
    }

    const apiFlag = typeof flags.api === "string" ? flags.api : undefined;
    const apiUrl = resolveApiUrl(apiFlag);
    const { token } = readConfig();

    switch (command) {
        case "login":
            await login(apiUrl);
            break;
        case "logout":
            await logout(apiUrl, token);
            break;
        case "whoami":
            await whoami(apiUrl, token);
            break;
        case "submit":
            await submit(apiUrl, token, {
                repo: typeof flags.repo === "string" ? flags.repo : undefined,
                ref: typeof flags.ref === "string" ? flags.ref : undefined,
            });
            break;
        case "submissions":
        case "list":
            await listSubmissions(apiUrl, token);
            break;
        default:
            throw new Error(
                `Unknown command: ${command}. Run \`drawdy --help\`.`
            );
    }
}

main().catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
        console.error(
            "Error: not authorized. Run `drawdy login` and try again."
        );
    } else {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
    }
    process.exitCode = 1;
});
