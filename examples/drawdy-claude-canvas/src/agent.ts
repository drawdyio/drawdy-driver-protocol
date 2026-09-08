import { ModuleStyling } from "@drawdy/driver-protocol";
import {
    ApiMessage,
    callMessages,
    ContentBlock,
    ToolResultBlock,
    ToolUseBlock,
} from "./anthropic";
import { executeTool, TOOL_STATUS, TOOLS } from "./board-tools";
import { DriverContext } from "./driver-context";

// Bounds one user turn — each round is one API call plus its tool executions.
const MAX_ROUNDS = 16;

// Bounds what we resend: everything older is a settled exchange whose outcome
// is already reflected in the transcript text.
const MAX_CONTEXT_MESSAGES = 40;

export function buildSystemPrompt(styling: ModuleStyling): string {
    return [
        "You are Claude, an AI copilot embedded in drawdy, a collaborative infinite-canvas whiteboard. You chat with the user in a side panel and act on their board through tools.",
        "",
        "Coordinates are world units; x grows right, y grows down. Element geometry is reported as axis-aligned bounding rects.",
        'When reading the board, "path" elements are shapes/lines/arrows, "freedraw" is a hand-drawn stroke, "frame" is a section container.',
        "",
        "Guidance:",
        "- Look before you speak: use read_board (structure and text) or view_board (visual appearance) before making claims about the board.",
        "- When creating, place elements in empty space near related content, size them proportionate to their neighbors, and prefer a few well-arranged elements over many.",
        `- The user's UI theme is ${styling.theme}. Unless asked for specific colors, omit colors (theme default) or pick from: foreground ${styling.foreground}, primary ${styling.primary}, accent ${styling.accent}, success ${styling.success}, warning ${styling.warning}, destructive ${styling.destructive}.`,
        "- After creating or changing elements, zoom_to the result so the user sees it.",
        "- To point something out while you explain (rather than mark it permanently), use annotate — an ephemeral laser trail that fades. zoom_to it first if it might be off-screen.",
        "- Keep chat replies short; the board is the deliverable.",
        "- Reply in the user's language.",
    ].join("\n");
}

/**
 * One user turn: call the model, execute the tools it asks for, feed results
 * back, repeat until it stops asking. Mutates `messages` in place and
 * compacts turn-local screenshots out of it on the way out.
 */
export async function runTurn(args: {
    apiKey: string;
    model: string;
    system: string;
    messages: ApiMessage[];
    ctx: DriverContext;
    signal: AbortSignal;
    onAssistantText: (text: string) => void;
    onStatus: (label: string) => void;
}): Promise<void> {
    const { messages, ctx, signal } = args;
    try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
            args.onStatus("Thinking…");
            const result = await callMessages({
                apiKey: args.apiKey,
                model: args.model,
                system: args.system,
                messages: contextWindow(messages),
                tools: TOOLS,
                signal,
            });
            messages.push({ role: "assistant", content: result.content });

            for (const block of result.content) {
                if (block.type === "text" && block.text.trim().length > 0) {
                    args.onAssistantText(block.text.trim());
                }
            }

            const toolUses = result.content.filter(
                (b): b is ToolUseBlock => b.type === "tool_use"
            );
            if (result.stop_reason !== "tool_use" || toolUses.length === 0) {
                return;
            }

            const results: ToolResultBlock[] = [];
            for (const use of toolUses) {
                if (signal.aborted) {
                    throw new DOMException("stopped", "AbortError");
                }
                args.onStatus(TOOL_STATUS[use.name] ?? "Working…");
                results.push(await runTool(ctx, use));
            }
            messages.push({ role: "user", content: results });
        }
        args.onAssistantText(
            `I stopped after ${MAX_ROUNDS} steps — tell me to continue if you want me to keep going.`
        );
    } finally {
        sanitize(messages);
    }
}

/**
 * The window must not open mid tool-exchange: a leading tool_result without
 * its tool_use is an API error. Trim to the first plain user message.
 */
function contextWindow(messages: ApiMessage[]): ApiMessage[] {
    const window = messages.slice(-MAX_CONTEXT_MESSAGES);
    const start = window.findIndex(
        (m) =>
            m.role === "user" &&
            m.content.every((b) => b.type !== "tool_result")
    );
    return start <= 0 ? window : window.slice(start);
}

async function runTool(
    ctx: DriverContext,
    use: ToolUseBlock
): Promise<ToolResultBlock> {
    try {
        return {
            type: "tool_result",
            tool_use_id: use.id,
            content: await executeTool(ctx, use.name, use.input),
        };
    } catch (err) {
        return {
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: [
                {
                    type: "text",
                    text: err instanceof Error ? err.message : String(err),
                },
            ],
        };
    }
}

/**
 * Leave the history in a state the API accepts next turn: no trailing
 * tool_use awaiting a result (possible after an abort/error mid-round), and
 * no screenshots — they're only meaningful within the turn that took them,
 * and resending them every turn is pure cost.
 */
function sanitize(messages: ApiMessage[]): void {
    while (
        messages.length > 0 &&
        messages[messages.length - 1].role === "assistant" &&
        messages[messages.length - 1].content.some(
            (b) => b.type === "tool_use"
        )
    ) {
        messages.pop();
    }
    for (const message of messages) {
        for (const block of message.content) {
            if (block.type !== "tool_result") continue;
            block.content = block.content.map((inner) =>
                inner.type === "image"
                    ? {
                          type: "text" as const,
                          text: "[screenshot omitted from history]",
                      }
                    : inner
            );
        }
    }
}
