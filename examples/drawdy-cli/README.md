# drawdy-cli

The Drawdy extension publisher CLI. It signs you in to Drawdy from the
terminal, submits an extension repository to the marketplace, and shows the
status of your submissions.

The CLI is a single dependency-free ESM bundle (`dist/index.js`) that talks to
the Drawdy API over `fetch`. Node 20 or newer is required.

## Install

The package is private to the monorepo and is not published to npm.

```bash
# from the drawdy-driver-protocol root
pnpm --filter drawdy-cli build      # -> examples/drawdy-cli/dist/index.js

# run it directly
node examples/drawdy-cli/dist/index.js --help

# or expose it as `drawdy` on your PATH
cd examples/drawdy-cli && pnpm link --global
```

During development you can skip the build and run straight from source:

```bash
pnpm --filter drawdy-cli dev -- whoami
```

## Usage

```
drawdy login [--api <url>]      Sign in via your browser (device flow)
drawdy logout                   Sign out and forget the stored token
drawdy whoami                   Show the signed-in account
drawdy submit [--repo <url>] [--ref <branch|tag|sha>]
                                Submit an extension repo to the marketplace
drawdy submissions              List your submissions and their status
```

| Flag            | Meaning                                                   |
| --------------- | --------------------------------------------------------- |
| `--api <url>`   | Drawdy API base URL. Also read from `DRAWDY_API_URL`.     |
| `--repo <url>`  | GitHub repo to submit. Defaults to this repo's `origin`.  |
| `--ref <ref>`   | Branch, tag or SHA to submit. Defaults to `HEAD` locally. |
| `-h, --help`    | Show help.                                                |
| `-v, --version` | Show the CLI version.                                     |

`drawdy list` is accepted as an alias of `drawdy submissions`.

### Which API the CLI talks to

The base URL is resolved in this order:

1. `--api <url>`
2. `DRAWDY_API_URL` environment variable
3. `apiUrl` saved in `~/.drawdy/config.json` by the last `drawdy login`
4. `https://api.drawdy.io`

To work against a local backend, log in once with the flag and it sticks:

```bash
drawdy login --api http://localhost:3001
```

### Stored credentials

`drawdy login` writes `~/.drawdy/config.json` (directory `0700`, file `0600`)
containing the API URL, your Drawdy access token and, after the first submit,
a GitHub token. `drawdy logout` revokes the Drawdy session on the server and
removes both tokens from the file.

## Publishing an extension

### 1. Sign in

```bash
drawdy login
```

The CLI requests a device code from the API, prints a one-time code, opens the
approval page in your browser and polls until you approve. The token is stored
locally so later commands run without prompting.

### 2. Submit from your extension repo

```bash
cd my-extension
git push                 # the submitted commit must exist on GitHub
drawdy submit
```

With no flags the CLI:

- reads the `origin` remote and normalises it to an `https://github.com/owner/repo` URL (SSH and HTTPS remotes are both fine, non-GitHub remotes are rejected),
- pins the submission to the current `HEAD` commit,
- warns if the working tree has uncommitted changes, since only the pushed commit is submitted,
- warns if there is no `manifest.json` at the repo root, and fails if the one present is not valid JSON.

You can also submit a repo you are not standing in:

```bash
drawdy submit --repo https://github.com/acme/my-extension --ref v1.2.0
```

When `--repo` is given without `--ref`, the server resolves `HEAD` of the
default branch.

### 3. Prove you own the repo

The first submit runs a GitHub device-flow login as well. The resulting GitHub
token is sent to the Drawdy API, which checks that your GitHub account has
**push access** to the repo before accepting the submission. The token is
cached in the config file and refreshed automatically when it expires.

### 4. What the server checks

- The repo URL is on GitHub and the ref resolves to a commit.
- `manifest.json` exists at the root of that commit and passes validation (see below).
- The `driverId` is not under a reserved prefix such as `drawdy.`.
- The `driverId` is not already owned or claimed by another publisher. The first person to submit an id owns it.
- A newer submission for the same `driverId` supersedes any in-flight one.

### 5. Track it

```bash
drawdy submissions
```

```
EXTENSION           STATUS          SUBMITTED             DETAIL
acme.hello@1.0.0    pending_review  9/7/2026, 10:12:03 AM
acme.hello@0.9.0    superseded      9/6/2026, 4:40:11 PM
```

| Status           | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| `pending_build`  | Accepted, waiting for the build lane to bundle it.            |
| `build_failed`   | The bundle step failed. The reason is shown in `DETAIL`.      |
| `pending_review` | Built successfully, waiting for the Drawdy team to review it. |
| `rejected`       | Review declined it. The reviewer's note is shown in `DETAIL`. |
| `approved`       | Review passed, about to be published to the catalog.          |
| `published`      | Live in the marketplace.                                      |
| `superseded`     | Replaced by a newer submission of the same extension.         |

## What an extension repo needs

The build lane clones the submitted commit, bundles it with esbuild and packs
the result into a `.drawdyx` archive. Your repo has to satisfy the following.

**`manifest.json` at the repo root**

```json
{
    "driverId": "acme.hello",
    "driverName": "Hello",
    "driverVersion": "1.0.0",
    "description": "Says hello on the canvas.",
    "icon": "icon.png",
    "main": "index.js"
}
```

| Field           | Rule                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `driverId`      | Dot-namespaced lowercase, e.g. `author.extension`. Max 100 chars.       |
| `driverName`    | 1 to 100 chars.                                                         |
| `driverVersion` | Semver, e.g. `1.0.0`.                                                   |
| `description`   | Optional, max 500 chars.                                                |
| `icon`          | Optional path to a `.png`, `.webp` or `.svg` in the repo.               |
| `main`          | Plain `.js` filename the built bundle is written to inside the archive. |

**An entry point** at `src/index.ts`, `src/index.tsx` or `src/index.js`. It is
bundled for the browser as a single CommonJS file targeting ES2020.

**Only whitelisted bare imports.** Relative imports are fine, but the only
package an extension may import is `@drawdy/driver-protocol`. Anything else
fails the build.

**Size limits**: at most 500 source files and 20 MB of source, and the built
bundle must stay under 1 MB.

**Optional listing docs**: a `README.md` and `CHANGELOG.md` at the repo root
(up to 200 KB each) are shown on the extension's marketplace page.

## Development

```bash
pnpm --filter drawdy-cli dev -- <command>   # run from source with tsx
pnpm --filter drawdy-cli build              # bundle to dist/index.js
pnpm --filter drawdy-cli test               # vitest
pnpm --filter drawdy-cli exec tsc           # typecheck (noEmit)
```

Source layout:

```
src/
  index.ts              arg parsing, help text, command dispatch
  api.ts                fetch wrapper + ApiError (status, code)
  config.ts             ~/.drawdy/config.json read/write, API URL resolution
  browser.ts            open a URL in the default browser, sleep()
  git.ts                origin remote parsing, HEAD sha, dirty-tree check
  commands/
    login.ts            Drawdy device-flow login
    session.ts          whoami, logout
    github-auth.ts      GitHub device-flow login for push-access verification
    submit.ts           submit + submissions
```

Endpoints used: `POST /api/auth/device/code`, `POST /api/auth/device/token`,
`GET /api/auth/get-session`, `POST /api/auth/sign-out`,
`GET /api/extensions/github-app`, `POST /api/extensions/submissions`,
`GET /api/extensions/submissions`.

## Troubleshooting

**`Error: not authorized. Run drawdy login and try again.`**
Your Drawdy token expired or was revoked. Log in again.

**`No GitHub origin remote found in this directory.`**
Run the command inside the extension repo, or pass `--repo <url>`.

**`ref not found`**
The commit you are submitting is not on GitHub yet. Push first, or pass
`--ref` with a branch or tag that exists remotely.

**`Your GitHub account does not have push access to owner/repo`**
Only collaborators with push rights can publish a repo. Check which GitHub
account you approved in the browser.

**`The Drawdy GitHub OAuth app does not have Device Flow enabled.`**
Server-side misconfiguration. Enable Device Flow on the OAuth app in GitHub's
Developer settings.

**`This Drawdy server has no GitHub OAuth app configured`**
The API you are pointed at has no `GITHUB_CLIENT_ID`. Check `--api` or
`DRAWDY_API_URL`, or configure the backend.

**`Could not reach <url>`**
The API base URL is wrong or the server is down. See "Which API the CLI talks
to" above.
