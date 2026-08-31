# DDP docs

The [Mintlify](https://mintlify.com) site for the Drawdy Driver Protocol (DDP). It uses the Drawdy app's palette, logo mark, and fonts in both light and dark mode. Pages are the `.mdx` files in this folder; `docs.json` holds the config and navigation.

## Layout

- `index.mdx`: introduction and the driver model
- `quickstart.mdx`: build, run, and package a first driver
- `examples.mdx`: the three example drivers in `examples/` and the protocol surface each uses
- `protocol/`: the reference, split into `overview`, `commands`, `subscriptions`, `webview-api`, and `data-types`
- `docs.json`: theme, colors, navigation, navbar, redirects
- `favicon.svg`: drawdy.io's favicon, copied from `landing/public/favicon.svg` in the Drawdy repo
- `logo/light.svg` and `logo/dark.svg`: the Drawdy elle mark (`frontend/assets/icon/logo.svg` in the Drawdy repo) beside "DDP" set in Google Sans Flex SemiBold (Drawdy's font, from `landing/app/fonts/google-sans-flex.woff2`) and converted to SVG outlines. Regenerate with `pnpm --filter ddp-logo-tools generate <path-to-drawdy-repo> [weight]` from the repo root
- `theme.css`: maps Mintlify's grey scale to Drawdy's zinc neutrals and sets DM Mono for code; everything else about the theme lives in `docs.json`
- `AGENTS.md`: writing rules for people and agents who edit these pages
- `.mintignore`: files Mintlify must not build as pages

## Prerequisites

- Node.js 20.17 or newer
- pnpm 10

`pnpm install` at the repo root installs the `mint` CLI into this package, so you need no global install. A global `npm i -g mint` also works.

## Run locally

From the repo root:

```bash
pnpm install
pnpm docs:dev
```

Or run `pnpm dev` from this folder. The preview is at `http://localhost:3300` and reloads on save. If that port is busy, `mint` takes the next free one and prints the URL. The first run downloads the preview bundle into `~/.mintlify`. Search in the preview needs `mint login`.

## Validate

```bash
pnpm docs:validate
```

This is the one sanity check. It runs `mint validate` (a strict build: any warning fails) and `mint broken-links --check-anchors` (every internal link and `#anchor` must resolve). Run it before you push.

## Deploy

Mintlify builds and hosts the site from this folder on every push to `main`.

1. Sign in at [app.mintlify.com](https://app.mintlify.com) and install the Mintlify GitHub app on `drawdyio/drawdy-driver-protocol`.
2. Open [Git Settings](https://app.mintlify.com/settings/deployment/git-settings), turn on **docs.json is in a subdirectory**, enter `/docs` (no trailing slash), and save. Saving starts the first deployment.
3. Set a custom domain from the dashboard if you want one.

## Troubleshooting

- Blank or stale preview: run `pnpm update mint`, or delete `~/.mintlify` and start `pnpm docs:dev` again.
- Do not run `npm install` at the repo root. The examples use pnpm's `workspace:*` protocol, which npm cannot resolve.
