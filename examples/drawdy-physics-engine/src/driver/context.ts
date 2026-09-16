import { DriverCommandIssuer } from "@drawdy/driver-protocol";

export type Ctx = {
    driverId: string;
    issueCommand: DriverCommandIssuer;
    generateId: () => string;
    nextRequestId: () => string;
};

/** Envelope fields to spread into every command. */
export function stamp(ctx: Ctx): { driverId: string; requestId: string } {
    return { driverId: ctx.driverId, requestId: ctx.nextRequestId() };
}

/** A command the host refused, as opposed to one that failed outright. */
export class CommandError extends Error {
    constructor(public readonly type: string, message?: string) {
        super(message ? `${type}: ${message}` : type);
        this.name = "CommandError";
    }

    get unauthorized(): boolean {
        return this.type === "unauthorized";
    }
}

/** Unwrap a command response, throwing the drawdy-side error if any. */
export function unwrap<V>(response: { res: { error?: any; value?: V } }): V {
    const { error, value } = response.res;
    if (error !== undefined) {
        throw new CommandError(
            typeof error?.type === "string" ? error.type : "runtime",
            typeof error?.message === "string" ? error.message : undefined
        );
    }
    return value as V;
}
