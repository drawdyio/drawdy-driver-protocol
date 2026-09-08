import type * as OrtNamespace from "onnxruntime-web";

declare global {
    const ort: typeof OrtNamespace;
    function importScripts(...urls: string[]): void;
}

export {};
