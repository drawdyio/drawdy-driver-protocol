import { useEffect, useRef, useState } from "react";
import {
    Attachment,
    AttachmentMeta,
    ChatEntry,
    DEFAULT_MODEL,
    DriverToWebview,
    ModelId,
    MODELS,
    Theme,
} from "../shared/messages";

const drawdy = acquireDrawdyApi();

type Item = ChatEntry | { role: "error"; text: string };

type PendingFile = Attachment & { id: string; previewUrl: string | null };

const API_KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 8;
const ACCEPT_FILES =
    "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.csv,.json,.ts,.tsx,.js,.py";

function applyTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
}

function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "this morning";
    if (hour < 18) return "this afternoon";
    return "this evening";
}

function isImage(mediaType: string): boolean {
    return mediaType.startsWith("image/");
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAttachment(file: File): Promise<Attachment> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const url = reader.result as string;
            resolve({
                name: file.name,
                mediaType: file.type || "text/plain",
                size: file.size,
                data: url.slice(url.indexOf(",") + 1),
            });
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export function App() {
    const [booted, setBooted] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [showConnect, setShowConnect] = useState(false);
    const [keyNotice, setKeyNotice] = useState<string | undefined>(undefined);
    const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
    const [items, setItems] = useState<Item[]>([]);
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState("Thinking…");

    useEffect(() => {
        const dispose = drawdy.onMessage((raw) => {
            const message = raw as DriverToWebview;
            switch (message?.type) {
                case "init": {
                    applyTheme(message.theme);
                    setBooted(true);
                    setApiKey(message.apiKey);
                    if (message.apiKey !== null) setShowConnect(false);
                    setKeyNotice(message.keyNotice);
                    setModel(message.model);
                    setItems(message.entries);
                    setRunning(message.running);
                    return;
                }
                case "theme": {
                    applyTheme(message.theme);
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

    if (!booted) {
        return (
            <div className="grid h-full place-items-center text-sm text-(--cc-text-subtle)">
                Loading…
            </div>
        );
    }

    if (apiKey === null || showConnect) {
        return (
            <ConnectPanel
                savedKey={apiKey}
                onConnect={(next) => {
                    if (next === apiKey) {
                        setShowConnect(false);
                        return;
                    }
                    drawdy.postMessage({ type: "set-api-key", apiKey: next });
                }}
            />
        );
    }

    return (
        <ChatPanel
            items={items}
            running={running}
            status={status}
            model={model}
            keyNotice={keyNotice}
            onModelChange={(next) => {
                setModel(next);
                drawdy.postMessage({ type: "set-model", model: next });
            }}
            onBack={() => setShowConnect(true)}
            onSend={(text, attachments) => {
                setItems((prev) => [
                    ...prev,
                    {
                        role: "user",
                        text,
                        attachments: attachments.map(
                            ({ name, mediaType, size }) => ({
                                name,
                                mediaType,
                                size,
                            })
                        ),
                    },
                ]);
                setRunning(true);
                setStatus("Thinking…");
                drawdy.postMessage({ type: "chat", text, attachments });
            }}
            onStop={() => drawdy.postMessage({ type: "stop" })}
        />
    );
}

function ConnectPanel({
    savedKey,
    onConnect,
}: {
    savedKey: string | null;
    onConnect: (apiKey: string) => void;
}) {
    const [value, setValue] = useState(savedKey ?? "");
    const [revealed, setRevealed] = useState(false);
    const [invalid, setInvalid] = useState(false);

    const submit = () => {
        const apiKey = value.trim();
        if (apiKey.length === 0) return;
        if (!API_KEY_PATTERN.test(apiKey)) {
            setInvalid(true);
            return;
        }
        onConnect(apiKey);
    };

    return (
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
            <div className="flex flex-col gap-2">
                <h1 className="text-base font-semibold text-(--cc-text)">
                    Connect your Anthropic API key
                </h1>
                <p className="text-sm leading-[1.6] tracking-[0.01em] text-(--cc-text-muted)">
                    To use Claude, you&apos;ll need an API key from Anthropic.
                </p>
            </div>

            <div className="flex flex-col gap-6">
                <ol className="list-decimal pl-5 text-sm font-medium leading-5 tracking-[0.01em] text-(--cc-text-muted)">
                    <li>
                        Go to{" "}
                        <span className="break-all text-(--cc-link) underline decoration-solid">
                            console.anthropic.com/settings/keys
                        </span>
                    </li>
                    <li>Create a new key</li>
                    <li>Paste it below</li>
                </ol>

                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="api-key"
                        className="text-sm font-medium leading-5 tracking-[0.01em] text-(--cc-text)"
                    >
                        Your API key
                    </label>
                    <div
                        className={`flex items-center gap-2 rounded-[10px] border bg-(--cc-field) py-2.5 pr-2.5 pl-3 shadow-[0_1px_2px_rgba(10,13,20,0.03)] transition-colors ${
                            invalid
                                ? "border-(--cc-error)"
                                : "border-(--cc-border) focus-within:border-(--cc-border-strong)"
                        }`}
                    >
                        <input
                            id="api-key"
                            type={revealed ? "text" : "password"}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="sk-ant-…"
                            aria-invalid={invalid}
                            className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-5 tracking-[0.01em] text-(--cc-text) outline-none placeholder:text-(--cc-text-subtle)"
                            value={value}
                            onChange={(e) => {
                                setValue(e.target.value);
                                setInvalid(false);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submit();
                            }}
                        />
                        <button
                            type="button"
                            aria-label={revealed ? "Hide key" : "Show key"}
                            aria-pressed={revealed}
                            className="grid size-5 shrink-0 cursor-pointer place-items-center text-(--cc-icon) transition-colors hover:text-(--cc-text)"
                            onClick={() => setRevealed((r) => !r)}
                        >
                            {revealed ? <EyeIcon /> : <EyeOffIcon />}
                        </button>
                    </div>
                    {invalid && (
                        <p
                            role="alert"
                            className="flex items-center gap-1 text-xs text-(--cc-error)"
                        >
                            <InfoIcon />
                            This key doesn&apos;t look right. Please try again.
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-auto flex flex-col gap-2">
                <div className="h-px w-full bg-(--cc-divider)" />
                <button
                    type="button"
                    className="flex h-9 w-full cursor-pointer items-center justify-center gap-1 rounded-[10px] bg-(--cc-claude) px-2.5 py-2 text-xs font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors hover:bg-(--cc-claude-hover) disabled:cursor-default disabled:opacity-50"
                    disabled={value.trim().length === 0}
                    onClick={submit}
                >
                    Connect
                </button>
            </div>
        </div>
    );
}

function ChatPanel({
    items,
    running,
    status,
    model,
    keyNotice,
    onModelChange,
    onBack,
    onSend,
    onStop,
}: {
    items: Item[];
    running: boolean;
    status: string;
    model: ModelId;
    keyNotice: string | undefined;
    onModelChange: (model: ModelId) => void;
    onBack: () => void;
    onSend: (text: string, attachments: Attachment[]) => void;
    onStop: () => void;
}) {
    const [input, setInput] = useState("");
    const [files, setFiles] = useState<PendingFile[]>([]);
    const [fileError, setFileError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const empty = items.length === 0 && !running;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [items, running]);

    useEffect(() => {
        return () => files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
        // Only on unmount; per-file URLs are revoked on removal below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addFiles = async (picked: FileList | null) => {
        if (!picked) return;
        const list = Array.from(picked);
        const room = MAX_FILES - files.length;
        if (list.length > room) {
            setFileError(`You can attach up to ${MAX_FILES} files.`);
        }
        const accepted = list.slice(0, Math.max(0, room));
        const tooBig = accepted.filter((f) => f.size > MAX_FILE_BYTES);
        if (tooBig.length > 0) {
            setFileError(
                `${tooBig[0].name} is larger than ${formatSize(MAX_FILE_BYTES)}.`
            );
        }
        const next = await Promise.all(
            accepted
                .filter((f) => f.size <= MAX_FILE_BYTES)
                .map(async (file) => ({
                    ...(await readAttachment(file)),
                    id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
                    previewUrl: isImage(file.type)
                        ? URL.createObjectURL(file)
                        : null,
                }))
        );
        setFiles((prev) => [...prev, ...next]);
    };

    const removeFile = (id: string) => {
        setFiles((prev) => {
            const target = prev.find((f) => f.id === id);
            if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((f) => f.id !== id);
        });
    };

    const canSend = (input.trim().length > 0 || files.length > 0) && !running;

    const send = () => {
        if (!canSend) return;
        const text = input.trim();
        const attachments = files.map(({ id: _id, previewUrl: _p, ...a }) => a);
        files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
        setInput("");
        setFiles([]);
        setFileError(null);
        onSend(text, attachments);
    };

    const rows = Math.min(5, Math.max(1, input.split("\n").length));

    return (
        <div className="relative flex h-full flex-col">
            <div className="flex items-center px-2 pt-1">
                <button
                    type="button"
                    title="API key"
                    aria-label="API key"
                    className="grid size-8 cursor-pointer place-items-center rounded-md text-(--cc-icon) transition-colors hover:bg-(--cc-chip) hover:text-(--cc-text)"
                    onClick={onBack}
                >
                    <ChevronLeftIcon />
                </button>
            </div>

            {keyNotice && (
                <div className="mx-4 mt-1 rounded-lg bg-(--cc-chip) px-3 py-2 text-xs text-(--cc-warning)">
                    {keyNotice}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3">
                {empty ? (
                    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                        <ClaudeIcon size={48} />
                        <p className="font-serif text-2xl leading-tight text-(--cc-text-muted)">
                            How can I help you
                            <br />
                            {greeting()}?
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {items.map((item, i) => (
                            <Bubble key={i} item={item} />
                        ))}
                        {running && (
                            <div className="flex items-center gap-2 py-1 text-xs text-(--cc-text-subtle)">
                                <span className="inline-block size-2 animate-pulse rounded-full bg-(--cc-claude)" />
                                {status}
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            <div className="p-4 pt-0">
                <div className="flex flex-col gap-2 rounded-[20px] bg-(--cc-composer) p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                    {files.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-1 pt-1">
                            {files.map((file) => (
                                <FileChip
                                    key={file.id}
                                    file={file}
                                    onRemove={() => removeFile(file.id)}
                                />
                            ))}
                        </div>
                    )}
                    {fileError && (
                        <p
                            role="alert"
                            className="flex items-center gap-1 px-1 text-xs text-(--cc-error)"
                        >
                            <InfoIcon />
                            {fileError}
                        </p>
                    )}
                    <textarea
                        rows={rows}
                        placeholder="Chat with Claude"
                        aria-label="Chat with Claude"
                        className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-5 text-(--cc-text) outline-none placeholder:text-(--cc-text-subtle)"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                send();
                            }
                        }}
                    />
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ACCEPT_FILES}
                            className="hidden"
                            onChange={(e) => {
                                setFileError(null);
                                void addFiles(e.target.files);
                                e.target.value = "";
                            }}
                        />
                        <button
                            type="button"
                            title="Attach files"
                            aria-label="Attach files"
                            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-(--cc-chip) text-(--cc-text) transition-colors hover:bg-(--cc-chip-hover) disabled:cursor-default disabled:opacity-40"
                            disabled={running || files.length >= MAX_FILES}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <PlusIcon />
                        </button>
                        <ModelPill model={model} onChange={onModelChange} />
                        <div className="flex-1" />
                        {running ? (
                            <button
                                type="button"
                                title="Stop"
                                aria-label="Stop"
                                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-(--cc-chip) text-(--cc-text) transition-colors hover:bg-(--cc-chip-hover)"
                                onClick={onStop}
                            >
                                <StopIcon />
                            </button>
                        ) : (
                            <button
                                type="button"
                                title="Send"
                                aria-label="Send"
                                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-(--cc-claude) text-white transition-colors hover:bg-(--cc-claude-hover) disabled:cursor-default disabled:opacity-40"
                                disabled={!canSend}
                                onClick={send}
                            >
                                <ArrowUpIcon />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FileChip({
    file,
    onRemove,
}: {
    file: PendingFile;
    onRemove: () => void;
}) {
    return (
        <div className="group relative flex max-w-full items-center gap-2 rounded-xl bg-(--cc-chip) p-1.5 pr-2 text-xs text-(--cc-text)">
            {file.previewUrl ? (
                <img
                    src={file.previewUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-lg object-cover"
                />
            ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--cc-bubble) text-(--cc-icon)">
                    <FileIcon />
                </span>
            )}
            <div className="min-w-0">
                <div className="max-w-40 truncate font-medium">{file.name}</div>
                <div className="text-(--cc-text-subtle)">
                    {formatSize(file.size)}
                </div>
            </div>
            <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="absolute -top-1.5 -right-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-(--cc-menu) text-(--cc-text-muted) shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-colors hover:text-(--cc-text)"
                onClick={onRemove}
            >
                <CloseIcon size={12} />
            </button>
        </div>
    );
}

function AttachmentList({ attachments }: { attachments: AttachmentMeta[] }) {
    return (
        <div className="flex flex-wrap justify-end gap-1.5">
            {attachments.map((a, i) => (
                <span
                    key={`${a.name}-${i}`}
                    className="flex max-w-full items-center gap-1 rounded-lg bg-(--cc-chip) px-2 py-1 text-xs text-(--cc-text-muted)"
                >
                    <FileIcon size={12} />
                    <span className="max-w-48 truncate">{a.name}</span>
                </span>
            ))}
        </div>
    );
}

function ModelPill({
    model,
    onChange,
}: {
    model: ModelId;
    onChange: (model: ModelId) => void;
}) {
    return (
        <div className="relative flex h-8 items-center rounded-full bg-(--cc-chip) transition-colors hover:bg-(--cc-chip-hover)">
            <select
                aria-label="Model"
                className="h-full cursor-pointer appearance-none bg-transparent pr-7 pl-3 text-sm font-medium text-(--cc-text) outline-none"
                value={model}
                onChange={(e) => onChange(e.target.value as ModelId)}
            >
                {MODELS.map((m) => (
                    <option
                        key={m.id}
                        value={m.id}
                        className="bg-(--cc-menu) text-(--cc-text)"
                    >
                        {m.label}
                    </option>
                ))}
            </select>
            <span className="pointer-events-none absolute right-2 text-(--cc-icon)">
                <ChevronDownIcon />
            </span>
        </div>
    );
}

function Bubble({ item }: { item: Item }) {
    if (item.role === "user") {
        return (
            <div className="ml-8 flex flex-col items-end gap-1.5 self-end">
                {item.attachments && item.attachments.length > 0 && (
                    <AttachmentList attachments={item.attachments} />
                )}
                {item.text.length > 0 && (
                    <div className="rounded-2xl rounded-br-md bg-(--cc-bubble) px-3 py-2 text-sm leading-5 whitespace-pre-wrap text-(--cc-text)">
                        {item.text}
                    </div>
                )}
            </div>
        );
    }
    if (item.role === "error") {
        return (
            <div className="mr-4 self-start rounded-2xl border border-(--cc-error) px-3 py-2 text-sm leading-5 whitespace-pre-wrap text-(--cc-error)">
                {item.text}
            </div>
        );
    }
    return (
        <div className="mr-4 self-start px-1 py-1 text-sm leading-6 whitespace-pre-wrap text-(--cc-text)">
            {item.text}
        </div>
    );
}

function ClaudeIcon({ size = 20 }: { size?: number }) {
    return (
        <svg
            viewBox="0 0 20 20"
            width={size}
            height={size}
            fill="none"
            aria-hidden
        >
            <path
                d="M7.66976 3.43944C7.49824 3.0964 7.0811 2.95735 6.73806 3.12888C6.39502 3.3004 6.25598 3.71753 6.4275 4.06057L8.38978 7.98513L5.1851 5.78192C4.86906 5.56464 4.43672 5.6447 4.21943 5.96075C4.00215 6.27679 4.08222 6.70914 4.39826 6.92642L8.19794 9.53868L3.78651 9.30653C3.40351 9.28639 3.07669 9.58049 3.05653 9.96347C3.03638 10.3465 3.33051 10.6733 3.71352 10.6935L7.73741 10.9053L4.75369 12.8944C4.43458 13.1072 4.34835 13.5383 4.56109 13.8574C4.77384 14.1765 5.205 14.2628 5.52412 14.0501L8.05338 12.3639L6.30992 14.8047C6.087 15.1168 6.15929 15.5505 6.47138 15.7734C6.78347 15.9963 7.21719 15.9241 7.44011 15.6119L9.5466 12.6628L8.96778 16.1358C8.90472 16.5142 9.16035 16.8719 9.53861 16.935C9.91694 16.9981 10.2747 16.7425 10.3378 16.3642L10.8947 13.0231L12.5408 15.5839C12.7483 15.9065 13.1779 15.9999 13.5006 15.7925C13.8232 15.5851 13.9166 15.1554 13.7092 14.8328L12.469 12.9036L14.3901 14.6769C14.6719 14.9371 15.1113 14.9195 15.3714 14.6377C15.6315 14.3559 15.614 13.9165 15.3322 13.6564L13.2241 11.7105L16.1639 12.078C16.5444 12.1256 16.8915 11.8556 16.9391 11.475C16.9867 11.0944 16.7167 10.7474 16.3362 10.6998L13.4265 10.3361L16.4091 9.63431C16.7824 9.54646 17.0138 9.17264 16.926 8.7993C16.8381 8.42594 16.4643 8.19451 16.091 8.28235L12.2097 9.19562L15.0599 5.56794C15.2969 5.26636 15.2445 4.82979 14.9429 4.59284C14.6414 4.35588 14.2048 4.40827 13.9678 4.70985L11.2899 8.11816L11.9014 4.20443C11.9606 3.8255 11.7015 3.47031 11.3225 3.4111C10.9435 3.3519 10.5884 3.61108 10.5292 3.99002L9.91389 7.92774L7.66976 3.43944Z"
                fill="var(--cc-claude)"
            />
        </svg>
    );
}

function EyeIcon() {
    return (
        <svg viewBox="0 0 20 20" width={20} height={20} fill="currentColor" aria-hidden>
            <path d="M10 3.25C14.044 3.25 17.4085 6.16 18.1143 10C17.4093 13.84 14.044 16.75 10 16.75C5.956 16.75 2.5915 13.84 1.88575 10C2.59075 6.16 5.956 3.25 10 3.25ZM10 15.25C11.5296 15.2497 13.0138 14.7301 14.2096 13.7764C15.4055 12.8226 16.2422 11.4912 16.5828 10C16.2409 8.50998 15.4037 7.18 14.208 6.22752C13.0122 5.27504 11.5287 4.7564 10 4.7564C8.47127 4.7564 6.98777 5.27504 5.79203 6.22752C4.5963 7.18 3.75908 8.50998 3.41725 10C3.75782 11.4912 4.59451 12.8226 5.79036 13.7764C6.98621 14.7301 8.4704 15.2497 10 15.25ZM10 13.375C9.10489 13.375 8.24645 13.0194 7.61352 12.3865C6.98058 11.7536 6.625 10.8951 6.625 10C6.625 9.10489 6.98058 8.24645 7.61352 7.61352C8.24645 6.98058 9.10489 6.625 10 6.625C10.8951 6.625 11.7536 6.98058 12.3865 7.61352C13.0194 8.24645 13.375 9.10489 13.375 10C13.375 10.8951 13.0194 11.7536 12.3865 12.3865C11.7536 13.0194 10.8951 13.375 10 13.375ZM10 11.875C10.4973 11.875 10.9742 11.6775 11.3258 11.3258C11.6775 10.9742 11.875 10.4973 11.875 10C11.875 9.50272 11.6775 9.02581 11.3258 8.67418C10.9742 8.32254 10.4973 8.125 10 8.125C9.50272 8.125 9.02581 8.32254 8.67418 8.67418C8.32254 9.02581 8.125 9.50272 8.125 10C8.125 10.4973 8.32254 10.9742 8.67418 11.3258C9.02581 11.6775 9.50272 11.875 10 11.875Z" />
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden>
            <path d="M17.882 19.297A10.949 10.949 0 0 1 12 21c-5.392 0-9.878-3.88-10.819-9a10.982 10.982 0 0 1 3.34-6.066L1.392 2.808l1.415-1.415 19.799 19.8-1.415 1.414-3.31-3.31zM5.935 7.35A8.965 8.965 0 0 0 3.223 12a9.005 9.005 0 0 0 13.201 5.838l-2.028-2.028A4.5 4.5 0 0 1 8.19 9.604L5.935 7.35zm6.979 6.978-3.242-3.242a2.5 2.5 0 0 0 3.241 3.241zm7.893 2.264-1.431-1.43A8.935 8.935 0 0 0 20.777 12 9.005 9.005 0 0 0 9.552 5.338L7.974 3.76C9.221 3.27 10.58 3 12 3c5.392 0 9.878 3.88 10.819 9a10.947 10.947 0 0 1-2.012 4.592zm-9.084-9.084a4.5 4.5 0 0 1 4.769 4.769l-4.77-4.769z" />
        </svg>
    );
}

function InfoIcon() {
    return (
        <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
            <path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
        </svg>
    );
}

function ChevronDownIcon() {
    return (
        <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
            <path d="M12 13.172l4.95-4.95 1.414 1.414L12 16 5.636 9.636 7.05 8.222l4.95 4.95z" />
        </svg>
    );
}

function ArrowUpIcon() {
    return (
        <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
            <path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z" />
        </svg>
    );
}

function StopIcon() {
    return (
        <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
    );
}





function FileIcon({ size = 18 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
            <path d="M9 2.003V2h10.998C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8l6-5.997zM5.83 8H9V4.83L5.83 8zM11 4v5a1 1 0 0 1-1 1H5v10h14V4h-8z" />
        </svg>
    );
}

function CloseIcon({ size = 18 }: { size?: number }) {
    return (
        <svg viewBox="0 0 18 18" width={size} height={size} fill="currentColor" aria-hidden>
            <path d="M9 8.04555L12.3413 4.7043L13.2957 5.65875L9.95445 9L13.2957 12.3413L12.3413 13.2957L9 9.95445L5.65875 13.2957L4.7043 12.3413L8.04555 9L4.7043 5.65875L5.65875 4.7043L9 8.04555Z" />
        </svg>
    );
}

function ChevronLeftIcon() {
    return (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
            <path d="M10.828 12l4.95 4.95-1.414 1.414L8 12l6.364-6.364 1.414 1.414-4.95 4.95z" />
        </svg>
    );
}
