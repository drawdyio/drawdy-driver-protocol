/**
 * The API drawdy injects into every webview document as the global
 * `acquireDrawdyApi()`. Acquire it once; messages posted through it reach the
 * owning driver as events:webview:message.
 */
export type DrawdyWebviewApi = {
    /**
     * Send a driver-defined message. Buffered until the host connects, so it
     * is safe to call immediately.
     *
     * Large payloads (ArrayBuffer, ImageBitmap, ...) referenced inside
     * `message` can be listed in `transfer` to move them instead of copying —
     * they are re-transferred at every relay hop on the way to the driver.
     */
    postMessage(message: unknown, transfer?: Transferable[]): void;
    /**
     * Listen for messages the owning driver sends via
     * command:webview:post-message. Returns a dispose function.
     */
    onMessage(listener: (message: unknown) => void): () => void;
};
