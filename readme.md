# Drawdy Driver Protocol

This package defines the communication protocol between Drawdy extensions and the Drawdy app.

# Behaviors

[All requests have a corresponding response.](https://matklad.github.io/2023/10/12/lsp-could-have-been-better.html). Designs like vscode LSP's `Notification` does not guarantee a response. This makes it difficult for the callee to know whether the command was received and process or not. 

Requests on to Drawdy are guaranteed to be processed in the order they are received.