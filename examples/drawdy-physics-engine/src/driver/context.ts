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

/** Unwrap a command response, throwing the drawdy-side error if any. */
export function unwrap<V>(response: {
    res: { error?: string; value?: V };
}): V {
    const { error, value } = response.res;
    if (error !== undefined) {
        throw new Error(error);
    }
    return value as V;
}
