# Drawdy Driver Protocol — docs

A [Mintlify](https://mintlify.com) site. Pages are the `.mdx` files in this folder; `docs.json` holds the config and navigation.

## Pages

- `intro.mdx` — introduction and model
- `quickstart.mdx` — build and run your first driver
- `protocol.mdx` — the full protocol reference (one long page)
- `docs.json` — theme, colors, navigation

## Prerequisites

Install the Mintlify CLI once:

```bash
npm install -g mint
```

## Run locally

```bash
npm run dev
```

This runs `mint dev`, a live-reloading local preview at `http://localhost:3000`. Check for broken links with `npm run check`.

## Deploy

Mintlify hosts the site. Connect this repository in the [Mintlify dashboard](https://dashboard.mintlify.com) and point it at this `docs/` folder; every push to the default branch rebuilds and deploys it. A custom domain can be set from the dashboard.
