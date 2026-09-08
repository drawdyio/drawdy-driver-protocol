import {
    DriverCommandIssuer,
    ModuleStyling,
    ProtocolCommandError,
} from "@drawdy/driver-protocol";

export type DriverContext = {
    driverId: string;
    issueCommand: DriverCommandIssuer;
    generateId: () => string;
    nextRequestId: () => string;
    getStyling: () => ModuleStyling;
};

/** Unwrap a command response, throwing the drawdy-side error if there is one. */
export function unwrap<V>(response: {
    res: { error?: ProtocolCommandError; value?: V };
}): V {
    const { error, value } = response.res;
    if (error !== undefined) {
        throw new Error(error.message ?? error.type);
    }
    return value as V;
}
