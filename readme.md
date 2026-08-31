# Drawdy Driver Protocol

This package defines the communication protocol between Drawdy extensions and the Drawdy app.

# Behaviors

[All requests have a corresponding response.](https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html). Designs like vscode LSP's `Notification` does not guarantee a response. This makes it difficult for the callee to know whether the command was received and process or not. 

Requests on to Drawdy are guaranteed to be processed in the order they are received.

# Documentation

The docs site lives in [`docs/`](docs/) and is built with [Mintlify](https://mintlify.com).

```bash
pnpm install       # also installs the mint CLI
pnpm docs:dev      # preview at http://localhost:3300
pnpm docs:validate # strict build + broken-link check; run before pushing
```

See [`docs/README.md`](docs/README.md) for deployment.
