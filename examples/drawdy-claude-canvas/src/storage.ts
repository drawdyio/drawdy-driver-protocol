import { ChatEntry, DEFAULT_MODEL, ModelId, MODELS } from "../shared/messages";
import { DriverContext, unwrap } from "./driver-context";

const API_KEY_KEY = "anthropic-api-key";
const SETTINGS_KEY = "settings";
const CONVERSATION_KEY = "conversation";

// The display transcript is capped so kv writes stay small; the model's
// context is bounded separately in the agent.
const MAX_PERSISTED_ENTRIES = 200;

export async function loadApiKey(ctx: DriverContext): Promise<string | null> {
    const got = unwrap(
        await ctx.issueCommand({
            type: "command:secure-storage:get",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { key: API_KEY_KEY },
        })
    ).got;
    const apiKey = got?.["apiKey"];
    return typeof apiKey === "string" && apiKey.length > 0 ? apiKey : null;
}

export async function saveApiKey(
    ctx: DriverContext,
    apiKey: string
): Promise<void> {
    unwrap(
        await ctx.issueCommand({
            type: "command:secure-storage:set",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { key: API_KEY_KEY, payload: { apiKey } },
        })
    );
}

export async function deleteApiKey(ctx: DriverContext): Promise<void> {
    unwrap(
        await ctx.issueCommand({
            type: "command:secure-storage:delete",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { key: API_KEY_KEY },
        })
    );
}

export async function loadModel(ctx: DriverContext): Promise<ModelId> {
    try {
        const got = unwrap(
            await ctx.issueCommand({
                type: "command:kv-storage:get",
                driverId: ctx.driverId,
                requestId: ctx.nextRequestId(),
                req: { key: SETTINGS_KEY },
            })
        ).got;
        const model = got?.["model"];
        return MODELS.some((m) => m.id === model)
            ? (model as ModelId)
            : DEFAULT_MODEL;
    } catch {
        return DEFAULT_MODEL;
    }
}

export async function saveModel(
    ctx: DriverContext,
    model: ModelId
): Promise<void> {
    unwrap(
        await ctx.issueCommand({
            type: "command:kv-storage:set",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { key: SETTINGS_KEY, payload: { model } },
        })
    );
}

export async function loadConversation(
    ctx: DriverContext
): Promise<ChatEntry[]> {
    try {
        const got = unwrap(
            await ctx.issueCommand({
                type: "command:kv-storage:get",
                driverId: ctx.driverId,
                requestId: ctx.nextRequestId(),
                req: { key: CONVERSATION_KEY },
            })
        ).got;
        const entries = got?.["entries"];
        if (!Array.isArray(entries)) return [];
        return entries.filter(
            (e): e is ChatEntry =>
                typeof e === "object" &&
                e !== null &&
                (e.role === "user" || e.role === "assistant") &&
                typeof e.text === "string"
        );
    } catch {
        return [];
    }
}

export async function saveConversation(
    ctx: DriverContext,
    entries: ChatEntry[]
): Promise<void> {
    unwrap(
        await ctx.issueCommand({
            type: "command:kv-storage:set",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: {
                key: CONVERSATION_KEY,
                payload: { entries: entries.slice(-MAX_PERSISTED_ENTRIES) },
            },
        })
    );
}

export async function clearConversation(ctx: DriverContext): Promise<void> {
    unwrap(
        await ctx.issueCommand({
            type: "command:kv-storage:delete",
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req: { key: CONVERSATION_KEY },
        })
    );
}
