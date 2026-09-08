import { useEffect, useRef, useState } from "react";
import {
    ChatEntry,
    DEFAULT_MODEL,
    DriverToWebview,
    ModelId,
    MODELS,
} from "../shared/messages";

const drawdy = acquireDrawdyApi();

type Item = ChatEntry | { role: "error"; text: string };

export function App() {
    const [booted, setBooted] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [keyNotice, setKeyNotice] = useState<string | undefined>(undefined);
    const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
    const [items, setItems] = useState<Item[]>([]);
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState("Thinking…");
    const [showSettings, setShowSettings] = useState(false);
    const [input, setInput] = useState("");
    const [keyInput, setKeyInput] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const dispose = drawdy.onMessage((raw) => {
            const message = raw as DriverToWebview;
            switch (message?.type) {
                case "init": {
                    setBooted(true);
                    setHasApiKey(message.hasApiKey);
                    setKeyNotice(message.keyNotice);
                    setModel(message.model);
                    setItems(message.entries);
                    setRunning(message.running);
                    return;
                }
                case "turn-status": {
                    setStatus(message.label);
                    return;
                }
                case "assistant-message": {
                    setItems((prev) => [
                        ...prev,
                        { role: "assistant", text: message.text },
                    ]);
                    return;
                }
                case "turn-error": {
                    setItems((prev) => [
                        ...prev,
                        { role: "error", text: message.message },
                    ]);
                    return;
                }
                case "turn-done": {
                    setRunning(false);
                    return;
                }
            }
        });
        drawdy.postMessage({ type: "ready" });
        return dispose;
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [items, running]);

    const send = () => {
        const text = input.trim();
        if (text.length === 0 || running || !hasApiKey) return;
        setItems((prev) => [...prev, { role: "user", text }]);
        setInput("");
        setRunning(true);
        setStatus("Thinking…");
        drawdy.postMessage({ type: "chat", text });
    };

    const saveKey = () => {
        const apiKey = keyInput.trim();
        if (apiKey.length === 0) return;
        setKeyInput("");
        setShowSettings(false);
        drawdy.postMessage({ type: "set-api-key", apiKey });
    };

    if (!booted) {
        return (
            <div className="grid h-full place-items-center text-sm text-(--drawdy-muted-foreground)">
                Loading…
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center gap-2 border-b border-(--drawdy-border) px-4 py-3">
                <SparkIcon />
                <span className="flex-1 font-semibold">Claude</span>
                <select
                    aria-label="Model"
                    className="cursor-pointer rounded-(--drawdy-radius-sm) border border-(--drawdy-border) bg-(--drawdy-surface) px-1.5 py-1 text-xs text-(--drawdy-foreground)"
                    value={model}
                    onChange={(e) => {
                        const next = e.target.value as ModelId;
                        setModel(next);
                        drawdy.postMessage({ type: "set-model", model: next });
                    }}
                >
                    {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.label}
                        </option>
                    ))}
                </select>
                <IconButton
                    title="Clear conversation"
                    onClick={() => {
                        setItems([]);
                        setRunning(false);
                        drawdy.postMessage({ type: "clear-conversation" });
                    }}
                >
                    <BroomIcon />
                </IconButton>
                <IconButton
                    title="API key"
                    onClick={() => setShowSettings((s) => !s)}
                >
                    <KeyIcon />
                </IconButton>
            </header>

            {keyNotice && (
                <div className="border-b border-(--drawdy-border) bg-(--drawdy-surface) px-4 py-2 text-xs text-(--drawdy-warning)">
                    {keyNotice}
                </div>
            )}

            {(showSettings || !hasApiKey) && (
                <div className="flex flex-col gap-2 border-b border-(--drawdy-border) px-4 py-3">
                    {!hasApiKey && (
                        <p className="text-xs text-(--drawdy-muted-foreground)">
                            Paste your Anthropic API key to start. Get one at
                            console.anthropic.com. It is stored encrypted in
                            your drawdy account and only used from this
                            extension.
                        </p>
                    )}
                    <div className="flex gap-2">
                        <input
                            type="password"
                            placeholder="sk-ant-…"
                            className="min-w-0 flex-1 rounded-(--drawdy-radius-sm) border border-(--drawdy-border) bg-(--drawdy-surface) px-2 py-1.5 text-sm outline-none focus:border-(--drawdy-ring)"
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") saveKey();
                            }}
                        />
                        <button
                            className="cursor-pointer rounded-(--drawdy-radius-sm) bg-(--drawdy-primary) px-3 py-1.5 text-sm font-semibold text-(--drawdy-primary-foreground) transition-opacity hover:opacity-90 disabled:opacity-50"
                            disabled={keyInput.trim().length === 0}
                            onClick={saveKey}
                        >
                            Save
                        </button>
                    </div>
                    {hasApiKey && (
                        <button
                            className="cursor-pointer self-start text-xs text-(--drawdy-destructive) hover:underline"
                            onClick={() => {
                                setShowSettings(false);
                                drawdy.postMessage({ type: "clear-api-key" });
                            }}
                        >
                            Remove saved key
                        </button>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3">
                {items.length === 0 && !running ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <SparkIcon large />
                        <p className="text-sm text-(--drawdy-muted-foreground)">
                            Ask about the board, or ask for a diagram —<br />
                            Claude can read, see, and draw on the canvas.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {items.map((item, i) => (
                            <Bubble key={i} item={item} />
                        ))}
                        {running && (
                            <div className="flex items-center gap-2 py-1 text-xs text-(--drawdy-muted-foreground)">
                                <span className="inline-block size-2 animate-pulse rounded-full bg-(--drawdy-primary)" />
                                {status}
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            <div className="flex items-end gap-2 border-t border-(--drawdy-border) p-3">
                <textarea
                    rows={2}
                    placeholder={
                        hasApiKey ? "Message Claude…" : "Add your API key first"
                    }
                    disabled={!hasApiKey}
                    className="min-w-0 flex-1 resize-none rounded-(--drawdy-radius-md) border border-(--drawdy-border) bg-(--drawdy-surface) px-3 py-2 text-sm outline-none focus:border-(--drawdy-ring) disabled:opacity-50"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                />
                {running ? (
                    <button
                        title="Stop"
                        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-(--drawdy-radius-md) bg-(--drawdy-surface2) text-(--drawdy-foreground) transition-opacity hover:opacity-90"
                        onClick={() => drawdy.postMessage({ type: "stop" })}
                    >
                        <StopIcon />
                    </button>
                ) : (
                    <button
                        title="Send"
                        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-(--drawdy-radius-md) bg-(--drawdy-primary) text-(--drawdy-primary-foreground) transition-opacity hover:opacity-90 disabled:opacity-50"
                        disabled={input.trim().length === 0 || !hasApiKey}
                        onClick={send}
                    >
                        <SendIcon />
                    </button>
                )}
            </div>
        </div>
    );
}

function Bubble({ item }: { item: Item }) {
    if (item.role === "user") {
        return (
            <div className="ml-8 self-end rounded-(--drawdy-radius-lg) bg-(--drawdy-primary) px-3 py-2 text-sm whitespace-pre-wrap text-(--drawdy-primary-foreground)">
                {item.text}
            </div>
        );
    }
    if (item.role === "error") {
        return (
            <div className="mr-8 self-start rounded-(--drawdy-radius-lg) border border-(--drawdy-destructive) px-3 py-2 text-sm whitespace-pre-wrap text-(--drawdy-destructive)">
                {item.text}
            </div>
        );
    }
    return (
        <div className="mr-8 self-start rounded-(--drawdy-radius-lg) bg-(--drawdy-surface2) px-3 py-2 text-sm whitespace-pre-wrap text-(--drawdy-foreground)">
            {item.text}
        </div>
    );
}

function IconButton({
    title,
    onClick,
    children,
}: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            title={title}
            aria-label={title}
            className="grid size-8 cursor-pointer place-items-center rounded-(--drawdy-radius-sm) text-(--drawdy-muted-foreground) transition-colors hover:bg-(--drawdy-surface2) hover:text-(--drawdy-foreground)"
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function SparkIcon({ large }: { large?: boolean }) {
    const size = large ? 28 : 18;
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="var(--drawdy-primary)"
        >
            <path d="M12 2l1.8 6.1a3 3 0 0 0 2.1 2.1L22 12l-6.1 1.8a3 3 0 0 0-2.1 2.1L12 22l-1.8-6.1a3 3 0 0 0-2.1-2.1L2 12l6.1-1.8a3 3 0 0 0 2.1-2.1L12 2z" />
        </svg>
    );
}

function KeyIcon() {
    return (
        <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
            <path d="M10.758 11.828L18.607 3.98l1.414 1.414-1.414 1.414 2.474 2.475-1.414 1.415-2.475-2.475-1.414 1.414 2.121 2.121-1.414 1.415-2.121-2.122-2.192 2.192a5.002 5.002 0 0 1-7.708 6.294 5 5 0 0 1 6.294-7.708zm-.637 6.293A3 3 0 1 0 5.88 13.88a3 3 0 0 0 4.242 4.242z" />
        </svg>
    );
}

function BroomIcon() {
    return (
        <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
            <path d="M13.999 2v2h5v2h-1.279l-1.667 12.508A2 2 0 0 1 14.07 20H9.927a2 2 0 0 1-1.982-1.492L6.278 6H4.999V4h5V2h4zM8.296 6l1.631 12h4.145l1.63-12H8.296z" />
        </svg>
    );
}

function StopIcon() {
    return (
        <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
    );
}

function SendIcon() {
    return (
        <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor">
            <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
        </svg>
    );
}
